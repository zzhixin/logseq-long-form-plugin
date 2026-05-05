import "@logseq/libs";
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

function cleanupLegacyUi(): void {
  logseq.provideUI({
    key: "lf-control-bar",
    path: "#app-container",
    reset: true,
    template: "",
  });
}

function registerCommands(): void {
  logseq.App.registerCommandPalette(
    {
      key: "lf-toggle-mode",
      label: "Long Form Rebuild: Toggle long-form mode",
    },
    toggleLongFormMode,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-toggle-auto-heading",
      label: "Long Form Rebuild: Toggle auto heading",
    },
    toggleAutoHeading,
  );

  const headingLevels: Array<1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6];
  for (const level of headingLevels) {
    logseq.App.registerCommandPalette(
      {
        key: `lf-heading-${level}`,
        label: `Long Form Rebuild: Set heading ${level}`,
      },
      () => setHeadingLevel(level),
    );
  }

  logseq.App.registerCommandPalette(
    {
      key: "lf-create-meta-block",
      label: "Long Form Rebuild: Create meta block",
    },
    createMetaBlock,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-toggle-current-meta",
      label: "Long Form Rebuild: Toggle current meta visibility",
    },
    toggleCurrentMetaVisibility,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-toggle-global-meta",
      label: "Long Form Rebuild: Toggle global meta visibility",
    },
    toggleGlobalMetaVisibility,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-export-markdown",
      label: "Long Form Rebuild: Show markdown export dialog",
    },
    showExportDialog,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-copy-markdown",
      label: "Long Form Rebuild: Copy current page or block as markdown",
    },
    exportCurrentToClipboard,
  );

  logseq.App.registerCommandPalette(
    {
      key: "lf-interstitial-journal",
      label: "Long Form Rebuild: Insert interstitial journal timestamp",
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
      <a class="button" data-on-click="toggleLongFormMode" title="Toggle Long Form Mode" style="font-size: 12px; font-weight: 600; letter-spacing: 0; padding-inline: 7px;">
        <span id="lf-toolbar-toggle-label">OT</span>
      </a>
    `,
  });

  logseq.App.registerUIItem("toolbar", {
    key: "long-form-export",
    template: `
      <a class="button" data-on-click="showExportDialog" title="Export Markdown" style="font-size: 11px; font-weight: 500; letter-spacing: 0; padding-inline: 6px;">
        Export
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
  registerCommands();
  installSettingsHooks();
  installDomHooks();
  refreshRuntimeState();

  const settings = getSettings();
  console.info("Long Form Rebuild loaded", settings);
}

logseq.ready(main).catch((error) => {
  console.error("Long Form Rebuild failed to start", error);
});
