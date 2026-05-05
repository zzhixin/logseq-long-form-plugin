function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export async function insertInterstitialJournalStamp(): Promise<void> {
  const current = await logseq.Editor.getCurrentBlock();
  if (!current) {
    await logseq.UI.showMsg("Long Form Rebuild: place the cursor on a block first.", "warning");
    return;
  }

  const block = current as { uuid: string };
  await logseq.Editor.insertAtEditingCursor(`\ntime:: ${formatTime(new Date())}`);
  await logseq.Editor.insertBlock(block.uuid, "", { sibling: true, focus: true });
}
