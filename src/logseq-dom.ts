import { getSettings } from "./settings";

export const LONG_FORM_CLASS = "lf-long-form";
export const KEEP_INDENTS_CLASS = "lf-keep-indents";
export const SHOW_META_CLASS = "lf-show-metas";

export type LongFormDisplayMode = "long-no-indent" | "long-indent" | "outline";

export function getScopedContainer(): HTMLElement | null {
  const parentDoc = parent?.document;
  if (!parentDoc) return null;

  const settings = getSettings();
  const selector = settings.enabledForRightSidebar ? "#app-container" : "#main-container";

  return parentDoc.querySelector<HTMLElement>(selector);
}

export function getBlockElement(uuid: string): HTMLElement | null {
  return parent?.document?.querySelector<HTMLElement>(`.ls-block[blockid="${uuid}"]`) ?? null;
}

export function setLongFormState(enabled: boolean): boolean {
  const container = getScopedContainer();
  if (!container) return false;
  container.classList.toggle(LONG_FORM_CLASS, enabled);
  if (!enabled) {
    container.classList.remove(KEEP_INDENTS_CLASS);
  }
  syncMetaVisibilityClass();
  return true;
}

export function isLongFormEnabled(): boolean {
  return getScopedContainer()?.classList.contains(LONG_FORM_CLASS) ?? false;
}

export function setLongFormDisplayMode(mode: LongFormDisplayMode): boolean {
  const container = getScopedContainer();
  if (!container) return false;

  container.classList.toggle(LONG_FORM_CLASS, mode !== "outline");
  container.classList.toggle(KEEP_INDENTS_CLASS, mode === "long-indent");
  syncMetaVisibilityClass();
  return true;
}

export function getLongFormDisplayMode(): LongFormDisplayMode {
  const container = getScopedContainer();
  if (!container?.classList.contains(LONG_FORM_CLASS)) return "outline";
  return container.classList.contains(KEEP_INDENTS_CLASS) ? "long-indent" : "long-no-indent";
}

export function syncMetaVisibilityClass(): void {
  const container = getScopedContainer();
  if (!container) return;
  container.classList.toggle(SHOW_META_CLASS, getSettings().showMetaBlocks);
}
