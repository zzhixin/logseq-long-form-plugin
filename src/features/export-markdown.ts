import { getSettings } from "../settings";
import { BlockEntity, ExportOptions } from "../types";

const EXPORT_DIALOG_KEY = "lf-export-dialog";
const EXPORT_DIALOG_ID = "lf-export-dialog-root";
const ORDER_LIST_PROPERTY_KEYS = [
  "logseq.order-list-type",
  "logseq.orderListType",
  "logseq.order_list_type",
  "order-list-type",
  "orderListType",
  "order_list_type",
] as const;

let exportDialogMarkdown = "";

function stripMetaMarkers(content: string): string {
  return content.replace(/\s*#\.meta-block\b/g, "").trim();
}

function stripIndentTags(content: string): string {
  return content
    .replace(/\s*#\.indent-children\b/g, "")
    .replace(/\s*#\.indent\b/g, "")
    .trim();
}

function stripOrderListProperties(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^\s*(?:logseq\.)?order[-_.]?list[-_.]?type::\s*\S+\s*$/i.test(line))
    .join("\n")
    .trim();
}

function normalizeContent(content: string): string {
  return stripOrderListProperties(stripIndentTags(stripMetaMarkers(content)));
}

function headingPrefix(block: BlockEntity): string {
  const heading = block.properties?.heading;
  if (heading === true) return "# ";
  if (typeof heading === "number" && heading >= 1 && heading <= 6) {
    return `${"#".repeat(heading)} `;
  }
  return "";
}

function stripMarkdownHeadingPrefix(line: string): string {
  return line.replace(/^#{1,6}\s+/, "");
}

function getOrderListType(block: BlockEntity): string | null {
  const properties = block.properties;
  if (!properties) return null;

  for (const key of ORDER_LIST_PROPERTY_KEYS) {
    const value = properties[key];
    if (typeof value === "string") return value;
  }

  return null;
}

function splitContentLines(content: string): string[] {
  return content.split("\n").map((line) => line.trimRight());
}

function linePrefix(line: string, depth: number): string {
  if (/^#{1,6}\s+/.test(line)) return "";
  if (/^\d+\.\s+/.test(line)) return `${"  ".repeat(depth)}`;
  if (/^[-*]\s+/.test(line)) return `${"  ".repeat(depth)}`;
  return `${"  ".repeat(depth)}`;
}

function renderLine(line: string, depth: number): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  return `${linePrefix(trimmed, depth)}${trimmed}`;
}

function renderOrderedListLine(line: string, depth: number): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (/^\d+\.\s+/.test(trimmed)) return `${"  ".repeat(depth)}${trimmed}`;
  return `${"  ".repeat(depth)}1. ${trimmed}`;
}

function blockToMarkdown(block: BlockEntity, depth: number, options: ExportOptions): string[] {
  const isMeta = block.content.includes("#.meta-block");
  if (isMeta && !options.includeMetaBlocks) return [];

  const normalized = normalizeContent(block.content);
  const heading = headingPrefix(block);
  const orderListType = getOrderListType(block);
  const childDepth = heading ? 0 : depth + 1;
  const contentLines = splitContentLines(normalized).filter((line) => line.trim().length > 0);
  const lines: string[] = [];

  if (contentLines.length > 0) {
    if (heading) {
      lines.push(`${heading}${stripMarkdownHeadingPrefix(contentLines[0].trim())}`);
      for (const line of contentLines.slice(1)) {
        lines.push(renderLine(line, childDepth));
      }
    } else if (isMeta) {
      for (const line of contentLines) {
        lines.push(`${"  ".repeat(depth)}> ${line.trim()}`);
      }
    } else {
      const [first, ...rest] = contentLines;
      lines.push(orderListType === "number" ? renderOrderedListLine(first, depth) : renderLine(first, depth));
      for (const line of rest) {
        lines.push(`${"  ".repeat(depth + 1)}${line.trim()}`);
      }
    }
  }

  for (const child of block.children ?? []) {
    lines.push(...blockToMarkdown(child as BlockEntity, childDepth, options));
  }

  return lines;
}

async function resolveCurrentRoot(): Promise<BlockEntity | null> {
  const currentPage = (await logseq.Editor.getCurrentPage()) as BlockEntity | null;
  if (currentPage?.name) {
    const tree = (await logseq.Editor.getCurrentPageBlocksTree()) as unknown as BlockEntity[] | null;
    return {
      ...currentPage,
      content: "",
      children: tree ?? [],
    };
  }

  return (await logseq.Editor.getCurrentBlock()) as BlockEntity | null;
}

async function buildCurrentMarkdown(): Promise<string> {
  const root = await resolveCurrentRoot();
  if (!root) return "";

  const includeMetaBlocks = Boolean(logseq.settings?.showMetaBlocks);
  const rootIsPage = Boolean(root.name);
  const lines = blockToMarkdown(root, rootIsPage ? 0 : 0, { includeMetaBlocks });
  if (rootIsPage && root.name) {
    lines.unshift("", `# ${root.name}`);
  }
  return lines.join("\n").trim();
}

function escapeHtml(markdown: string): string {
  return markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to a DOM-based copy fallback inside the Logseq host document.
    }
  }

  const doc = parent?.document ?? document;
  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.inset = "0";

  doc.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = doc.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

function renderExportDialog(markdown: string): void {
  exportDialogMarkdown = markdown;
  logseq.provideUI({
    key: EXPORT_DIALOG_KEY,
    path: "#app-container",
    reset: true,
    template: `
      <div id="${EXPORT_DIALOG_ID}" class="lf-export-overlay">
        <div class="lf-export-dialog">
          <div class="lf-export-header">
            <strong>Markdown Export</strong>
            <button class="lf-export-icon-btn" data-on-click="closeExportDialog" aria-label="Close">×</button>
          </div>
          <div class="lf-export-body">
            <textarea class="lf-export-textarea" readonly>${escapeHtml(markdown)}</textarea>
          </div>
          <div class="lf-export-actions">
            <button class="lf-export-primary" data-on-click="copyExportDialog">Copy</button>
            <button class="lf-export-secondary" data-on-click="closeExportDialog">Close</button>
          </div>
        </div>
      </div>
    `,
  });
}

export async function showExportDialog(): Promise<void> {
  if (getSettings().directExportToClipboard) {
    await exportCurrentToClipboard();
    return;
  }

  const markdown = await buildCurrentMarkdown();
  if (!markdown) {
    await logseq.UI.showMsg("Long Form Rebuild: no page or block available to export.", "warning");
    return;
  }

  renderExportDialog(markdown);
}

export function closeExportDialog(): void {
  logseq.provideUI({
    key: EXPORT_DIALOG_KEY,
    path: "#app-container",
    reset: true,
    template: "",
  });
  exportDialogMarkdown = "";
}

export async function copyExportDialog(): Promise<void> {
  if (!exportDialogMarkdown) return;
  try {
    await copyText(exportDialogMarkdown);
    await logseq.UI.showMsg("markdown has been copied into the clipboard", "success");
  } catch {
    await logseq.UI.showMsg("Long Form: failed to copy markdown.", "warning");
  }
}

export async function exportCurrentToClipboard(): Promise<void> {
  const markdown = await buildCurrentMarkdown();

  if (!markdown) {
    await logseq.UI.showMsg("Long Form Rebuild: nothing to export.", "warning");
    return;
  }

  try {
    await copyText(markdown);
    await logseq.UI.showMsg("markdown has been copied into the clipboard", "success");
  } catch {
    await logseq.UI.showMsg("Long Form: failed to copy markdown.", "warning");
  }
}
