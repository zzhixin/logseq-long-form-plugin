import { isLongFormEnabled } from "../logseq-dom";
import { BlockEntity } from "../types";
import { isHeadingBlock } from "./headings";

const ORDERED_LIST_ATTRIBUTE = "data-lf-ordered-list";
const UNORDERED_LIST_ATTRIBUTE = "data-lf-unordered-list";
const UNORDERED_PREFIX_ATTRIBUTE = "data-lf-unordered-prefix";
const UNORDERED_TEXT_ATTRIBUTE = "data-lf-unordered-text";
const LIST_DEPTH_STYLE_PROPERTY = "--lf-list-depth";
const LIST_DEBUG_PREFIX = "[long-form:list]";
const unorderedExitLocks = new Set<string>();
const ORDERED_LIST_TYPE_PROPERTIES = [
  "logseq.order-list-type",
  "logseq.orderListType",
  "logseq.order_list_type",
  "order-list-type",
  "orderListType",
] as const;

function isElementLike(target: EventTarget | null): target is Element {
  return Boolean(target && typeof target === "object" && "nodeType" in target && (target as Node).nodeType === Node.ELEMENT_NODE);
}

function isTextAreaLike(target: EventTarget | null): target is HTMLTextAreaElement {
  return Boolean(
    isElementLike(target) &&
      (target as Element).tagName === "TEXTAREA" &&
      "value" in target &&
      "selectionStart" in target &&
      "selectionEnd" in target,
  );
}

function getEventTextarea(event: Event): HTMLTextAreaElement | null {
  if (isTextAreaLike(event.target)) return event.target;

  const activeElement = parent?.document?.activeElement;
  return isTextAreaLike(activeElement) ? activeElement : null;
}

function normalizePropertyValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function readOrderedListTypeFromTree(block: BlockEntity | null | undefined): unknown {
  for (const key of ORDERED_LIST_TYPE_PROPERTIES) {
    const value = normalizePropertyValue(block?.properties?.[key]);
    if (value != null) return value;
  }

  return null;
}

async function readOrderedListTypeFromApi(blockId: string): Promise<unknown> {
  for (const key of ORDERED_LIST_TYPE_PROPERTIES) {
    const value = normalizePropertyValue(await logseq.Editor.getBlockProperty(blockId, key));
    if (value != null) return value;
  }

  return null;
}

function isOrderedListValue(value: unknown): boolean {
  return value === "number";
}

function isUnorderedListContent(content: string | null | undefined): boolean {
  return typeof content === "string" && /^-\s/.test(content);
}

function isEmptyUnorderedListContent(content: string | null | undefined): boolean {
  return typeof content === "string" && /^-\s*$/.test(content);
}

function removeUnorderedPrefix(content: string): string {
  return content.replace(/^-\s?/, "");
}

function debugList(message: string, details?: Record<string, unknown>): void {
  console.info(LIST_DEBUG_PREFIX, message, details ?? {});
}

function getActiveEditingContent(blockId: string): string | null {
  const activeElement = parent?.document?.activeElement;
  if (!isTextAreaLike(activeElement)) return null;
  if (!activeElement.closest(".block-editor")) return null;

  const activeBlockId = activeElement.closest<HTMLElement>(".ls-block[blockid]")?.getAttribute("blockid");
  return activeBlockId === blockId ? activeElement.value : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const view = textarea.ownerDocument.defaultView;
  const descriptor = view
    ? Object.getOwnPropertyDescriptor(view.HTMLTextAreaElement.prototype, "value")
    : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

  descriptor?.set?.call(textarea, value);
}

function clearEditingTextarea(textarea: HTMLTextAreaElement): void {
  setTextareaValue(textarea, "");
  textarea.setSelectionRange(0, 0);
  const view = textarea.ownerDocument.defaultView;
  const InputEventConstructor = view?.InputEvent ?? InputEvent;
  textarea.dispatchEvent(new InputEventConstructor("input", { bubbles: true, inputType: "deleteContentBackward" }));
}

async function clearBlockContent(blockId: string, textarea?: HTMLTextAreaElement, sync = false): Promise<void> {
  const activeTextarea = textarea ?? getActiveTextareaForBlock(blockId);
  if (activeTextarea) {
    clearEditingTextarea(activeTextarea);
  }

  await logseq.Editor.updateBlock(blockId, "");
  if (sync) {
    await logseq.Editor.editBlock(blockId, { pos: 0 });
    await syncOrderedListMarkers();
  }
}

function scheduleBlockClear(blockId: string, textarea: HTMLTextAreaElement): void {
  unorderedExitLocks.add(blockId);
  clearEditingTextarea(textarea);

  for (const delayMs of [0, 16, 48, 120, 260, 520]) {
    window.setTimeout(() => {
      void clearBlockContent(blockId, undefined, delayMs === 520);
    }, delayMs);
  }

  window.setTimeout(() => {
    unorderedExitLocks.delete(blockId);
  }, 700);
}

function getActiveTextareaForBlock(blockId: string): HTMLTextAreaElement | null {
  const activeElement = parent?.document?.activeElement;
  if (!isTextAreaLike(activeElement)) return null;
  if (!activeElement.closest(".block-editor")) return null;

  const activeBlockId = activeElement.closest<HTMLElement>(".ls-block[blockid]")?.getAttribute("blockid");
  return activeBlockId === blockId ? activeElement : null;
}

function getEffectiveBlockContent(block: BlockEntity): string {
  return getActiveEditingContent(block.uuid) ?? block.content;
}

function setListDepth(element: HTMLElement, depth: number | null): void {
  if (depth == null) {
    element.style.removeProperty(LIST_DEPTH_STYLE_PROPERTY);
    element.removeAttribute("data-lf-list-depth");
    return;
  }

  element.style.setProperty(LIST_DEPTH_STYLE_PROPERTY, String(depth));
  element.setAttribute("data-lf-list-depth", String(depth));
}

function clearOrderedListState(element: HTMLElement): void {
  element.removeAttribute(ORDERED_LIST_ATTRIBUTE);
  setListDepth(element, null);
}

function clearUnorderedListState(element: HTMLElement): void {
  element.removeAttribute(UNORDERED_LIST_ATTRIBUTE);
  element.removeAttribute(UNORDERED_PREFIX_ATTRIBUTE);
  element.removeAttribute(UNORDERED_TEXT_ATTRIBUTE);
  for (const wrapper of getBlockContentWrappers(element)) {
    wrapper.removeAttribute(UNORDERED_TEXT_ATTRIBUTE);
  }
}

function getBlockContentWrappers(element: HTMLElement): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      [
        ":scope > .block-main-container > .block-content-wrapper",
        ":scope > .block-main-container > .editor-wrapper",
        ":scope > .block-main-container > .block-content-or-editor-inner > .block-row > .block-content-wrapper",
        ":scope > .block-main-container > .block-content-or-editor-inner > .block-row > .editor-wrapper",
      ].join(", "),
    ),
  );
}

function setUnorderedListText(element: HTMLElement, content: string): void {
  const text = removeUnorderedPrefix(content);
  element.setAttribute(UNORDERED_TEXT_ATTRIBUTE, text);
  for (const wrapper of getBlockContentWrappers(element)) {
    wrapper.setAttribute(UNORDERED_TEXT_ATTRIBUTE, text);
  }
}

function markUnorderedEditingState(textarea: HTMLTextAreaElement): void {
  const block = textarea.closest<HTMLElement>(".ls-block[blockid]");
  if (!block) return;

  if (!isUnorderedListContent(textarea.value)) {
    clearUnorderedListState(block);
    return;
  }

  block.setAttribute(UNORDERED_LIST_ATTRIBUTE, "true");
  block.setAttribute(UNORDERED_PREFIX_ATTRIBUTE, "true");
  setUnorderedListText(block, textarea.value);
}

async function markListState(block: BlockEntity, listDepth = 0): Promise<void> {
  const element = parent?.document?.querySelector<HTMLElement>(`.ls-block[blockid="${block.uuid}"]`);
  if (!element) return;

  const treeValue = readOrderedListTypeFromTree(block);
  const apiValue = await readOrderedListTypeFromApi(block.uuid);
  const content = unorderedExitLocks.has(block.uuid) ? "" : getEffectiveBlockContent(block);

  if (isOrderedListValue(apiValue) || isOrderedListValue(treeValue)) {
    element.setAttribute(ORDERED_LIST_ATTRIBUTE, "true");
    clearUnorderedListState(element);
    setListDepth(element, listDepth);
    return;
  }

  clearOrderedListState(element);

  if (isUnorderedListContent(content)) {
    element.setAttribute(UNORDERED_LIST_ATTRIBUTE, "true");
    element.setAttribute(UNORDERED_PREFIX_ATTRIBUTE, "true");
    setUnorderedListText(element, content);
    setListDepth(element, listDepth);
    return;
  }

  clearUnorderedListState(element);
}

async function handleEmptyListExit(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = getEventTextarea(event);
  if (!target) return;
  if (!target.closest(".block-editor")) return;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!blockId) return;

  if (isEmptyUnorderedListContent(target.value)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await logseq.Editor.updateBlock(blockId, "");
    await logseq.Editor.editBlock(blockId, { pos: 0 });
    await syncOrderedListMarkers();
    return;
  }

  if (target.value.trim().length > 0) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  await logseq.Editor.insertBlock(blockId, "", { sibling: true, focus: true });
}

async function handleEmptyUnorderedListExit(event: KeyboardEvent): Promise<boolean> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return false;
  if (!isLongFormEnabled()) return false;

  const target = getEventTextarea(event);
  debugList("empty unordered enter check", {
    eventTargetType: event.target?.constructor?.name ?? null,
    textareaType: target?.constructor?.name ?? null,
    value: target?.value ?? null,
    selectionStart: target?.selectionStart ?? null,
    selectionEnd: target?.selectionEnd ?? null,
    inBlockEditor: target ? Boolean(target.closest(".block-editor")) : false,
    isEmptyUnordered: target ? isEmptyUnorderedListContent(target.value) : false,
  });
  if (!target) return false;
  if (!target.closest(".block-editor")) return false;
  if (!isEmptyUnorderedListContent(target.value)) return false;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!blockId) {
    debugList("empty unordered enter skipped: no block id");
    return false;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  debugList("empty unordered enter handled", { blockId, value: target.value });
  scheduleBlockClear(blockId, target);
  return true;
}

async function handleUnorderedListEnter(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = getEventTextarea(event);
  if (!target) return;
  if (!target.closest(".block-editor")) return;
  if (!isUnorderedListContent(target.value)) return;
  if (isEmptyUnorderedListContent(target.value)) return;
  if (target.selectionStart !== target.value.length || target.selectionEnd !== target.value.length) return;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!blockId) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const created = (await logseq.Editor.insertBlock(blockId, "-", { sibling: true, focus: true })) as BlockEntity | null;
  if (!created?.uuid) return;

  const insertedSpace = await insertSpaceAfterUnorderedMarker(created.uuid);
  if (!insertedSpace) return;

  await syncOrderedListMarkers();
}

async function insertSpaceAfterUnorderedMarker(blockId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await logseq.Editor.editBlock(blockId, { pos: 1 });
    await delay(attempt === 1 ? 16 : 32);

    const textarea = getActiveTextareaForBlock(blockId);
    if (!textarea) continue;

    try {
      await logseq.Editor.insertAtEditingCursor(" ");
      return true;
    } catch (error) {
      if (attempt === 8) {
        console.info("[long-form:list] unordered enter space insert failed", {
          blockId,
          attempt,
          textareaValue: textarea.value,
          selectionStart: textarea.selectionStart,
          selectionEnd: textarea.selectionEnd,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.info("[long-form:list] unordered enter space insert skipped: editor not ready", { blockId });
  return false;
}

async function handleHeadingEnter(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = getEventTextarea(event);
  if (!target) return;
  if (!target.closest(".block-editor")) return;
  if (target.selectionStart !== target.value.length || target.selectionEnd !== target.value.length) return;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!blockId) return;

  const current = (await logseq.Editor.getCurrentBlock()) as BlockEntity | null;
  if (!current || current.uuid !== blockId) return;

  const headingProperty = await logseq.Editor.getBlockProperty(blockId, "heading");
  const headingByProperty = headingProperty === true || typeof headingProperty === "number";
  const headingByMarkdown = /^#{1,6}\s+/.test(target.value);
  if (!headingByProperty && !headingByMarkdown && !isHeadingBlock(current)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  await logseq.Editor.insertBlock(blockId, "", { sibling: false, focus: true });
}

function onFocusIn(): void {
  void syncOrderedListMarkers();
}

function onInput(event: Event): void {
  const target = getEventTextarea(event);
  if (!target) return;
  if (!target.closest(".block-editor")) return;
  if (!isLongFormEnabled()) return;
  markUnorderedEditingState(target);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    const target = getEventTextarea(event);
    if (target && target.value.startsWith("-")) {
      debugList("enter observed", {
        value: target.value,
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd,
        blockId: target.closest<HTMLElement>(".ls-block[blockid]")?.getAttribute("blockid") ?? null,
      });
    }
  }

  if (isEmptyUnorderedListEnterEvent(event)) {
    void handleEmptyUnorderedListExit(event);
    return;
  }

  void handleUnorderedListEnter(event);
  void handleHeadingEnter(event);
  void handleEmptyListExit(event);
}

function isEmptyUnorderedListEnterEvent(event: KeyboardEvent): boolean {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return false;
  const target = getEventTextarea(event);
  return Boolean(target && target.closest(".block-editor") != null && isEmptyUnorderedListContent(target.value));
}

export function syncExistingListMarkers(): void {
  void syncOrderedListMarkers();
}

export async function syncOrderedListMarkers(): Promise<void> {
  const blocks = (await logseq.Editor.getCurrentPageBlocksTree()) as unknown as BlockEntity[] | null;

  const visit = async (block: BlockEntity, listDepth: number): Promise<void> => {
    const listType = readOrderedListTypeFromTree(block) ?? (await readOrderedListTypeFromApi(block.uuid));
    const isOrdered = isOrderedListValue(listType);
    const isUnordered = isUnorderedListContent(getEffectiveBlockContent(block));

    await markListState(block, listDepth);

    const nextDepth = isOrdered || isUnordered ? listDepth + 1 : listDepth;
    for (const child of block.children ?? []) {
      await visit(child as BlockEntity, nextDepth);
    }
  };

  for (const block of blocks ?? []) {
    await visit(block, 0);
  }
}

export function registerListEnhancements(): void {
  const parentDoc = parent?.document;
  if (!parentDoc) return;

  parentDoc.addEventListener("focusin", onFocusIn, true);
  parentDoc.addEventListener("input", onInput, true);
  parentDoc.addEventListener("keydown", onKeyDown, true);

  logseq.DB.onChanged(() => {
    void syncOrderedListMarkers();
  });
}
