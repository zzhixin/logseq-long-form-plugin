import "@logseq/libs";
import pluginIcon from "../icon.svg?raw";
import { toggleCurrentMetaVisibility, createMetaBlock, toggleGlobalMetaVisibility } from "./features/meta-block";
import { closeExportDialog, copyExportDialog, exportCurrentToClipboard, showExportDialog } from "./features/export-markdown";
import { registerHeadingSync, setHeadingLevel, toggleAutoHeading } from "./features/headings";
import { insertInterstitialJournalStamp } from "./features/journal";
import { registerListEnhancements } from "./features/lists";
import { toggleLongFormMode } from "./features/mode";
import { refreshRuntimeState, registerRuntimeSync } from "./features/runtime-sync";
import { registerWordCountListeners } from "./features/word-count";
import { getSettings, settingsSchema } from "./settings";
import { registerStyles } from "./styles";

type LogseqWithInternalApi = typeof logseq & {
  _execCallableAPIAsync?: (method: string, ...args: unknown[]) => Promise<unknown>;
};

const LEGACY_PLUGIN_IDS = ["logseq-long-form-rebuild"];

function cleanupLegacyUi(): void {
  logseq.provideUI({
    key: "lf-control-bar",
    path: "#app-container",
    reset: true,
    template: "",
  });
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

function installUnloadCleanup(): void {
  logseq.beforeunload(async () => {
    await cleanupRegisteredCommands();
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
      key: "lf-toggle-auto-heading",
      label: "Long Form: Toggle auto heading",
    },
    toggleAutoHeading,
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

  logseq.Editor.registerBlockContextMenuItem("Long Form: Toggle auto heading", toggleAutoHeading);
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

function installDomHooks(): void {
  registerListEnhancements();
  registerWordCountListeners();
  registerRuntimeSync();
  registerHeadingSync();
}

async function main(): Promise<void> {
  registerSettings();
  registerStyles();
  registerModel();
  cleanupLegacyUi();
  installUnloadCleanup();
  await cleanupRegisteredCommands();
  registerCommands();
  installSettingsHooks();
  installDomHooks();
  refreshRuntimeState();

  const settings = getSettings();
  console.info("logseq-long-form loaded", settings);
}

logseq.ready(main).catch((error) => {
  console.error("logseq-long-form failed to start", error);
});
