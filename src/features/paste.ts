import { autoHeadingSpecificBlocks } from "./headings";
import { getSettings, isDebugLoggingEnabled } from "../settings";
import type { BlockEntity } from "../types";

type ParsedTextSegment = {
  type: "text";
  content: string;
};

type ParsedImageSegment = {
  type: "image";
  mimeType: string;
  extension: string;
  base64Data: string;
  originalSource: string;
  alt?: string;
};

type ParsedSegment = ParsedTextSegment | ParsedImageSegment;

type SavedImage = {
  markdownPath: string;
  assetPath: string;
  mimeType: string;
  extension: string;
  alt?: string;
  renderedWidth?: number;
  renderedHeight?: number;
};

type ParseClipboardResult = {
  segments: ParsedSegment[];
  hasImages: boolean;
};

const GRAPH_ASSET_FOLDER = "assets";
const PASTE_DEBUG_PREFIX = "[long-form:paste]";
const IMAGE_MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
const IMAGE_DATA_URL_PATTERN =
  /data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)/gi;

type PasteCleanupWindow = Window &
  typeof globalThis & {
    __lfPasteCleanup?: () => void;
  };

type MatchCandidate = {
  start: number;
  end: number;
  originalSource: string;
  alt?: string;
  mimeType: string;
  base64Data: string;
  extension: string;
};

function debugPaste(message: string, details?: Record<string, unknown>): void {
  if (!isDebugLoggingEnabled()) return;
  console.info(PASTE_DEBUG_PREFIX, message, details ?? {});
}

export function registerPasteHandler(): () => void {
  const parentDoc = parent?.document;
  if (!parentDoc) return () => undefined;

  const cleanupWindow = getPasteCleanupWindow();
  cleanupWindow.__lfPasteCleanup?.();

  const onPaste = (event: ClipboardEvent) => {
    void handlePasteEvent(event);
  };

  parentDoc.addEventListener("paste", onPaste, true);

  const cleanup = () => {
    parentDoc.removeEventListener("paste", onPaste, true);
    if (cleanupWindow.__lfPasteCleanup === cleanup) {
      delete cleanupWindow.__lfPasteCleanup;
    }
  };

  cleanupWindow.__lfPasteCleanup = cleanup;
  return cleanup;
}

function isEditingPasteTarget(target: EventTarget | null): boolean {
  return Boolean(closestElement(target, ".block-editor"));
}

async function handlePasteEvent(event: ClipboardEvent): Promise<void> {
  if (!isEditingPasteTarget(event.target)) return;

  const clipboardData = event.clipboardData;
  if (!clipboardData) return;

  const items = Array.from(clipboardData.items ?? []);
  const hasStandaloneImage = items.some((item) => item.kind === "file" && item.type.startsWith("image/"));
  const plainText = clipboardData.getData("text/plain") ?? "";
  const htmlText = clipboardData.getData("text/html") ?? "";
  const clipboardText = plainText || (containsBase64Image(htmlText) ? htmlText : "");
  const hasText = clipboardText.length > 0;

  debugPaste("paste event observed", {
    hasStandaloneImage,
    hasText,
    itemTypes: items.map((item) => `${item.kind}:${item.type}`),
    plainTextLength: plainText.length,
    htmlTextLength: htmlText.length,
    textPreview: clipboardText.slice(0, 120),
    textLength: clipboardText.length,
    containsBase64: containsBase64Image(clipboardText),
  });

  if (hasStandaloneImage && !hasText) {
    debugPaste("standalone image detected, letting Logseq handle native paste");
    return;
  }

  if (!hasText) return;

  if (shouldUseNativeLogseqPaste(plainText)) {
    debugPaste("logseq-style dashed lines detected, letting Logseq handle native paste");
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();

  if (!containsBase64Image(clipboardText)) {
    const affectedBlocks = await insertPlainTextFallback(clipboardText);
    await autoHeadingSpecificBlocks(affectedBlocks);
    return;
  }

  const result = parseClipboardText(clipboardText);
  if (!result.hasImages) {
    const affectedBlocks = await insertPlainTextFallback(clipboardText);
    await autoHeadingSpecificBlocks(affectedBlocks);
    return;
  }

  await processBase64Paste(result.segments, clipboardText);
}

function closestElement(target: EventTarget | null, selector: string): Element | null {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  return candidate?.closest?.(selector) ?? null;
}

function getPasteCleanupWindow(): PasteCleanupWindow {
  return (window.top ?? window.parent ?? window) as PasteCleanupWindow;
}

function shouldUseNativeLogseqPaste(text: string): boolean {
  const nonEmptyLines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimStart())
    .filter((line) => line.length > 0);

  return nonEmptyLines.length > 0 && nonEmptyLines.every((line) => line.startsWith("-"));
}

async function processBase64Paste(segments: ParsedSegment[], rawText: string): Promise<void> {
  try {
    const images = segments.filter((segment): segment is ParsedImageSegment => segment.type === "image");
    const savedImages: SavedImage[] = [];

    for (const image of images) {
      const savedImage = await saveBase64Image(image);
      savedImages.push(savedImage);
      debugPaste("saved image", savedImage);
    }

    const affectedBlocks = await insertTransformedSegments(segments, savedImages);
    await autoHeadingSpecificBlocks(affectedBlocks);

    await logseq.UI.showMsg(`Converted and inserted ${savedImages.length} pasted image reference(s).`, "success", {
      timeout: 2500,
    });
  } catch (error) {
    console.error("long-form paste: failed to transform pasted base64 images", error);
    await logseq.UI.showMsg("Base64 image conversion failed. Falling back to plain text paste.", "warning", {
      timeout: 3000,
    });
    const affectedBlocks = await insertPlainTextFallback(rawText);
    await autoHeadingSpecificBlocks(affectedBlocks);
  }
}

async function insertTransformedSegments(segments: ParsedSegment[], savedImages: SavedImage[]): Promise<BlockEntity[]> {
  const content = renderSegmentsToMarkdown(segments, savedImages);
  return insertContent(content);
}

async function insertPlainTextFallback(content: string): Promise<BlockEntity[]> {
  return insertContent(content);
}

async function insertContent(content: string): Promise<BlockEntity[]> {
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  const currentBlock = (await logseq.Editor.getCurrentBlock()) as BlockEntity | null;

  if (getSettings().newlineToBlocks && normalizedContent.includes("\n")) {
    return insertContentAsBlocks(normalizedContent, currentBlock);
  }

  await logseq.Editor.insertAtEditingCursor(content);
  return currentBlock ? [currentBlock] : [];
}

function renderSegmentsToMarkdown(segments: ParsedSegment[], savedImages: SavedImage[]): string {
  let imageIndex = 0;
  let output = "";

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];

    if (segment.type === "text") {
      output += segment.content;
      continue;
    }

    const nextSegment = segments[segmentIndex + 1];
    const image = savedImages[imageIndex];
    imageIndex += 1;
    if (!image) continue;

    const altText = sanitizeAltText(image.alt);
    const imageMarkdown = formatImageMarkdown(altText, image);
    output += getSettings().newlineToBlocks
      ? withBlockSpacing(output, imageMarkdown, nextSegment)
      : withReadableSpacing(output, imageMarkdown, nextSegment);
  }

  return output.trimEnd();
}

async function insertContentAsBlocks(content: string, currentBlock: BlockEntity | null): Promise<BlockEntity[]> {
  const editingContent = await (
    logseq.Editor as typeof logseq.Editor & { getEditingBlockContent?: () => Promise<string | null> }
  ).getEditingBlockContent?.();
  const cursorPosition = await (
    logseq.Editor as typeof logseq.Editor & { getEditingCursorPosition?: () => Promise<{ pos: number } | null> }
  ).getEditingCursorPosition?.();

  if (!currentBlock || editingContent == null || !cursorPosition) {
    await logseq.Editor.insertAtEditingCursor(content);
    return currentBlock ? [currentBlock] : [];
  }

  const blockChunks = splitContentIntoBlockChunks(content);
  if (blockChunks.length === 1) {
    await logseq.Editor.insertAtEditingCursor(content);
    return [currentBlock];
  }

  const prefix = editingContent.slice(0, cursorPosition.pos);
  const suffix = editingContent.slice(cursorPosition.pos);

  await logseq.Editor.updateBlock(currentBlock.uuid, `${prefix}${blockChunks[0]}`);
  const affectedBlocks: BlockEntity[] = [{ ...currentBlock, content: `${prefix}${blockChunks[0]}` }];

  let previousBlockUuid = currentBlock.uuid;
  for (let index = 1; index < blockChunks.length; index += 1) {
    const isLastLine = index === blockChunks.length - 1;
    const blockContent = isLastLine ? `${blockChunks[index]}${suffix}` : blockChunks[index];
    const insertedBlock = await logseq.Editor.insertBlock(previousBlockUuid, blockContent, {
      sibling: true,
      focus: isLastLine,
    });

    if (insertedBlock?.uuid) {
      previousBlockUuid = insertedBlock.uuid;
      affectedBlocks.push(insertedBlock as BlockEntity);
    }
  }

  return affectedBlocks;
}

function splitContentIntoBlockChunks(content: string): string[] {
  const lines = content.split("\n");
  const chunks: string[] = [];
  let currentChunkLines: string[] = [];
  let fenceMarker: "```" | "~~~" | null = null;
  let inMathBlock = false;
  let inQuoteBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const isQuoteLine = isMarkdownQuoteLine(line);

    currentChunkLines.push(line);

    if (fenceMarker) {
      if (trimmed.startsWith(fenceMarker)) {
        fenceMarker = null;
      }
    } else if (inMathBlock) {
      if (trimmed === "$$") {
        inMathBlock = false;
      }
    } else if (trimmed.startsWith("```")) {
      fenceMarker = "```";
    } else if (trimmed.startsWith("~~~")) {
      fenceMarker = "~~~";
    } else if (trimmed === "$$") {
      inMathBlock = true;
    }

    const nextLine = lines[index + 1];
    inQuoteBlock = isQuoteLine && nextLine != null && isMarkdownQuoteLine(nextLine);

    const nextLineExists = index < lines.length - 1;
    const shouldCloseChunk = !nextLineExists || (!fenceMarker && !inMathBlock && !inQuoteBlock);

    if (shouldCloseChunk) {
      chunks.push(currentChunkLines.join("\n"));
      currentChunkLines = [];
      inQuoteBlock = false;
    }
  }

  if (currentChunkLines.length > 0) {
    chunks.push(currentChunkLines.join("\n"));
  }

  return chunks;
}

function isMarkdownQuoteLine(line: string): boolean {
  return /^\s*>\s?/.test(line);
}

function withReadableSpacing(currentOutput: string, imageMarkdown: string, nextSegment?: ParsedSegment): string {
  const prefix = getTrailingQuotePrefix(currentOutput) === ""
    ? ""
    : currentOutput.length > 0 && !/\s$/.test(currentOutput)
      ? "\n\n"
      : "";
  const suffix = nextSegment?.type === "text" && nextSegment.content.startsWith("\n") ? "" : "\n\n";
  return `${prefix}${imageMarkdown}${suffix}`;
}

function withBlockSpacing(currentOutput: string, imageMarkdown: string, nextSegment?: ParsedSegment): string {
  const prefix =
    currentOutput.length > 0 && !currentOutput.endsWith("\n") ? getTrailingQuotePrefix(currentOutput) : "";
  const suffix = nextSegment?.type === "text" && nextSegment.content.startsWith("\n") ? "" : "\n";
  return `${prefix}${imageMarkdown}${suffix}`;
}

function getTrailingQuotePrefix(currentOutput: string): string {
  if (/(?:^|\n)\s*>$/.test(currentOutput)) return " ";
  return /(?:^|\n)\s*>\s*$/.test(currentOutput) ? "" : "\n";
}

function formatImageMarkdown(altText: string, image: SavedImage): string {
  const imageMarkdown = `![${altText}](${image.markdownPath})`;
  if (!image.renderedWidth || !image.renderedHeight) return imageMarkdown;
  return `${imageMarkdown}{:height ${image.renderedHeight}, :width ${image.renderedWidth}}`;
}

function sanitizeAltText(alt?: string): string {
  return (alt ?? "").replace(/\]/g, "\\]");
}

async function saveBase64Image(segment: ParsedImageSegment): Promise<SavedImage> {
  const fileName = createAssetFileName(segment.extension);
  const bytes = base64ToUint8Array(segment.base64Data);
  const dimensions = await resolveRenderedImageDimensions(segment);
  const graph = await logseq.App.getCurrentGraph();
  const directWriteResult = await tryWriteToGraphAssets(fileName, bytes);

  if (directWriteResult) {
    return {
      markdownPath: `../${GRAPH_ASSET_FOLDER}/${fileName}`,
      assetPath: directWriteResult.absolutePath,
      mimeType: segment.mimeType,
      extension: segment.extension,
      alt: segment.alt,
      renderedWidth: dimensions?.width,
      renderedHeight: dimensions?.height,
    };
  }

  const storage = logseq.Assets.makeSandboxStorage();
  await storage.setItem(fileName, bytes as unknown as string);
  const assetPath = await resolveStoredAssetPath(fileName, segment.extension);

  return {
    markdownPath: toMarkdownAssetPath(assetPath, graph?.path),
    assetPath,
    mimeType: segment.mimeType,
    extension: segment.extension,
    alt: segment.alt,
    renderedWidth: dimensions?.width,
    renderedHeight: dimensions?.height,
  };
}

async function resolveRenderedImageDimensions(
  segment: ParsedImageSegment,
): Promise<{ width: number; height: number } | null> {
  const naturalDimensions = await readBase64ImageDimensions(segment);
  if (!naturalDimensions) return null;

  const viewport = getHostViewportSize();
  const maxWidth = Math.max(1, Math.floor(Math.min(getSettings().contentWidth, viewport.width - 48) * (2 / 3)));
  const maxHeight = Math.max(1, Math.floor((viewport.height - 96) * (2 / 3)));
  const scale = Math.min(1, maxWidth / naturalDimensions.width, maxHeight / naturalDimensions.height);

  return {
    width: Math.max(1, Math.round(naturalDimensions.width * scale)),
    height: Math.max(1, Math.round(naturalDimensions.height * scale)),
  };
}

function readBase64ImageDimensions(segment: ParsedImageSegment): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => resolve(null), 1500);

    image.onload = () => {
      window.clearTimeout(timeout);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };
    image.src = `data:${segment.mimeType};base64,${segment.base64Data}`;
  });
}

function getHostViewportSize(): { width: number; height: number } {
  const hostWindow = window.parent ?? window;
  return {
    width: hostWindow.innerWidth || window.innerWidth || getSettings().contentWidth,
    height: hostWindow.innerHeight || window.innerHeight || 800,
  };
}

async function tryWriteToGraphAssets(
  fileName: string,
  bytes: Uint8Array,
): Promise<{ absolutePath: string } | null> {
  try {
    const graph = await logseq.App.getCurrentGraph();
    if (!graph?.path) return null;

    const nodeRuntime = getNodeRuntime();
    if (!nodeRuntime) return null;

    const assetsDir = nodeRuntime.path.join(graph.path, GRAPH_ASSET_FOLDER);
    const absolutePath = nodeRuntime.path.join(assetsDir, fileName);

    await nodeRuntime.fs.mkdir(assetsDir, { recursive: true });
    await nodeRuntime.fs.writeFile(absolutePath, bytes);

    debugPaste("image written to graph assets", { absolutePath });
    return { absolutePath };
  } catch (error) {
    console.warn("long-form paste: failed to write image directly to graph assets", error);
    return null;
  }
}

async function resolveStoredAssetPath(fileName: string, extension: string): Promise<string> {
  const candidates = await logseq.Assets.listFilesOfCurrentGraph(extension);
  const normalizedFileName = fileName.replace(/\\/g, "/");

  const matched = [...candidates]
    .reverse()
    .find((file) => file.path.replace(/\\/g, "/").endsWith(`/${normalizedFileName}`));

  if (matched) return matched.path;
  return `${GRAPH_ASSET_FOLDER}/${normalizedFileName}`;
}

function createAssetFileName(extension: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `paste-${timestamp}-${randomSuffix}.${extension}`;
}

function base64ToUint8Array(base64Data: string): Uint8Array {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toMarkdownAssetPath(assetPath: string, graphPath?: string): string {
  const normalizedPath = assetPath.replace(/\\/g, "/").replace(/^\.?\//, "");
  const normalizedGraphPath = graphPath?.replace(/\\/g, "/").replace(/\/$/, "");

  if (normalizedPath.startsWith("../") || normalizedPath.startsWith("/")) {
    return normalizedPath;
  }

  if (normalizedGraphPath) {
    const graphAssetsPrefix = `${normalizedGraphPath}/${GRAPH_ASSET_FOLDER}/`;
    if (normalizedPath.startsWith(graphAssetsPrefix)) {
      const relativeAssetPath = normalizedPath.slice(normalizedGraphPath.length + 1);
      return `../${relativeAssetPath}`;
    }
  }

  if (normalizedPath.startsWith("assets/")) {
    return `../${normalizedPath}`;
  }

  const assetsIndex = normalizedPath.lastIndexOf(`/${GRAPH_ASSET_FOLDER}/`);
  if (assetsIndex >= 0) {
    const relativeAssetPath = normalizedPath.slice(assetsIndex + 1);
    return `../${relativeAssetPath}`;
  }

  const pathParts = normalizedPath.split("/");
  const fileName = pathParts[pathParts.length - 1] ?? normalizedPath;
  return `../${GRAPH_ASSET_FOLDER}/${fileName}`;
}

function getNodeRuntime():
  | {
      fs: {
        mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
        writeFile(path: string, data: Uint8Array): Promise<void>;
      };
      path: {
        join: (...paths: string[]) => string;
      };
    }
  | null {
  const hostRequire =
    (parent as typeof window & { require?: (id: string) => unknown }).require ??
    (window as typeof window & { require?: (id: string) => unknown }).require;

  if (!hostRequire) return null;

  const fs = hostRequire("node:fs/promises") as {
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    writeFile(path: string, data: Uint8Array): Promise<void>;
  };
  const path = hostRequire("node:path") as {
    join: (...paths: string[]) => string;
  };

  return { fs, path };
}

function containsBase64Image(text: string): boolean {
  IMAGE_DATA_URL_PATTERN.lastIndex = 0;
  const result = IMAGE_DATA_URL_PATTERN.test(text);
  IMAGE_DATA_URL_PATTERN.lastIndex = 0;
  return result;
}

function parseClipboardText(text: string): ParseClipboardResult {
  const matches = collectMatches(text);
  if (matches.length === 0) {
    return {
      segments: [{ type: "text", content: text }],
      hasImages: false,
    };
  }

  const segments: ParsedSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({
        type: "text",
        content: text.slice(cursor, match.start),
      });
    }

    segments.push({
      type: "image",
      mimeType: match.mimeType,
      extension: match.extension,
      base64Data: normalizeBase64(match.base64Data),
      originalSource: match.originalSource,
      alt: match.alt,
    });

    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({
      type: "text",
      content: text.slice(cursor),
    });
  }

  return {
    segments: mergeAdjacentTextSegments(segments),
    hasImages: true,
  };
}

function collectMatches(text: string): MatchCandidate[] {
  IMAGE_DATA_URL_PATTERN.lastIndex = 0;
  const matches: MatchCandidate[] = [];
  const ranges: Array<{ start: number; end: number }> = [];

  const markdownPattern =
    /!\[(?<alt>[^\]]*)\]\((?<src>data:(?<mime>image\/(?:png|jpeg|jpg|gif|webp));base64,(?<data>[A-Za-z0-9+/=\r\n]+))\)/gi;
  const htmlPattern =
    /<img\b[^>]*\bsrc=["'](?<src>data:(?<mime>image\/(?:png|jpeg|jpg|gif|webp));base64,(?<data>[A-Za-z0-9+/=\r\n]+))["'][^>]*>/gi;

  for (const match of text.matchAll(markdownPattern)) {
    const candidate = buildMatchCandidate(match, "alt");
    if (candidate) {
      matches.push(candidate);
      ranges.push({ start: candidate.start, end: candidate.end });
    }
  }

  for (const match of text.matchAll(htmlPattern)) {
    const candidate = buildMatchCandidate(match);
    if (candidate && !overlapsExistingRange(candidate.start, candidate.end, ranges)) {
      matches.push(candidate);
      ranges.push({ start: candidate.start, end: candidate.end });
    }
  }

  for (const match of text.matchAll(IMAGE_DATA_URL_PATTERN)) {
    const start = match.index;
    const originalSource = match[0];
    const mimeType = match[1]?.toLowerCase();
    const base64Data = match[2];

    if (
      start == null ||
      !mimeType ||
      !base64Data ||
      overlapsExistingRange(start, start + originalSource.length, ranges)
    ) {
      continue;
    }

    const extension = IMAGE_MIME_TO_EXTENSION[mimeType];
    if (!extension) continue;

    matches.push({
      start,
      end: start + originalSource.length,
      originalSource,
      mimeType,
      base64Data,
      extension,
    });
  }

  return matches.sort((left, right) => left.start - right.start);
}

function buildMatchCandidate(match: RegExpMatchArray, altGroupName?: string): MatchCandidate | null {
  const start = match.index;
  const originalSource = match[0];
  const src = match.groups?.src;
  const mimeType = match.groups?.mime?.toLowerCase();
  const base64Data = match.groups?.data;

  if (start == null || !src || !mimeType || !base64Data) {
    return null;
  }

  const extension = IMAGE_MIME_TO_EXTENSION[mimeType];
  if (!extension) return null;

  return {
    start,
    end: start + originalSource.length,
    originalSource,
    alt: altGroupName ? match.groups?.[altGroupName] : undefined,
    mimeType,
    base64Data,
    extension,
  };
}

function overlapsExistingRange(start: number, end: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function mergeAdjacentTextSegments(segments: ParsedSegment[]): ParsedSegment[] {
  const merged: ParsedSegment[] = [];

  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (segment.type === "text" && previous?.type === "text") {
      previous.content += segment.content;
      continue;
    }

    merged.push(segment);
  }

  return merged;
}

function normalizeBase64(base64Data: string): string {
  return base64Data.replace(/\s+/g, "");
}
