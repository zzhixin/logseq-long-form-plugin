import { getBlockElement } from "../logseq-dom";
import { BlockEntity } from "../types";

const META_TAG = "#.meta-block";

async function getCurrentBlock(): Promise<BlockEntity | null> {
  return (await logseq.Editor.getCurrentBlock()) as BlockEntity | null;
}

export async function createMetaBlock(): Promise<void> {
  const current = await getCurrentBlock();
  if (!current) {
    await logseq.UI.showMsg("Long Form Rebuild: place the cursor on a block first.", "warning");
    return;
  }

  const children = current.children ?? [];
  const existingMeta = children.find((child) => child.content.includes(META_TAG));
  if (existingMeta) {
    await logseq.Editor.editBlock(existingMeta.uuid);
    return;
  }

  const created = await logseq.Editor.insertBlock(current.uuid, META_TAG, {
    sibling: false,
    before: true,
    focus: true,
  });

  if (!created) {
    await logseq.UI.showMsg("Long Form Rebuild: failed to create a meta block.", "warning");
  }
}

export async function toggleCurrentMetaVisibility(): Promise<void> {
  const current = await getCurrentBlock();
  if (!current) return;

  const element = getBlockElement(current.uuid);
  if (!element) {
    await logseq.UI.showMsg("Long Form Rebuild: could not locate the active block in the DOM.", "warning");
    return;
  }

  element.classList.toggle("show-meta-block");
}

export async function toggleGlobalMetaVisibility(): Promise<void> {
  const next = !Boolean(logseq.settings?.showMetaBlocks);
  logseq.updateSettings({ showMetaBlocks: next });
  await logseq.UI.showMsg(
    `Long Form Rebuild: meta blocks ${next ? "shown" : "hidden"} globally.`,
    "success",
  );
}
