import { isLongFormEnabled, setLongFormState } from "../logseq-dom";

const TOOLBAR_TOGGLE_LABEL_ID = "lf-toolbar-toggle-label";

export function syncLongFormToolbarState(): void {
  const label = parent?.document?.getElementById(TOOLBAR_TOGGLE_LABEL_ID);
  if (!label) return;

  const enabled = isLongFormEnabled();
  label.textContent = enabled ? "LF" : "OT";
  label.setAttribute("title", enabled ? "Long Form Mode On" : "Outline Mode");
}

export async function toggleLongFormMode(): Promise<void> {
  const enabled = setLongFormState(!isLongFormEnabled());
  if (!enabled) {
    await logseq.UI.showMsg("Long Form Rebuild: could not find the Logseq container.", "warning");
    return;
  }

  syncLongFormToolbarState();
}
