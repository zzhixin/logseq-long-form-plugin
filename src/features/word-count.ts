import { getScopedContainer, isLongFormEnabled } from "../logseq-dom";
import { getSettings } from "../settings";
import { BlockEntity } from "../types";

const WORD_COUNT_UI_KEY = "lf-word-count";
const WORD_COUNT_CONTAINER_ID = "lf-word-count-root";

function stripFormatting(content: string): string {
  return content
    .replace(/#\.meta-block\b/g, "")
    .replace(/#\.indent-children\b/g, "")
    .replace(/#\.indent\b/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\(\(([^)]+)\)\)/g, "$1")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/[#*_`>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countVisibleWords(text: string): number {
  if (!text) return 0;

  const cjkMatches = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
  const latinText = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, " ");
  const latinTokens = latinText.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];

  return cjkMatches.length + latinTokens.length;
}

function flattenBlocks(blocks: BlockEntity[], includeMetaBlocks: boolean): string[] {
  const collected: string[] = [];

  const visit = (block: BlockEntity): void => {
    const isMeta = block.content.includes("#.meta-block");
    if (!isMeta || includeMetaBlocks) {
      collected.push(stripFormatting(block.content));
    }
    for (const child of block.children ?? []) {
      visit(child as BlockEntity);
    }
  };

  for (const block of blocks) visit(block);
  return collected;
}

async function getCurrentBlocks(): Promise<BlockEntity[]> {
  const currentPage = (await logseq.Editor.getCurrentPage()) as BlockEntity | null;
  if (currentPage?.name) {
    const tree = (await logseq.Editor.getCurrentPageBlocksTree()) as unknown as BlockEntity[] | null;
    if (tree) return tree;
  }

  const current = (await logseq.Editor.getCurrentBlock()) as BlockEntity | null;
  return current ? [current] : [];
}

function renderShell(): HTMLElement | null {
  const container = getScopedContainer();
  if (!container) return null;

  if (!parent?.document?.getElementById(WORD_COUNT_CONTAINER_ID)) {
    logseq.provideUI({
      key: WORD_COUNT_UI_KEY,
      path: "#app-container",
      template: `<div id="${WORD_COUNT_CONTAINER_ID}"></div>`,
      reset: true,
    });
  }

  return parent.document.getElementById(WORD_COUNT_CONTAINER_ID);
}

export async function updateWordCount(): Promise<void> {
  const host = renderShell();
  if (!host) return;

  if (!isLongFormEnabled()) {
    host.innerHTML = "";
    return;
  }

  const settings = getSettings();
  if (!settings.showWordCount) {
    host.innerHTML = "";
    return;
  }

  const blocks = await getCurrentBlocks();
  const includeMetaBlocks = Boolean(settings.showMetaBlocks);
  const text = flattenBlocks(blocks, includeMetaBlocks).join(" ").trim();
  const words = countVisibleWords(text);
  const goalRaw = Number(settings.wordCountGoal ?? 0);
  const goal = Number.isFinite(goalRaw) ? goalRaw : 0;
  const remaining = Math.max(goal - words, 0);
  const achieved = goal > 0 && words >= goal;

  host.innerHTML = `
    <div class="lf-word-count-widget ${achieved ? "is-achieved" : ""}">
      <span class="lf-word-count-label">Word</span>
      <strong class="lf-word-count-value">${words}</strong>
      ${goal > 0 ? `<span class="lf-word-count-goal">${achieved ? "Goal met" : `${remaining} left`}</span>` : ""}
    </div>
  `;
}

export function scheduleWordCountRefresh(): void {
  void updateWordCount();
}

export function registerWordCountListeners(): () => void {
  const parentDoc = parent?.document;
  if (!parentDoc) return () => undefined;

  const onInput = () => {
    void updateWordCount();
  };

  const onClick = () => {
    void updateWordCount();
  };

  parentDoc.addEventListener(
    "input",
    onInput,
    true,
  );

  parentDoc.addEventListener(
    "click",
    onClick,
    true,
  );

  return () => {
    parentDoc.removeEventListener("input", onInput, true);
    parentDoc.removeEventListener("click", onClick, true);
  };
}
