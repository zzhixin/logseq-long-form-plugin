import {
  getLongFormDisplayMode,
  setLongFormDisplayMode,
  type LongFormDisplayMode,
} from "../logseq-dom";
import { getSettings } from "../settings";
import outlineIcon from "../../outline.svg?raw";
import documentIcon from "../../document.svg?raw";
import indentedDocumentIcon from "../../indented_document.svg?raw";

const TOOLBAR_TOGGLE_LABEL_ID = "lf-toolbar-toggle-label";

const modeIcons: Record<LongFormDisplayMode, string> = {
  "long-no-indent": documentIcon,
  "long-indent": indentedDocumentIcon,
  outline: outlineIcon,
};

const modeTitles: Record<LongFormDisplayMode, string> = {
  "long-no-indent": "Long Form: no indentation",
  "long-indent": "Long Form: keep indentation",
  outline: "Outline mode",
};

function isDisplayMode(value: unknown): value is LongFormDisplayMode {
  return value === "long-no-indent" || value === "long-indent" || value === "outline";
}

function getSavedDisplayMode(): LongFormDisplayMode {
  const mode = getSettings().displayMode;
  return isDisplayMode(mode) ? mode : getLongFormDisplayMode();
}

function getNextDisplayMode(mode: LongFormDisplayMode): LongFormDisplayMode {
  if (mode === "outline") return "long-no-indent";
  if (mode === "long-no-indent") return "long-indent";
  return "outline";
}

export function syncLongFormToolbarState(): void {
  const label = parent?.document?.getElementById(TOOLBAR_TOGGLE_LABEL_ID);
  if (!label) return;

  const mode = getLongFormDisplayMode();
  label.innerHTML = modeIcons[mode];
  label.setAttribute("aria-label", modeTitles[mode]);
  label.setAttribute("title", modeTitles[mode]);
}

export async function applySavedDisplayMode(): Promise<void> {
  const applied = setLongFormDisplayMode(getSavedDisplayMode());
  if (!applied) {
    await logseq.UI.showMsg("Long Form Rebuild: could not find the Logseq container.", "warning");
    return;
  }

  syncLongFormToolbarState();
}

export async function toggleLongFormMode(): Promise<void> {
  const nextMode = getNextDisplayMode(getLongFormDisplayMode());
  const applied = setLongFormDisplayMode(nextMode);
  if (!applied) {
    await logseq.UI.showMsg("Long Form Rebuild: could not find the Logseq container.", "warning");
    return;
  }

  await logseq.updateSettings({ displayMode: nextMode });
  syncLongFormToolbarState();
}
