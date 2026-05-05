import { getScopedContainer, isLongFormEnabled } from "../logseq-dom";
import { isHeadingBlock } from "./headings";
import { BlockEntity } from "../types";

const LIST_MARKER_ATTRIBUTE = "data-lf-ul";
const ORDERED_LIST_ATTRIBUTE = "data-lf-ordered-list";
const BULLET_LIST_ATTRIBUTE = "data-lf-bullet-list";
const LIST_DEPTH_STYLE_PROPERTY = "--lf-list-depth";
const ORDERED_LIST_TYPE_PROPERTIES = [
  "logseq.order-list-type",
  "logseq.orderListType",
  "logseq.order_list_type",
  "order-list-type",
  "orderListType",
] as const;
const LEGACY_BULLET_PROPERTY_KEYS = [
  "logseq.orderListType",
  "logseq.orderlisttype",
  "logseq.order_list_type",
  "orderListType",
  "order-list-type",
] as const;
const LIST_DEBUG_PREFIX = "[long-form:list]";
const BULLET_LOCK_FLUSH_DELAY_MS = 40;
let bulletBlockIds: Set<string> | null = null;
const bulletInputLocks = new WeakMap<
  HTMLTextAreaElement,
  { blockId: string; buffer: string; caretOffset: number; flushTimer: number | null }
>();

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

function describeEventTarget(target: EventTarget | null): Record<string, unknown> {
  if (!isElementLike(target)) {
    return { targetType: target?.constructor?.name ?? null };
  }

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const textarea = isTextAreaLike(target) ? target : null;

  return {
    targetType: target.constructor.name,
    tagName: target.tagName,
    className: target.className,
    blockId: block?.getAttribute("blockid") ?? null,
    inBlockEditor: Boolean(target.closest(".block-editor")),
    textareaValue: textarea?.value ?? null,
    selectionStart: textarea?.selectionStart ?? null,
    selectionEnd: textarea?.selectionEnd ?? null,
  };
}

function debugList(message: string, details?: Record<string, unknown>): void {
  console.debug(LIST_DEBUG_PREFIX, message, details ?? {});
}

function getBulletStorageKey(): string {
  return `${logseq.baseInfo.id}:bullet-blocks`;
}

function getStoredBulletBlockIds(): Set<string> {
  if (bulletBlockIds) return bulletBlockIds;

  try {
    const raw = localStorage.getItem(getBulletStorageKey());
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    bulletBlockIds = new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    bulletBlockIds = new Set();
  }

  return bulletBlockIds;
}

function persistBulletBlockIds(): void {
  localStorage.setItem(getBulletStorageKey(), JSON.stringify([...getStoredBulletBlockIds()]));
}

function rememberBulletBlock(blockId: string): void {
  const ids = getStoredBulletBlockIds();
  if (ids.has(blockId)) return;
  ids.add(blockId);
  persistBulletBlockIds();
}

function forgetBulletBlock(blockId: string): void {
  const ids = getStoredBulletBlockIds();
  if (!ids.delete(blockId)) return;
  persistBulletBlockIds();
}

function isPersistedBulletBlock(blockId: string): boolean {
  return getStoredBulletBlockIds().has(blockId);
}

async function removeLegacyBulletProperties(blockId: string): Promise<void> {
  for (const key of LEGACY_BULLET_PROPERTY_KEYS) {
    try {
      await logseq.Editor.removeBlockProperty(blockId, key);
    } catch {
      // Ignore missing or unsupported keys; this is just cleanup for legacy attempts.
    }
  }
}

async function persistBulletListState(blockId: string): Promise<void> {
  await removeLegacyBulletProperties(blockId);
  await syncOrderedListMarkers();
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const view = textarea.ownerDocument.defaultView;
  const descriptor = view
    ? Object.getOwnPropertyDescriptor(view.HTMLTextAreaElement.prototype, "value")
    : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

  descriptor?.set?.call(textarea, value);
}

function syncLockedTextarea(textarea: HTMLTextAreaElement): void {
  const lock = bulletInputLocks.get(textarea);
  if (!lock) return;

  setTextareaValue(textarea, lock.buffer);
  textarea.setSelectionRange(lock.caretOffset, lock.caretOffset);
}

function lockBulletTextarea(textarea: HTMLTextAreaElement, blockId: string): void {
  bulletInputLocks.set(textarea, { blockId, buffer: "", caretOffset: 0, flushTimer: null });
  syncLockedTextarea(textarea);
}

function appendLockedBulletInput(textarea: HTMLTextAreaElement, text: string): void {
  const lock = bulletInputLocks.get(textarea);
  if (!lock) return;
  const offset = Math.max(0, Math.min(lock.buffer.length, lock.caretOffset));
  lock.buffer = `${lock.buffer.slice(0, offset)}${text}${lock.buffer.slice(offset)}`;
  lock.caretOffset = offset + text.length;
  syncLockedTextarea(textarea);
}

function replaceLockedBulletInput(textarea: HTMLTextAreaElement, text: string): void {
  const lock = bulletInputLocks.get(textarea);
  if (!lock) return;
  lock.buffer = text.replace(/\s+/g, "");
  lock.caretOffset = lock.buffer.length;
  syncLockedTextarea(textarea);
}

function normalizeLockedInsertText(text: string): string {
  return text.replace(/\s+/g, "");
}

function backspaceLockedBulletInput(textarea: HTMLTextAreaElement): void {
  const lock = bulletInputLocks.get(textarea);
  if (!lock || lock.caretOffset === 0) return;

  const nextOffset = lock.caretOffset - 1;
  lock.buffer = `${lock.buffer.slice(0, nextOffset)}${lock.buffer.slice(lock.caretOffset)}`;
  lock.caretOffset = nextOffset;
  syncLockedTextarea(textarea);
}

function unlockBulletTextarea(textarea: HTMLTextAreaElement): { buffer: string; caretOffset: number } {
  const lock = bulletInputLocks.get(textarea);
  if (lock?.flushTimer != null) {
    clearTimeout(lock.flushTimer);
  }
  const buffer = lock?.buffer ?? "";
  const caretOffset = lock?.caretOffset ?? 0;
  bulletInputLocks.delete(textarea);
  return { buffer, caretOffset };
}

function scheduleLockedBulletFlush(textarea: HTMLTextAreaElement): void {
  const lock = bulletInputLocks.get(textarea);
  if (!lock) return;

  if (lock.flushTimer != null) {
    clearTimeout(lock.flushTimer);
  }

  lock.flushTimer = window.setTimeout(() => {
    void flushLockedBulletTextarea(textarea);
  }, BULLET_LOCK_FLUSH_DELAY_MS);
}

async function flushLockedBulletTextarea(textarea: HTMLTextAreaElement): Promise<void> {
  const lock = bulletInputLocks.get(textarea);
  if (!lock) return;

  const { blockId } = lock;
  const { buffer, caretOffset } = unlockBulletTextarea(textarea);
  await logseq.Editor.updateBlock(blockId, buffer);
  await persistBulletListState(blockId);
  await logseq.Editor.editBlock(blockId, { pos: caretOffset });
}

async function clearBulletListState(blockId: string): Promise<void> {
  forgetBulletBlock(blockId);
  await removeLegacyBulletProperties(blockId);

  const element = parent?.document?.querySelector<HTMLElement>(`.ls-block[blockid="${blockId}"]`);
  element?.removeAttribute(BULLET_LIST_ATTRIBUTE);
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

function isBulletListValue(value: unknown): boolean {
  return value === "bullet";
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

async function markOrderedListState(block: BlockEntity, listDepth = 0): Promise<void> {
  const element = parent?.document?.querySelector<HTMLElement>(`.ls-block[blockid="${block.uuid}"]`);
  if (!element) return;

  const treeValue = readOrderedListTypeFromTree(block);
  const apiValue = await readOrderedListTypeFromApi(block.uuid);

  if (isOrderedListValue(apiValue) || isOrderedListValue(treeValue)) {
    element.setAttribute(ORDERED_LIST_ATTRIBUTE, "true");
    element.removeAttribute(BULLET_LIST_ATTRIBUTE);
    setListDepth(element, listDepth);
  } else if (isBulletListValue(apiValue) || isBulletListValue(treeValue)) {
    rememberBulletBlock(block.uuid);
    await removeLegacyBulletProperties(block.uuid);
    element.setAttribute(BULLET_LIST_ATTRIBUTE, "true");
    element.removeAttribute(ORDERED_LIST_ATTRIBUTE);
    setListDepth(element, listDepth);
  } else if (isPersistedBulletBlock(block.uuid)) {
    element.setAttribute(BULLET_LIST_ATTRIBUTE, "true");
    element.removeAttribute(ORDERED_LIST_ATTRIBUTE);
    setListDepth(element, listDepth);
  } else {
    element.removeAttribute(ORDERED_LIST_ATTRIBUTE);
    element.removeAttribute(BULLET_LIST_ATTRIBUTE);
    setListDepth(element, null);
  }
}

async function normalizeBulletInput(textarea: HTMLTextAreaElement): Promise<void> {
  void textarea;
}

async function handleBulletBeforeInput(event: InputEvent): Promise<void> {
  const target = event.target;
  debugList("beforeinput observed", {
    inputType: event.inputType,
    data: event.data,
    ...describeEventTarget(target),
  });
  if (!isTextAreaLike(target)) return;
  if (!target.closest(".block-editor")) return;

  const activeLock = bulletInputLocks.get(target);
  if (activeLock) {
    debugList("beforeinput while locked", {
      inputType: event.inputType,
      data: event.data,
      blockId: activeLock.blockId,
      buffer: activeLock.buffer,
      caretOffset: activeLock.caretOffset,
    });
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.inputType === "insertCompositionText" && event.data != null) {
      replaceLockedBulletInput(target, event.data);
    } else if (event.inputType === "insertText" && event.data) {
      const normalized = normalizeLockedInsertText(event.data);
      if (normalized.length > 1) {
        replaceLockedBulletInput(target, normalized);
      } else if (normalized.length === 1) {
        appendLockedBulletInput(target, normalized);
      }
      scheduleLockedBulletFlush(target);
    } else if (event.inputType === "deleteContentBackward") {
      backspaceLockedBulletInput(target);
      scheduleLockedBulletFlush(target);
    }
    return;
  }

  if (event.inputType !== "insertText" || event.data !== " ") return;
  if (!isLongFormEnabled()) return;
  if (target.value !== "-" || target.selectionStart !== 1 || target.selectionEnd !== 1) return;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!block || !blockId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  debugList("beforeinput bullet intercept", {
    blockId,
    value: target.value,
    selectionStart: target.selectionStart,
    selectionEnd: target.selectionEnd,
  });

  block.removeAttribute(LIST_MARKER_ATTRIBUTE);
  block.setAttribute(BULLET_LIST_ATTRIBUTE, "true");
  rememberBulletBlock(blockId);
  lockBulletTextarea(target, blockId);
  await logseq.Editor.updateBlock(blockId, "");
  await logseq.Editor.editBlock(blockId, { pos: 0 });
  scheduleLockedBulletFlush(target);
}

function onCompositionEnd(event: CompositionEvent): void {
  const target = event.target;
  if (!isTextAreaLike(target)) return;

  const activeLock = bulletInputLocks.get(target);
  if (!activeLock) return;

  if (typeof event.data === "string" && event.data.length > 0) {
    replaceLockedBulletInput(target, normalizeLockedInsertText(event.data));
  }
  scheduleLockedBulletFlush(target);
}

async function handleEmptyListExit(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = event.target;
  if (!isTextAreaLike(target)) return;
  if (!target.closest(".block-editor")) return;
  if (target.value.trim().length > 0) return;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!blockId) return;

  if (isPersistedBulletBlock(blockId)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await clearBulletListState(blockId);
    await logseq.Editor.insertBlock(blockId, "", { sibling: true, focus: true });
    await syncOrderedListMarkers();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  await logseq.Editor.insertBlock(blockId, "", { sibling: true, focus: true });
}

async function handleBulletEnter(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = event.target;
  if (!isTextAreaLike(target)) return;
  if (!target.closest(".block-editor")) return;
  if (target.value.trim().length === 0) return;
  if (target.selectionStart !== target.value.length || target.selectionEnd !== target.value.length) return;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!blockId || !isPersistedBulletBlock(blockId)) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const created = (await logseq.Editor.insertBlock(blockId, "", { sibling: true, focus: true })) as BlockEntity | null;
  if (!created?.uuid) return;

  rememberBulletBlock(created.uuid);
  await syncOrderedListMarkers();
  await logseq.Editor.editBlock(created.uuid, { pos: 0 });
}

async function handleEmptyBulletBackspace(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Backspace" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = event.target;
  if (!isTextAreaLike(target)) return;
  if (!target.closest(".block-editor")) return;
  if (target.value.length > 0) return;
  if ((target.selectionStart ?? 0) !== 0 || (target.selectionEnd ?? 0) !== 0) return;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!blockId) return;

  const listType = await readOrderedListTypeFromApi(blockId);
  if (!isBulletListValue(listType) && !isPersistedBulletBlock(blockId)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  await clearBulletListState(blockId);
  await logseq.Editor.editBlock(blockId, { pos: 0 });
  await syncOrderedListMarkers();
}

async function handleHeadingEnter(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = event.target;
  if (!isTextAreaLike(target)) return;
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

function onInput(event: Event): void {
  const target = event.target;
  debugList("input event observed", describeEventTarget(target));
  if (!isTextAreaLike(target)) {
    debugList("input ignored: target is not textarea", describeEventTarget(target));
    return;
  }
  if (!target.closest(".block-editor")) {
    debugList("input ignored: target outside block editor", describeEventTarget(target));
    return;
  }
  void normalizeBulletInput(target);
}

function onBeforeInput(event: InputEvent): void {
  void handleBulletBeforeInput(event);
}

function onFocusIn(event: FocusEvent): void {
  void syncOrderedListMarkers();
}

function onKeyDown(event: KeyboardEvent): void {
  void handleEmptyBulletBackspace(event);
  void handleBulletEnter(event);
  void handleHeadingEnter(event);
  void handleEmptyListExit(event);
}

export function syncExistingListMarkers(): void {
  void syncOrderedListMarkers();
}

export async function syncOrderedListMarkers(): Promise<void> {
  const blocks = (await logseq.Editor.getCurrentPageBlocksTree()) as unknown as BlockEntity[] | null;

  const visit = async (block: BlockEntity, listDepth: number): Promise<void> => {
    const listType = readOrderedListTypeFromTree(block) ?? (await readOrderedListTypeFromApi(block.uuid));
    const isOrdered = isOrderedListValue(listType);
    const isBullet = isBulletListValue(listType) || isPersistedBulletBlock(block.uuid);

    await markOrderedListState(block, listDepth);

    const nextListDepth = isOrdered || isBullet ? listDepth + 1 : listDepth;
    for (const child of block.children ?? []) {
      await visit(child as BlockEntity, nextListDepth);
    }
  };

  for (const block of blocks ?? []) {
    await visit(block, 0);
  }
}

export function registerListEnhancements(): void {
  const parentDoc = parent?.document;
  if (!parentDoc) {
    debugList("register skipped: no parent document");
    return;
  }

  debugList("registering list listeners", {
    longFormEnabled: isLongFormEnabled(),
    hasBody: Boolean(parentDoc.body),
  });

  parentDoc.addEventListener("input", onInput, true);
  parentDoc.addEventListener("beforeinput", onBeforeInput, true);
  parentDoc.addEventListener("compositionend", onCompositionEnd, true);
  parentDoc.addEventListener("focusin", onFocusIn, true);
  parentDoc.addEventListener("keydown", onKeyDown, true);

  logseq.DB.onChanged(({ blocks }) => {
    for (const block of (blocks as unknown as BlockEntity[]) ?? []) {
      if (block.content === "-" || block.content === "- " || isBulletListValue(readOrderedListTypeFromTree(block))) {
        debugList("db changed block", {
          uuid: block.uuid,
          content: block.content,
          properties: block.properties ?? null,
        });
      }
    }
    void syncOrderedListMarkers();
  });
}
