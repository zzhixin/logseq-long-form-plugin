import { BlockEntity } from "../types";

let headingSyncInstalled = false;
let isNormalizingHeading = false;

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

function toHeadingLevel(value: number | boolean | null, content: string): number | null {
  if (typeof value === "number" && value >= 1 && value <= 6) return value;
  if (value === true) return detectMarkdownHeading(content) ?? 1;
  return null;
}

function stripMarkdownHeading(content: string): string {
  return content.replace(/^#{1,6}\s+/, "");
}

function detectMarkdownHeading(content: string): number | null {
  const match = content.match(/^(#{1,6})\s+/);
  return match ? match[1].length : null;
}

async function applyHeading(block: BlockEntity, value: number | boolean): Promise<void> {
  await logseq.Editor.upsertBlockProperty(block.uuid, "heading", value);

  const markdownLevel = detectMarkdownHeading(block.content);
  if (markdownLevel) {
    await logseq.Editor.updateBlock(block.uuid, stripMarkdownHeading(block.content));
  }

  const normalizedLevel = toHeadingLevel(value, block.content);
  if (normalizedLevel) {
    await normalizeHeadingIndent(block, normalizedLevel);
  }
}

async function clearHeading(block: BlockEntity): Promise<void> {
  await logseq.Editor.removeBlockProperty(block.uuid, "heading");
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

async function normalizeHeadingIndent(block: BlockEntity, level: number): Promise<void> {
  if (isNormalizingHeading) return;

  const currentDepth = await getBlockDepth(block);
  const targetDepth = Math.max(level - 1, 0);
  const delta = targetDepth - currentDepth;
  if (delta === 0) return;

  isNormalizingHeading = true;
  try {
    if (delta > 0) {
      for (let index = 0; index < delta; index += 1) {
        const previousSibling = (await logseq.Editor.getPreviousSiblingBlock(block.uuid)) as BlockEntity | null;
        if (!previousSibling) break;
        await logseq.Editor.moveBlock(block.uuid, previousSibling.uuid, { children: true });
      }
    } else {
      for (let index = 0; index < Math.abs(delta); index += 1) {
        const currentBlock = (await logseq.Editor.getBlock(block.uuid)) as BlockEntity | null;
        if (!currentBlock?.parent?.id || currentBlock.parent.id === currentBlock.page?.id) break;
        const parentBlock = (await logseq.Editor.getBlock(currentBlock.parent.id)) as BlockEntity | null;
        if (!parentBlock) break;
        await logseq.Editor.moveBlock(block.uuid, parentBlock.uuid, { before: false, children: false });
      }
    }
    const latestBlock = (await logseq.Editor.getBlock(block.uuid)) as BlockEntity | null;
    const cursorPos = latestBlock?.content?.length ?? block.content.length;
    await logseq.Editor.editBlock(block.uuid, { pos: cursorPos });
  } finally {
    isNormalizingHeading = false;
  }
}

function getHeadingLevel(block: BlockEntity): number | null {
  const heading = getHeadingValue(block);
  return toHeadingLevel(heading, block.content);
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
      await applyHeading(block, inferredLevel as 1 | 2 | 3 | 4 | 5 | 6);
    }
  }
}

export async function setHeadingLevel(level: 1 | 2 | 3 | 4 | 5 | 6): Promise<void> {
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

async function indentBodyUnderPreviousHeading(block: BlockEntity): Promise<void> {
  if (isNormalizingHeading || isHeadingBlock(block)) return;

  const previousSibling = (await logseq.Editor.getPreviousSiblingBlock(block.uuid)) as BlockEntity | null;
  if (!previousSibling || !isHeadingBlock(previousSibling)) return;

  isNormalizingHeading = true;
  try {
    await logseq.Editor.moveBlock(block.uuid, previousSibling.uuid, { children: true });
  } finally {
    isNormalizingHeading = false;
  }
}

export function registerHeadingSync(): void {
  if (headingSyncInstalled) return;
  headingSyncInstalled = true;

  logseq.DB.onChanged(({ blocks, txMeta }) => {
    if (!txMeta || isNormalizingHeading) return;

    if (txMeta.outlinerOp === "insert-blocks") {
      for (const changedBlock of blocks as unknown as BlockEntity[]) {
        setTimeout(() => {
          void indentBodyUnderPreviousHeading(changedBlock);
        }, 10);
      }
    }

    if (["save-block", "insert-blocks"].includes(txMeta.outlinerOp)) {
      for (const changedBlock of blocks as unknown as BlockEntity[]) {
        const headingLevel = getHeadingLevel(changedBlock);
        if (!headingLevel) continue;

        setTimeout(() => {
          void normalizeHeadingIndent(changedBlock, headingLevel);
        }, 10);
      }
    }
  });
}
