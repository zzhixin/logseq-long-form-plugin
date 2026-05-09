import "@logseq/libs";
import type { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin";

export const settingsSchema: SettingSchemaDesc[] = [
  {
    key: "enabledForRightSidebar",
    type: "boolean",
    default: false,
    title: "Enable in right sidebar",
    description: "Apply long-form mode to the right sidebar container instead of the main content area.",
  },
  {
    key: "indentNonHeadingChildren",
    type: "boolean",
    default: true,
    title: "Indent non-heading children",
    description: "Keep child indentation for blocks that are not acting as long-form headings.",
  },
  {
    key: "showMetaBlocks",
    type: "boolean",
    default: false,
    title: "Show meta blocks",
    description: "Reveal meta blocks globally while long-form mode is enabled.",
  },
  {
    key: "showTimestamps",
    type: "boolean",
    default: true,
    title: "Show timestamps",
    description: "Show `time::` properties while long-form mode is enabled.",
  },
  {
    key: "contentWidth",
    type: "number",
    default: 820,
    title: "Content width",
    description: "Maximum width in pixels for the long-form writing column.",
  },
  {
    key: "blockGap",
    type: "number",
    default: 12,
    title: "Block gap",
    description: "Vertical spacing between blocks in long-form mode.",
  },
  {
    key: "bodyBlockGap",
    type: "number",
    default: 6,
    title: "Body block gap",
    description: "Vertical spacing between regular body blocks in long-form mode.",
  },
  {
    key: "wordCountGoal",
    type: "number",
    default: 0,
    title: "Word count goal",
    description: "Optional word count goal shown in the long-form word counter widget.",
  },
  {
    key: "wordCountFontSize",
    type: "number",
    default: 13,
    title: "Word count font size",
    description: "Font size in pixels for the long-form word counter widget.",
  },
  {
    key: "showWordCount",
    type: "boolean",
    default: true,
    title: "Show word count",
    description: "Show the floating word count widget in long-form mode.",
  },
  {
    key: "directExportToClipboard",
    type: "boolean",
    default: false,
    title: "Direct export to clipboard",
    description: "When enabled, the export button copies markdown directly instead of opening the export panel.",
  },
  {
    key: "newlineToBlocks",
    type: "boolean",
    default: true,
    title: "Paste newlines as sibling blocks",
    description: "When enabled, pasted multi-line text is split into sibling blocks instead of staying inside one block.",
  },
  {
    key: "debugLogging",
    type: "boolean",
    default: false,
    title: "Debug logging",
    description: "Enable verbose console logging for long-form debugging. Reload the plugin after changing this setting.",
  },
];

export type PluginSettings = {
  enabledForRightSidebar: boolean;
  displayMode: "long-no-indent" | "long-indent" | "outline";
  indentNonHeadingChildren: boolean;
  showMetaBlocks: boolean;
  showTimestamps: boolean;
  contentWidth: number;
  blockGap: number;
  bodyBlockGap: number;
  wordCountGoal: number;
  wordCountFontSize: number;
  showWordCount: boolean;
  directExportToClipboard: boolean;
  newlineToBlocks: boolean;
  debugLogging: boolean;
};

const defaultSettings: PluginSettings = {
  enabledForRightSidebar: false,
  displayMode: "outline",
  indentNonHeadingChildren: true,
  showMetaBlocks: false,
  showTimestamps: true,
  contentWidth: 820,
  blockGap: 12,
  bodyBlockGap: 6,
  wordCountGoal: 0,
  wordCountFontSize: 13,
  showWordCount: true,
  directExportToClipboard: false,
  newlineToBlocks: true,
  debugLogging: false,
};

export function getSettings(): PluginSettings {
  return {
    ...defaultSettings,
    ...(logseq.settings ?? {}),
  };
}

export function isDebugLoggingEnabled(): boolean {
  return Boolean(getSettings().debugLogging);
}
