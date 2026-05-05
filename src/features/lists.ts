import { getScopedContainer, isLongFormEnabled } from "../logseq-dom";
import { isHeadingBlock } from "./headings";
import { BlockEntity } from "../types";

const LIST_MARKER_ATTRIBUTE = "data-lf-ul";

function markListState(textarea: HTMLTextAreaElement): void {
  const block = textarea.closest<HTMLElement>(".ls-block[blockid]");
  if (!block) return;

  if (textarea.value.startsWith("- ")) {
    block.setAttribute(LIST_MARKER_ATTRIBUTE, "true");
  } else {
    block.removeAttribute(LIST_MARKER_ATTRIBUTE);
  }
}

async function handleEmptyListExit(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.closest(".block-editor")) return;
  if (target.value.trim().length > 0) return;

  const block = target.closest<HTMLElement>(".ls-block[blockid]");
  const blockId = block?.getAttribute("blockid");
  if (!blockId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  await logseq.Editor.insertBlock(blockId, "", { sibling: true, focus: true });
}

async function handleHeadingEnter(event: KeyboardEvent): Promise<void> {
  if (event.key !== "Enter" || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (!isLongFormEnabled()) return;

  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
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
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.closest(".block-editor")) return;
  markListState(target);
}

function onFocusIn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.closest(".block-editor")) return;
  markListState(target);
}

function onKeyDown(event: KeyboardEvent): void {
  void handleHeadingEnter(event);
  void handleEmptyListExit(event);
}

export function syncExistingListMarkers(): void {
  const container = getScopedContainer();
  if (!container) return;

  const textareas = container.querySelectorAll<HTMLTextAreaElement>(".block-editor textarea");
  textareas.forEach((textarea) => markListState(textarea));
}

export function registerListEnhancements(): void {
  const parentDoc = parent?.document;
  if (!parentDoc) return;

  parentDoc.addEventListener("input", onInput, true);
  parentDoc.addEventListener("focusin", onFocusIn, true);
  parentDoc.addEventListener("keydown", onKeyDown, true);
}
