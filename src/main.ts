import "@logseq/libs";
import pluginIcon from "../icon.svg?raw";
import { toggleCurrentMetaVisibility, createMetaBlock, toggleGlobalMetaVisibility } from "./features/meta-block";
import { closeExportDialog, copyExportDialog, exportCurrentToClipboard, showExportDialog } from "./features/export-markdown";
import {
  normalizeCurrentPageHeadings,
  normalizeSelectedHeadings,
  registerHeadingSync,
  setHeadingLevel,
  toggleAutoHeading,
} from "./features/headings";
import { insertInterstitialJournalStamp } from "./features/journal";
import { registerListEnhancements } from "./features/lists";
import { toggleLongFormMode } from "./features/mode";
import { registerPasteHandler } from "./features/paste";
import { refreshRuntimeState, registerRuntimeSync } from "./features/runtime-sync";
import { registerWordCountListeners } from "./features/word-count";
import { getLongFormDisplayMode } from "./logseq-dom";
import { isDebugLoggingEnabled, settingsSchema } from "./settings";
import { registerStyles } from "./styles";

type LogseqWithInternalApi = typeof logseq & {
  _execCallableAPIAsync?: (method: string, ...args: unknown[]) => Promise<unknown>;
};

type ProbeWindow = Window &
  typeof globalThis & {
    __lfPluginCleanup?: () => void | Promise<void>;
    __lfDebugIndent?: () => void;
  };

const LEGACY_PLUGIN_IDS = ["logseq-long-form-rebuild"];
const COMMAND_KEYS = [
  "lf-toggle-mode",
  "lf-toggle-auto-heading",
  "lf-auto-heading",
  "lf-normalize-selected-headings",
  "lf-normalize-page-headings",
  "lf-heading-1",
  "lf-heading-2",
  "lf-heading-3",
  "lf-heading-4",
  "lf-heading-5",
  "lf-heading-6",
  "lf-create-meta-block",
  "lf-toggle-current-meta",
  "lf-toggle-global-meta",
  "lf-export-markdown",
  "lf-copy-markdown",
  "lf-interstitial-journal",
  "lf-paste-from-clipboard",
] as const;

function cleanupLegacyUi(): void {
  logseq.provideUI({
    key: "lf-control-bar",
    path: "#app-container",
    reset: true,
    template: "",
  });
}

function debugMain(message: string, details?: unknown): void {
  if (!isDebugLoggingEnabled()) return;
  if (details === undefined) {
    console.info(message);
    return;
  }
  console.info(message, details);
}

function getCleanupWindow(): ProbeWindow {
  return (window.top ?? window.parent ?? window) as ProbeWindow;
}

function runPreviousPluginCleanup(): void {
  const cleanupWindow = getCleanupWindow();
  const previousCleanup = cleanupWindow.__lfPluginCleanup;
  if (typeof previousCleanup !== "function") return;

  try {
    const result = previousCleanup();
    if (result && typeof (result as Promise<void>).then === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Best effort cleanup for previous runtime instance.
  }
}

async function cleanupRegisteredCommands(): Promise<void> {
  const internalLogseq = logseq as LogseqWithInternalApi;
  const pluginId = logseq.baseInfo?.id;

  if (!pluginId || typeof internalLogseq._execCallableAPIAsync !== "function") {
    return;
  }

  try {
    const pluginIds = [pluginId, ...LEGACY_PLUGIN_IDS];
    for (const id of pluginIds) {
      await internalLogseq._execCallableAPIAsync("unregister_plugin_simple_command", id);
    }
  } catch {
    // Best effort: older Logseq builds may not expose this internal cleanup API.
  }
}

function getHostCommandPaletteUnregister():
  | ((id: string) => void)
  | null {
  try {
    const hostScope = logseq.Experiments.ensureHostScope() as Record<string, unknown>;
    const frontend = hostScope?.frontend as Record<string, unknown> | undefined;
    const handler = frontend?.handler as Record<string, unknown> | undefined;

    const commandPalette =
      (handler?.command_palette as Record<string, unknown> | undefined) ??
      (handler?.["command-palette"] as Record<string, unknown> | undefined) ??
      (handler?.commandPalette as Record<string, unknown> | undefined);

    const unregister = commandPalette?.unregister;
    return typeof unregister === "function" ? (unregister as (id: string) => void) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function deletePaletteCommandId(target: unknown, id: string): boolean {
  if (!target) return false;

  if (target instanceof Map) {
    const had = target.has(id);
    target.delete(id);
    return had;
  }

  if (
    typeof target === "object" &&
    "delete" in (target as Record<string, unknown>) &&
    typeof (target as { delete?: unknown }).delete === "function"
  ) {
    try {
      (target as { delete: (key: string) => unknown }).delete(id);
      return true;
    } catch {
      return false;
    }
  }

  if (isRecord(target)) {
    const had = Object.prototype.hasOwnProperty.call(target, id);
    delete target[id];
    return had;
  }

  return false;
}

function cleanupPaletteCommandRegistries(commandPalette: Record<string, unknown>, ids: string[]): void {
  const registryCandidates: unknown[] = [
    commandPalette.commands,
    commandPalette.registry,
    commandPalette.command_registry,
    commandPalette.commandRegistry,
  ];

  const state = isRecord(commandPalette.state) ? commandPalette.state : null;
  if (state) {
    registryCandidates.push(
      state.commands,
      state.registry,
      state.command_registry,
      state.commandRegistry,
    );
  }

  for (const registry of registryCandidates) {
    if (!registry) continue;
    for (const id of ids) {
      deletePaletteCommandId(registry, id);
    }
  }
}

function getPaletteCommandIds(pluginId: string): string[] {
  const ids: string[] = [];

  for (const id of [pluginId, ...LEGACY_PLUGIN_IDS]) {
    for (const key of COMMAND_KEYS) {
      ids.push(`plugin.${id}/${key}`);
      ids.push(`:plugin.${id}/${key}`);
    }
  }

  return ids;
}

function cleanupRegisteredPaletteCommandsInHost(): void {
  const pluginId = logseq.baseInfo?.id;
  if (!pluginId) return;

  const ids = getPaletteCommandIds(pluginId);
  const unregister = getHostCommandPaletteUnregister();

  if (unregister) {
    for (const id of ids) {
      try {
        unregister(id);
      } catch {
        // Best effort across Logseq variants.
      }
    }
  }

  try {
    const hostScope = logseq.Experiments.ensureHostScope() as Record<string, unknown>;
    const frontend = hostScope?.frontend as Record<string, unknown> | undefined;
    const handler = frontend?.handler as Record<string, unknown> | undefined;

    const commandPalette =
      (handler?.command_palette as Record<string, unknown> | undefined) ??
      (handler?.["command-palette"] as Record<string, unknown> | undefined) ??
      (handler?.commandPalette as Record<string, unknown> | undefined);

    if (commandPalette) {
      cleanupPaletteCommandRegistries(commandPalette, ids);
    }
  } catch {
    // Best effort: host internals differ across builds.
  }
}

function installUnloadCleanup(): void {
  logseq.beforeunload(async () => {
    await cleanupRegisteredCommands();
    cleanupRegisteredPaletteCommandsInHost();
  });
}

function registerCommands(): void {
  logseq.App.registerCommandPalette(
    {
      key: "lf-toggle-mode",
      label: "Long Form: Cycle display mode",
      keybinding: {
        mode: "global",
        binding: "ctrl+d",
      },
    },
    toggleLongFormMode,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-auto-heading",
      label: "Long Form: Auto heading",
    },
    toggleAutoHeading,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-normalize-selected-headings",
      label: "Long Form: Normalize selected/current headings",
    },
    normalizeSelectedHeadings,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-normalize-page-headings",
      label: "Long Form: Normalize current page headings",
    },
    normalizeCurrentPageHeadings,
  );

  const headingLevels: Array<1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6];
  for (const level of headingLevels) {
    logseq.App.registerCommandPalette(
      {
        key: `lf-heading-${level}`,
        label: `Long Form: Set heading ${level}`,
      },
      () => setHeadingLevel(level),
    );
  }

  logseq.App.registerCommandPalette(
    {
      key: "lf-create-meta-block",
      label: "Long Form: Create meta block",
    },
    createMetaBlock,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-toggle-current-meta",
      label: "Long Form: Toggle current meta visibility",
    },
    toggleCurrentMetaVisibility,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-toggle-global-meta",
      label: "Long Form: Toggle global meta visibility",
    },
    toggleGlobalMetaVisibility,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-export-markdown",
      label: "Long Form: Show markdown export dialog",
    },
    showExportDialog,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-copy-markdown",
      label: "Long Form: Copy current page or block as markdown",
    },
    exportCurrentToClipboard,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-interstitial-journal",
      label: "Long Form: Insert interstitial journal timestamp",
    },
    insertInterstitialJournalStamp,
  );

  logseq.Editor.registerBlockContextMenuItem("Long Form: Auto heading", toggleAutoHeading);
  logseq.Editor.registerBlockContextMenuItem("Long Form: Normalize selected/current headings", normalizeSelectedHeadings);
  logseq.Editor.registerBlockContextMenuItem("Long Form: Create meta block", createMetaBlock);
  logseq.Editor.registerBlockContextMenuItem("Long Form: Toggle current meta", toggleCurrentMetaVisibility);
  logseq.Editor.registerBlockContextMenuItem("Long Form: Copy markdown", exportCurrentToClipboard);

  logseq.App.registerUIItem("toolbar", {
    key: "long-form-toggle",
    template: `
      <a id="lf-toolbar-toggle-button" class="button" data-on-click="toggleLongFormMode" title="Cycle Long Form Display Mode" style="display: inline-flex; align-items: center; justify-content: center; padding-inline: 6px; font-size: 16px; line-height: 1;">
        <span id="lf-toolbar-toggle-label" aria-label="Outline mode" style="display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; color: currentColor;">${pluginIcon}</span>
      </a>
    `,
  });

  logseq.App.registerUIItem("toolbar", {
    key: "long-form-export",
    template: `
      <a class="button" data-on-click="showExportDialog" title="Export Markdown" style="font-size: 16px; font-weight: 500; letter-spacing: 0; padding-inline: 6px;">
        📤 
      </a>
    `,
  });

}

function registerModel(): void {
  logseq.provideModel({
    toggleLongFormMode,
    toggleAutoHeading,
    normalizeSelectedHeadings,
    normalizeCurrentPageHeadings,
    createMetaBlock,
    toggleGlobalMetaVisibility,
    toggleCurrentMetaVisibility,
    showExportDialog,
    closeExportDialog,
    copyExportDialog,
    exportCurrentToClipboard,
    insertInterstitialJournalStamp,
  });
}

function registerSettings(): void {
  logseq.useSettingsSchema(settingsSchema);
}

function installSettingsHooks(): void {
  logseq.onSettingsChanged(() => {
    registerStyles();
    refreshRuntimeState();
  });
}

function installDomHooks(): Array<() => void> {
  const cleanups: Array<() => void> = [];

  cleanups.push(registerListEnhancements());
  cleanups.push(registerWordCountListeners());
  registerRuntimeSync();
  cleanups.push(registerHeadingSync());
  cleanups.push(registerPasteHandler());

  return cleanups;
}

function installIndentDiagnostics(): () => void {
  if (!isDebugLoggingEnabled()) return () => undefined;
  const isElementLike = (value: unknown): value is Element =>
    Boolean(value && typeof value === "object" && "nodeType" in (value as Record<string, unknown>));

  const isHtmlElementLike = (value: unknown): value is HTMLElement =>
    Boolean(isElementLike(value) && "className" in (value as unknown as Record<string, unknown>));

  const printIndentDiagnostics = (): void => {
    const parentDoc = parent?.document;
    if (!parentDoc) {
      debugMain("[long-form:indent] container unavailable");
      return;
    }

    const activeBlock =
      parentDoc.activeElement?.closest?.(".ls-block[blockid]") ??
      parentDoc.querySelector(".ls-block[blockid] .block-editor")?.closest(".ls-block[blockid]") ??
      parentDoc.querySelector(".ls-block[data-lf-ordered-list][data-lf-list-depth='1']") ??
      parentDoc.querySelector(".ls-block[data-lf-unordered-list][data-lf-list-depth='1']") ??
      parentDoc.querySelector(".ls-block[data-lf-ordered-list]") ??
      parentDoc.querySelector(".ls-block[data-lf-unordered-list]") ??
      null;

    const targetBlock = (isHtmlElementLike(activeBlock) ? activeBlock : null) as HTMLElement | null;

    const describeElement = (element: Element | null, label: string) => {
      if (!isHtmlElementLike(element)) {
        return { label, found: false };
      }

      const style = parentDoc.defaultView?.getComputedStyle(element);
      return {
        label,
        found: true,
        className: element.className,
        marginLeft: style?.marginLeft,
        paddingLeft: style?.paddingLeft,
        width: style?.width,
        left: style?.left,
        position: style?.position,
        transform: style?.transform,
      };
    };

    debugMain("[long-form:indent] snapshot", JSON.stringify({
      mode: getLongFormDisplayMode(),
      activeBlockId: targetBlock?.getAttribute?.("blockid") ?? null,
      targetBlockLevel: targetBlock?.getAttribute?.("level") ?? null,
      targetBlockDataHeading: targetBlock?.getAttribute?.("data-heading") ?? null,
      targetBlockListDepth: targetBlock?.getAttribute?.("data-lf-list-depth") ?? null,
      targetBlockOrdered: targetBlock?.getAttribute?.("data-lf-ordered-list") ?? null,
      targetBlockUnordered: targetBlock?.getAttribute?.("data-lf-unordered-list") ?? null,
      targetBlockClasses: targetBlock?.className ?? null,
      blockMainContainer: describeElement(
        targetBlock?.querySelector?.(":scope > .block-main-container") ?? null,
        "blockMainContainer",
      ),
      blockControlWrap: describeElement(
        targetBlock?.querySelector?.(":scope > .block-main-container > .block-control-wrap") ?? null,
        "blockControlWrap",
      ),
      blockContentWrapper: describeElement(
        targetBlock?.querySelector?.(":scope > .block-main-container > .block-content-wrapper") ?? null,
        "blockContentWrapper",
      ),
      blockContentOrEditorInner: describeElement(
        targetBlock?.querySelector?.(":scope > .block-main-container > .block-content-or-editor-inner") ?? null,
        "blockContentOrEditorInner",
      ),
      parentChildrenContainer: describeElement(
        targetBlock?.parentElement?.closest(".block-children-container") ?? null,
        "parentChildrenContainer",
      ),
      nearestBlocksContainer: describeElement(
        targetBlock?.closest(".blocks-container") ?? null,
        "nearestBlocksContainer",
      ),
    }));
  };

  const probeWindow = window as ProbeWindow;
  const parentWindow = (window.parent ?? window) as ProbeWindow;
  const topWindow = (window.top ?? window) as ProbeWindow;
  const cleanupWindow = getCleanupWindow();

  probeWindow.__lfDebugIndent = printIndentDiagnostics;
  parentWindow.__lfDebugIndent = printIndentDiagnostics;
  topWindow.__lfDebugIndent = printIndentDiagnostics;
  cleanupWindow.__lfDebugIndent = printIndentDiagnostics;
  debugMain("logseq-long-form indent diagnostics ready");

  return () => {
    delete probeWindow.__lfDebugIndent;
    delete parentWindow.__lfDebugIndent;
    delete topWindow.__lfDebugIndent;
    delete cleanupWindow.__lfDebugIndent;
  };
}

function installGlobalCleanup(cleanups: Array<() => void>): void {
  const cleanupWindow = getCleanupWindow();
  cleanupWindow.__lfPluginCleanup = () => {
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch {
        // Best effort cleanup.
      }
    }
    delete cleanupWindow.__lfPluginCleanup;
  };
}

async function main(): Promise<void> {
  runPreviousPluginCleanup();
  registerSettings();
  registerStyles();
  registerModel();
  cleanupLegacyUi();
  installUnloadCleanup();
  await cleanupRegisteredCommands();
  cleanupRegisteredPaletteCommandsInHost();
  registerCommands();
  installSettingsHooks();
  const cleanups = installDomHooks();
  cleanups.push(installIndentDiagnostics());
  installGlobalCleanup(cleanups);
  refreshRuntimeState();
}

logseq.ready(main).catch((error) => {
  console.error("logseq-long-form failed to start", error);
});
