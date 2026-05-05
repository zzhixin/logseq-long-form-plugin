import { getSettings } from "./settings";

export const LONG_FORM_CLASS = "lf-long-form";
export const SHOW_META_CLASS = "lf-show-metas";

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
  syncMetaVisibilityClass();
  return true;
}

export function isLongFormEnabled(): boolean {
  return getScopedContainer()?.classList.contains(LONG_FORM_CLASS) ?? false;
}

export function syncMetaVisibilityClass(): void {
  const container = getScopedContainer();
  if (!container) return;
  container.classList.toggle(SHOW_META_CLASS, getSettings().showMetaBlocks);
}
