import { isLongFormEnabled } from "../logseq-dom";
import { isDebugLoggingEnabled } from "../settings";
import { BlockEntity } from "../types";

let headingSyncInstalled = false;
let isNormalizingHeading = false;
let headingSyncCleanup: (() => void) | null = null;

function debugHeading(message: string, details?: Record<string, unknown>): void {
  if (!isDebugLoggingEnabled()) return;
  console.info("[long-form:heading]", message, details ?? {});
}

type NormalizeStrategy = "absolute" | "contextual";
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
type EditingSnapshot = {
  blockId: string;
  content: string;
  cursorPos: number;
};

type HeadingPropertyChange = {
  blockId: number;
  heading: number | boolean | null;
  oldHeading: number | boolean | null;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isElementLike(value: unknown): value is Element {
  return Boolean(value && typeof value === "object" && "nodeType" in (value as unknown as Record<string, unknown>));
}

function isTextAreaLike(value: unknown): value is HTMLTextAreaElement {
  return Boolean(
    isElementLike(value) &&
      (value as Element).tagName === "TEXTAREA" &&
      "value" in (value as unknown as Record<string, unknown>) &&
      "selectionStart" in (value as unknown as Record<string, unknown>),
  );
}

async function getTargetBlocks(): Promise<BlockEntity[]> {
  const selected = (await logseq.Editor.getSelectedBlocks()) as BlockEntity[] | null;
  if (selected && selected.length > 0) return selected;

  const current = (await logseq.Editor.getCurrentBlock()) as BlockEntity | null;
  return current ? [current] : [];
}

function getHeadingValue(block: BlockEntity): number | boolean | null {
  const heading = block.properties?.heading;
  if (heading === true || typeof heading === "number") return heading;
  return null;
}

function detectMarkdownHeading(content: string): number | null {
  const match = content.match(/^(#{1,6})\s+/);
  return match ? match[1].length : null;
}

function stripMarkdownHeading(content: string): string {
  return content.replace(/^#{1,6}\s+/, "");
}

function hasMarkdownHeadingText(content: string): boolean {
  const level = detectMarkdownHeading(content);
  if (!level) return false;
  return stripMarkdownHeading(content).trim().length > 0;
}

function toHeadingLevel(value: number | boolean | null, content: string): number | null {
  if (typeof value === "number" && value >= 1 && value <= 6) return value;
  if (value === true) return detectMarkdownHeading(content) ?? 1;
  return null;
}

function getHeadingLevel(block: BlockEntity): number | null {
  return toHeadingLevel(getHeadingValue(block), block.content);
}

async function getBlockDepth(block: BlockEntity): Promise<number> {
  let depth = 0;
  let current: BlockEntity | null = block;

  while (current?.parent?.id != null && current.page?.id != null && current.parent.id !== current.page.id) {
    depth += 1;
    current = (await logseq.Editor.getBlock(current.parent.id)) as BlockEntity | null;
  }

  return depth;
}

async function collectHeadingContexts(block: BlockEntity): Promise<Array<{ depth: number; level: number }>> {
  const contexts: Array<{ depth: number; level: number }> = [];
  const seen = new Set<number>();
  const current = ((await logseq.Editor.getBlock(block.uuid)) as BlockEntity | null) ?? block;

  const appendContext = async (candidate: BlockEntity | null): Promise<void> => {
    if (!candidate || seen.has(candidate.id)) return;
    seen.add(candidate.id);

    const candidateLevel = getHeadingLevel(candidate);
    if (!candidateLevel) return;

    contexts.push({
      depth: await getBlockDepth(candidate),
      level: candidateLevel,
    });
  };

  const previousSibling = (await logseq.Editor.getPreviousSiblingBlock(current.uuid)) as BlockEntity | null;
  await appendContext(previousSibling);

  let parentId = current.parent?.id;
  while (parentId != null && parentId !== current.page?.id) {
    const parentBlock = (await logseq.Editor.getBlock(parentId)) as BlockEntity | null;
    if (!parentBlock) break;
    await appendContext(parentBlock);
    parentId = parentBlock.parent?.id;
  }

  return contexts;
}

async function resolveTargetHeadingDepth(
  block: BlockEntity,
  level: number,
  strategy: NormalizeStrategy,
): Promise<number> {
  if (strategy === "absolute") {
    return Math.max(level - 1, 0);
  }

  const contexts = await collectHeadingContexts(block);
  for (const context of contexts) {
    if (context.level === level) return context.depth;
    if (context.level < level) return context.depth + 1;
  }

  return 0;
}

function getActiveEditingSnapshot(blockId: string): EditingSnapshot | null {
  const activeElement = parent?.document?.activeElement;
  if (!isTextAreaLike(activeElement)) return null;
  if (!activeElement.closest(".block-editor")) return null;

  const activeBlockId = activeElement.closest<HTMLElement>(".ls-block[blockid]")?.getAttribute("blockid");
  if (activeBlockId !== blockId) return null;

  return {
    blockId,
    content: activeElement.value,
    cursorPos: activeElement.selectionStart ?? activeElement.value.length,
  };
}

async function invokeEditorCommand(command: string): Promise<void> {
  await logseq.App.invokeExternalCommand(command as Parameters<typeof logseq.App.invokeExternalCommand>[0]);
}

async function selectBlock(blockId: string): Promise<void> {
  await (logseq.Editor as typeof logseq.Editor & { selectBlock?: (srcBlock: string) => Promise<void> }).selectBlock?.(blockId);
}

async function reopenEditingBlock(snapshot: EditingSnapshot | null): Promise<void> {
  if (!snapshot) return;
  const isMarkerOnlyHeading = detectMarkdownHeading(snapshot.content) != null && !hasMarkdownHeadingText(snapshot.content);

  for (const waitMs of [0, 16, 48, 100]) {
    await delay(waitMs);
    try {
      await logseq.Editor.editBlock(snapshot.blockId, { pos: snapshot.cursorPos });
    } catch (error) {
      debugHeading("reopen editing block:edit failed", {
        blockId: snapshot.blockId,
        waitMs,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const live = await (
      logseq.Editor as typeof logseq.Editor & { getEditingBlockContent?: () => Promise<string | null> }
    ).getEditingBlockContent?.();
    if (live == null) continue;

    if (snapshot.content.endsWith(" ") && !live.endsWith(" ") && !isMarkerOnlyHeading) {
      try {
        await (
          logseq.Editor as typeof logseq.Editor & { insertAtEditingCursor?: (content: string) => Promise<void> }
        ).insertAtEditingCursor?.(" ");
      } catch (error) {
        debugHeading("reopen editing block:space restore failed", {
          blockId: snapshot.blockId,
          waitMs,
          liveContent: live,
          snapshotContent: snapshot.content,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (snapshot.content.endsWith(" ") && !live.endsWith(" ") && isMarkerOnlyHeading) {
      debugHeading("reopen editing block:skip space restore for marker-only heading", {
        blockId: snapshot.blockId,
        waitMs,
        liveContent: live,
        snapshotContent: snapshot.content,
      });
    }

    if (live.length >= snapshot.content.trimEnd().length) {
      break;
    }
  }
}

async function focusInsertedBlankBlock(blockId: string): Promise<void> {
  debugHeading("auto indent inserted body block:restore editor:start", { blockId });

  for (const waitMs of [0, 16, 48, 100]) {
    await delay(waitMs);
    await logseq.Editor.editBlock(blockId, { pos: 0 });

    const live = await (
      logseq.Editor as typeof logseq.Editor & { getEditingBlockContent?: () => Promise<string | null> }
    ).getEditingBlockContent?.();
    const cursorPos = typeof live === "string" ? live.length : 0;
    if (live != null) {
      await logseq.Editor.editBlock(blockId, { pos: cursorPos });
    }
    debugHeading("auto indent inserted body block:restore editor:attempt", {
      blockId,
      waitMs,
      liveContent: live,
      cursorPos,
    });

    if (live != null) {
      debugHeading("auto indent inserted body block:restore editor:done", {
        blockId,
        waitMs,
        cursorPos,
      });
      break;
    }
  }
}

async function restoreInsertedBlockEditing(snapshot: EditingSnapshot | null): Promise<void> {
  if (!snapshot) return;

  debugHeading("auto indent inserted body block:restore typed content:start", {
    blockId: snapshot.blockId,
    snapshotContent: snapshot.content,
    cursorPos: snapshot.cursorPos,
  });

  for (const waitMs of [0, 16, 48, 100]) {
    await delay(waitMs);

    const persistedBlock = (await logseq.Editor.getBlock(snapshot.blockId)) as BlockEntity | null;
    const persistedContent = typeof persistedBlock?.content === "string" ? persistedBlock.content : null;
    const liveBefore = await (
      logseq.Editor as typeof logseq.Editor & { getEditingBlockContent?: () => Promise<string | null> }
    ).getEditingBlockContent?.();

    if (snapshot.content.length > 0 && persistedContent !== snapshot.content) {
      await logseq.Editor.updateBlock(snapshot.blockId, snapshot.content);
    }

    await logseq.Editor.editBlock(snapshot.blockId, { pos: snapshot.cursorPos });

    const liveAfter = await (
      logseq.Editor as typeof logseq.Editor & { getEditingBlockContent?: () => Promise<string | null> }
    ).getEditingBlockContent?.();

    debugHeading("auto indent inserted body block:restore typed content:attempt", {
      blockId: snapshot.blockId,
      waitMs,
      persistedContent,
      liveBefore,
      liveAfter,
      snapshotContent: snapshot.content,
      cursorPos: snapshot.cursorPos,
    });

    if (liveAfter === snapshot.content) {
      debugHeading("auto indent inserted body block:restore typed content:done", {
        blockId: snapshot.blockId,
        waitMs,
        cursorPos: snapshot.cursorPos,
      });
      break;
    }
  }
}

async function runBlockCommand(blockId: string, command: "logseq.editor/indent" | "logseq.editor/outdent"): Promise<void> {
  debugHeading("run block command", { blockId, command });
  await selectBlock(blockId);
  await invokeEditorCommand(command);
}

function getBlockElement(blockId: string): HTMLElement | null {
  return parent?.document?.querySelector<HTMLElement>(`.ls-block[blockid="${blockId}"]`) ?? null;
}

async function autoIndentInsertedBodyBlock(changedBlocks: BlockEntity[]): Promise<void> {
  debugHeading("auto indent inserted body block:start", {
    changedBlocks: changedBlocks.map((block) => ({
      id: block.id,
      uuid: block.uuid,
      content: block.content,
      properties: block.properties ?? null,
    })),
  });
  const candidateBlocks = changedBlocks.filter((block) => typeof block.content === "string" && block.content.trim().length === 0);

  debugHeading("auto indent inserted body block:candidates", {
    candidates: candidateBlocks.map((block) => ({
      id: block.id,
      uuid: block.uuid,
      content: block.content,
      properties: block.properties ?? null,
    })),
  });

  for (const insertedBlock of candidateBlocks) {
    const currentBlockElement = getBlockElement(insertedBlock.uuid);
    const currentBlockId = currentBlockElement?.getAttribute("blockid");
    debugHeading("auto indent inserted body block:current block", {
      currentBlockId,
      currentBlockLevel: currentBlockElement?.getAttribute("level") ?? null,
      currentBlockClasses: currentBlockElement?.className ?? null,
      insertedContent: insertedBlock.content,
      insertedProperties: insertedBlock.properties ?? null,
    });
    if (!currentBlockId) continue;

    const previousBlock = (await logseq.Editor.getPreviousSiblingBlock(currentBlockId)) as BlockEntity | null;
    const previousBlockElement = previousBlock ? getBlockElement(previousBlock.uuid) : null;
    debugHeading("auto indent inserted body block:previous context", {
      currentBlockId,
      previousBlockId: previousBlock?.uuid ?? null,
      previousBlockContent: previousBlock?.content ?? null,
      previousHeadingLevel: previousBlock ? getHeadingLevel(previousBlock) : null,
      previousLevelAttr: previousBlockElement?.getAttribute("level") ?? null,
      previousClasses: previousBlockElement?.className ?? null,
    });

    if (previousBlock && getHeadingLevel(previousBlock) != null) {
      debugHeading("auto indent inserted body block:indent under previous heading", {
        currentBlockId,
        previousBlockId: previousBlock.uuid,
      });
      const editingSnapshot = getActiveEditingSnapshot(currentBlockId);
      debugHeading("auto indent inserted body block:editing snapshot before indent", {
        currentBlockId,
        snapshotContent: editingSnapshot?.content ?? null,
        cursorPos: editingSnapshot?.cursorPos ?? null,
      });
      await runBlockCommand(currentBlockId, "logseq.editor/indent");
      if (editingSnapshot && editingSnapshot.content.length > 0) {
        await restoreInsertedBlockEditing(editingSnapshot);
      } else {
        await focusInsertedBlankBlock(currentBlockId);
      }
      return;
    }

    const previousLevel = previousBlockElement?.getAttribute("level");
    const currentLevel = currentBlockElement?.getAttribute("level");
    debugHeading("auto indent inserted body block:level check", {
      currentBlockId,
      previousLevel,
      currentLevel,
    });
    if (!previousLevel && currentLevel && Number(currentLevel) > 1) {
      const editingSnapshot = getActiveEditingSnapshot(currentBlockId);
      debugHeading("auto indent inserted body block:editing snapshot before nested focus restore", {
        currentBlockId,
        snapshotContent: editingSnapshot?.content ?? null,
        cursorPos: editingSnapshot?.cursorPos ?? null,
      });
      debugHeading("auto indent inserted body block:focus already-nested blank block", {
        currentBlockId,
        currentLevel,
      });
      if (editingSnapshot && editingSnapshot.content.length > 0) {
        await restoreInsertedBlockEditing(editingSnapshot);
      } else {
        await focusInsertedBlankBlock(currentBlockId);
      }
      return;
    }
    if (!previousLevel || previousLevel === "1" || currentLevel !== "1") continue;

    const repeat = Number(previousLevel) - 1;
    debugHeading("auto indent inserted body block:repeat indent", {
      currentBlockId,
      repeat,
    });
    if (!Number.isFinite(repeat) || repeat <= 0) continue;
    const editingSnapshot = getActiveEditingSnapshot(currentBlockId);
    debugHeading("auto indent inserted body block:editing snapshot before repeated indent", {
      currentBlockId,
      snapshotContent: editingSnapshot?.content ?? null,
      cursorPos: editingSnapshot?.cursorPos ?? null,
    });

    for (let index = 0; index < repeat; index += 1) {
      await runBlockCommand(currentBlockId, "logseq.editor/indent");
    }
    if (editingSnapshot && editingSnapshot.content.length > 0) {
      await restoreInsertedBlockEditing(editingSnapshot);
    } else {
      await focusInsertedBlankBlock(currentBlockId);
    }
    return;
  }

  debugHeading("auto indent inserted body block:no matching inserted block", {
    count: candidateBlocks.length,
  });
}

async function normalizeCompletedHeadingBeforeInsertedBlocks(changedBlocks: BlockEntity[]): Promise<void> {
  debugHeading("normalize completed heading before inserted blocks:start", {
    changedBlocks: changedBlocks.map((block) => ({
      id: block.id,
      uuid: block.uuid,
      content: block.content,
      properties: block.properties ?? null,
    })),
  });

  const visited = new Set<string>();
  for (const insertedBlock of changedBlocks) {
    const currentBlockId = insertedBlock.uuid;
    if (!currentBlockId) continue;

    const previousBlock = (await logseq.Editor.getPreviousSiblingBlock(currentBlockId)) as BlockEntity | null;
    const headingLevel = previousBlock ? getHeadingLevel(previousBlock) : null;
    debugHeading("normalize completed heading before inserted blocks:previous context", {
      currentBlockId,
      previousBlockId: previousBlock?.uuid ?? null,
      previousBlockContent: previousBlock?.content ?? null,
      previousHeadingLevel: headingLevel,
      previousProperties: previousBlock?.properties ?? null,
    });

    if (!previousBlock?.uuid || headingLevel == null || visited.has(previousBlock.uuid)) continue;
    visited.add(previousBlock.uuid);

    debugHeading("normalize completed heading before inserted blocks:normalize previous heading", {
      blockId: previousBlock.uuid,
      content: previousBlock.content,
      headingLevel,
    });
    await normalizeHeadingIndent(previousBlock, headingLevel, "contextual", false);
  }
}

async function normalizeHeadingIndent(
  block: BlockEntity,
  level: number,
  strategy: NormalizeStrategy,
  restoreEditor = true,
): Promise<boolean> {
  if (isNormalizingHeading) return false;

  const latestBlock = ((await logseq.Editor.getBlock(block.uuid)) as BlockEntity | null) ?? block;
  const currentDepth = await getBlockDepth(latestBlock);
  const targetDepth = await resolveTargetHeadingDepth(latestBlock, level, strategy);
  const delta = targetDepth - currentDepth;
  if (delta === 0) return false;

  const editingSnapshot = restoreEditor ? getActiveEditingSnapshot(block.uuid) : null;

  isNormalizingHeading = true;
  try {
    if (delta > 0) {
      for (let index = 0; index < delta; index += 1) {
        const previousSibling = (await logseq.Editor.getPreviousSiblingBlock(block.uuid)) as BlockEntity | null;
        if (!previousSibling) break;
        await runBlockCommand(block.uuid, "logseq.editor/indent");
      }
    } else {
      for (let index = 0; index < Math.abs(delta); index += 1) {
        const currentBlock = (await logseq.Editor.getBlock(block.uuid)) as BlockEntity | null;
        if (!currentBlock?.parent?.id || currentBlock.parent.id === currentBlock.page?.id) break;
        await runBlockCommand(block.uuid, "logseq.editor/outdent");
      }
    }
  } finally {
    isNormalizingHeading = false;
  }

  if (editingSnapshot) {
    void reopenEditingBlock(editingSnapshot);
  }

  return true;
}

async function applyHeading(block: BlockEntity, value: number | boolean): Promise<void> {
  await logseq.Editor.upsertBlockProperty(block.uuid, "heading", value);

  const markdownLevel = detectMarkdownHeading(block.content);
  if (markdownLevel && hasMarkdownHeadingText(block.content)) {
    await logseq.Editor.updateBlock(block.uuid, stripMarkdownHeading(block.content));
  }

  const normalizedLevel = toHeadingLevel(value, block.content);
  if (normalizedLevel) {
    await normalizeHeadingIndent(block, normalizedLevel, "absolute");
  }
}

async function clearHeading(block: BlockEntity): Promise<void> {
  await logseq.Editor.removeBlockProperty(block.uuid, "heading");
}

export async function toggleAutoHeading(): Promise<void> {
  const blocks = await getTargetBlocks();
  if (blocks.length === 0) return;

  for (const block of blocks) {
    const heading = getHeadingValue(block);
    if (heading) {
      await clearHeading(block);
    } else {
      const markdownLevel = detectMarkdownHeading(block.content);
      const inferredLevel = markdownLevel ?? Math.min(Math.max((await getBlockDepth(block)) + 1, 1), 6);
      await applyHeading(block, inferredLevel as HeadingLevel);
    }
  }
}

export async function setHeadingLevel(level: HeadingLevel): Promise<void> {
  const blocks = await getTargetBlocks();
  if (blocks.length === 0) return;

  for (const block of blocks) {
    await applyHeading(block, level);
  }
}

export function isHeadingBlock(block: BlockEntity | null | undefined): boolean {
  if (!block) return false;
  return getHeadingLevel(block) !== null;
}

async function normalizeHeadingBlock(block: BlockEntity): Promise<boolean> {
  const headingLevel = getHeadingLevel(block);
  if (!headingLevel) return false;

  return normalizeHeadingIndent(block, headingLevel, "contextual", false);
}

async function normalizeHeadingBlocks(blocks: BlockEntity[]): Promise<number> {
  let normalizedCount = 0;

  for (const block of blocks) {
    const latestBlock = ((await logseq.Editor.getBlock(block.uuid)) as BlockEntity | null) ?? block;
    if (await normalizeHeadingBlock(latestBlock)) {
      normalizedCount += 1;
    }
  }

  return normalizedCount;
}

function flattenBlocks(blocks: BlockEntity[]): BlockEntity[] {
  const result: BlockEntity[] = [];

  const visit = (block: BlockEntity): void => {
    result.push(block);
    for (const child of block.children ?? []) {
      visit(child);
    }
  };

  for (const block of blocks) {
    visit(block);
  }

  return result;
}

export async function normalizeSelectedHeadings(): Promise<void> {
  await logseq.Editor.exitEditingMode?.(true);

  const blocks = await getTargetBlocks();
  if (blocks.length === 0) {
    logseq.UI.showMsg("No block selected");
    return;
  }

  const normalizedCount = await normalizeHeadingBlocks(blocks);
  logseq.UI.showMsg(
    normalizedCount > 0
      ? `Normalized ${normalizedCount} heading block${normalizedCount === 1 ? "" : "s"}`
      : "No heading blocks to normalize",
  );
}

export async function normalizeCurrentPageHeadings(): Promise<void> {
  await logseq.Editor.exitEditingMode?.(true);

  const pageBlocks = (await logseq.Editor.getCurrentPageBlocksTree()) as BlockEntity[] | null;
  const blocks = pageBlocks ? flattenBlocks(pageBlocks) : [];

  if (blocks.length === 0) {
    logseq.UI.showMsg("No page blocks to normalize");
    return;
  }

  const normalizedCount = await normalizeHeadingBlocks(blocks);
  logseq.UI.showMsg(
    normalizedCount > 0
      ? `Normalized ${normalizedCount} heading block${normalizedCount === 1 ? "" : "s"} on current page`
      : "No heading blocks to normalize on current page",
  );
}

async function syncChangedHeadingBlocks(blocks: BlockEntity[]): Promise<void> {
  for (const block of blocks) {
    const latestBlock = ((await logseq.Editor.getBlock(block.uuid)) as BlockEntity | null) ?? block;
    const headingLevel = getHeadingLevel(latestBlock);
    if (!headingLevel) continue;
    await normalizeHeadingIndent(latestBlock, headingLevel, "contextual", true);
  }
}

function extractHeadingPropertyChanges(txData: unknown): HeadingPropertyChange[] {
  if (!Array.isArray(txData)) return [];

  const changes = new Map<number, HeadingPropertyChange>();
  for (let index = txData.length - 1; index >= 0; index -= 1) {
    const entry = txData[index];
    if (!Array.isArray(entry) || entry.length < 5) continue;

    const [blockId, attribute, value, , added] = entry as [unknown, unknown, unknown, unknown, unknown];
    if (attribute !== "block/properties" || typeof blockId !== "number" || value == null || typeof value !== "object") {
      continue;
    }

    const headingValue = (value as Record<string, unknown>).heading;
    if (headingValue == null) continue;

    const normalizedHeading =
      headingValue === true || typeof headingValue === "number" ? (headingValue as number | boolean) : null;
    if (normalizedHeading == null) continue;

    if (changes.has(blockId)) {
      const current = changes.get(blockId)!;
      if (current.heading === normalizedHeading) {
        changes.delete(blockId);
      } else {
        current.oldHeading = normalizedHeading;
      }
      continue;
    }

    changes.set(blockId, {
      blockId,
      heading: added ? normalizedHeading : null,
      oldHeading: added ? null : normalizedHeading,
    });
  }

  return Array.from(changes.values());
}

async function resolveBlocksForHeadingChanges(
  blocks: BlockEntity[],
  changes: HeadingPropertyChange[],
): Promise<BlockEntity[]> {
  const result: BlockEntity[] = [];
  const seen = new Set<number>();

  for (const change of changes) {
    if (change.heading == null) continue;

    let block = blocks.find((candidate) => candidate.id === change.blockId) ?? null;
    if (!block) {
      block = (await logseq.Editor.getBlock(change.blockId)) as BlockEntity | null;
    }

    if (!block || seen.has(block.id)) continue;
    seen.add(block.id);
    result.push(block);
  }

  return result;
}

export function registerHeadingSync(): () => void {
  if (headingSyncInstalled) return headingSyncCleanup ?? (() => undefined);
  headingSyncInstalled = true;

  const unsubscribe = logseq.DB.onChanged((event) => {
    const { blocks = [], txData, txMeta } = event as {
      blocks?: BlockEntity[];
      txData?: unknown;
      txMeta?: {
        outlinerOp?: string;
        "transact?"?: boolean;
      };
    };

    if (!isLongFormEnabled()) return;
    if (isNormalizingHeading) return;

    const outlinerOp = txMeta?.outlinerOp;
    debugHeading("db changed received", {
      outlinerOp: outlinerOp ?? null,
      transact: txMeta?.["transact?"] ?? null,
      blocks: blocks.map((block) => ({
        id: block.id,
        uuid: block.uuid,
        content: block.content,
        heading: getHeadingValue(block),
        properties: block.properties ?? null,
      })),
    });
    const headingChanges = extractHeadingPropertyChanges(txData);
    debugHeading("heading changes extracted", {
      headingChanges,
    });

    if (!outlinerOp || !["save-block", "insert-blocks"].includes(outlinerOp)) return;
    if (txMeta?.["transact?"] === false) return;

    if (outlinerOp === "save-block") {
      debugHeading("db changed save-block:skip auto normalize until enter", {
        blocks: blocks.map((block) => ({
          id: block.id,
          uuid: block.uuid,
          content: block.content,
          heading: getHeadingLevel(block),
        })),
        headingChanges,
      });
      return;
    }

    if (outlinerOp === "insert-blocks") {
      window.setTimeout(() => {
        debugHeading("db changed insert-blocks timeout fired", {
          blocks: blocks.map((block) => ({
            id: block.id,
            uuid: block.uuid,
            content: block.content,
          })),
        });
        void normalizeCompletedHeadingBeforeInsertedBlocks(blocks).then(() => autoIndentInsertedBodyBlock(blocks));
      }, 50);
      return;
    }

    if (headingChanges.length === 0) return;

    void resolveBlocksForHeadingChanges(blocks, headingChanges).then((changedBlocks) => {
      debugHeading("resolved blocks for heading changes", {
        changedBlocks: changedBlocks.map((block) => ({
          id: block.id,
          uuid: block.uuid,
          content: block.content,
          heading: getHeadingLevel(block),
        })),
      });
      if (changedBlocks.length === 0) return;
      void syncChangedHeadingBlocks(changedBlocks);
    });
  });

  headingSyncCleanup = () => {
    headingSyncInstalled = false;
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
    headingSyncCleanup = null;
  };

  return headingSyncCleanup;
}
