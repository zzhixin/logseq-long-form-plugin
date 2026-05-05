import { getSettings } from "./settings";

export const STYLE_KEY = "lf-rebuild-style";

export function registerStyles(): void {
  const settings = getSettings();
  const keepIndents = settings.keepIndents
    ? ""
    : `
  .lf-long-form .block-children-container {
    margin-left: 0 !important;
  }`;

  const nonHeadingIndent = settings.indentNonHeadingChildren
    ? `
  .lf-long-form .ls-block[data-heading="true"] > .block-children-container {
    margin-left: 0 !important;
  }`
    : "";

  const timestampVisibility = settings.showTimestamps
    ? ""
    : `
  .lf-long-form .page-property-key[data-ref="time"],
  .lf-long-form .block-properties .page-property-key[data-ref="time"] {
    display: none !important;
  }

  .lf-long-form .page-property-value[data-ref="time"],
  .lf-long-form .block-properties .page-property-value[data-ref="time"] {
    display: none !important;
  }`;

  logseq.provideStyle({
    key: STYLE_KEY,
    style: `
  .lf-long-form {
    --lf-content-width: ${settings.contentWidth}px;
    --lf-block-gap: ${settings.blockGap}px;
    --lf-body-block-gap: ${settings.bodyBlockGap}px;
    --lf-list-indent-step: 1.5rem;
    --lf-rule: rgba(148, 163, 184, 0.24);
    --lf-meta-bg: rgba(148, 163, 184, 0.08);
    --lf-meta-fg: rgba(71, 85, 105, 0.9);
  }

  .lf-long-form .page-blocks-inner,
  .lf-long-form .blocks-container {
    max-width: var(--lf-content-width);
    margin-inline: auto;
  }

  .lf-long-form .ls-block {
    margin-bottom: var(--lf-body-block-gap);
  }

  .lf-long-form .ls-block[data-heading="true"],
  .lf-long-form .ls-block:has(.block-content h1),
  .lf-long-form .ls-block:has(.block-content h2),
  .lf-long-form .ls-block:has(.block-content h3),
  .lf-long-form .ls-block:has(.block-content h4),
  .lf-long-form .ls-block:has(.block-content h5),
  .lf-long-form .ls-block:has(.block-content h6),
  .lf-long-form .ls-block[data-refs-self='[".meta-block"]'] {
    margin-bottom: var(--lf-block-gap);
  }

  .lf-long-form .ls-block > .block-main-container > .block-content-wrapper,
  .lf-long-form .ls-block > .block-main-container > .editor-wrapper {
    border-radius: 8px;
    padding-block: 2px;
  }

  .lf-long-form .block-content h1,
  .lf-long-form .block-content h2,
  .lf-long-form .block-content h3,
  .lf-long-form .block-content h4,
  .lf-long-form .block-content h5,
  .lf-long-form .block-content h6 {
    line-height: 1.3;
    margin: 0.2em 0;
  }

  .lf-long-form .ls-block[data-refs-self='[".indent"]'] > .block-main-container > .block-content-wrapper,
  .lf-long-form .ls-block[data-refs-self='[".indent"]'] > .block-main-container > .editor-wrapper {
    margin-left: 2rem;
  }

  .lf-long-form .ls-block[data-refs-self='[".indent-children"]'] > .block-children-container {
    margin-left: 2rem !important;
  }

  .lf-long-form .ls-block[data-refs-self='[".meta-block"]'] {
    display: none;
  }

  .lf-long-form.lf-show-metas .ls-block[data-refs-self='[".meta-block"]'],
  .lf-long-form .ls-block.show-meta-block > .block-children-container > .block-children > .ls-block[data-refs-self='[".meta-block"]'] {
    display: block;
  }

  .lf-long-form .ls-block[data-refs-self='[".meta-block"]'] > .block-main-container > .block-content-wrapper,
  .lf-long-form .ls-block[data-refs-self='[".meta-block"]'] > .block-main-container > .editor-wrapper {
    background: var(--lf-meta-bg);
    color: var(--lf-meta-fg);
    border-left: 2px dashed var(--lf-rule);
    padding: 8px 12px;
  }

  .lf-long-form .ls-block[data-refs-self='[".meta-block"]'] .bullet-link-wrap {
    opacity: 0.35;
  }

  .lf-long-form .block-content a.tag[data-ref=".meta-block"] {
    opacity: 0.6;
  }

  .lf-long-form .bullet-container,
  .lf-long-form .bullet-link-wrap {
    opacity: 0 !important;
  }

  .lf-long-form .block-children,
  .lf-long-form .block-children-container,
  .lf-long-form .block-children-left-border,
  .lf-long-form .left-sidebar-inner .block-children,
  .lf-long-form .left-sidebar-inner .block-children-container {
    border-left: 0 !important;
    box-shadow: none !important;
  }

  .lf-long-form .block-children::before,
  .lf-long-form .block-children::after,
  .lf-long-form .block-children-container::before,
  .lf-long-form .block-children-container::after,
  .lf-long-form .block-children-left-border::before,
  .lf-long-form .block-children-left-border::after {
    display: none !important;
    border-left: 0 !important;
    box-shadow: none !important;
    content: none !important;
  }

  .lf-long-form .ls-block > .block-main-container > .block-content-wrapper,
  .lf-long-form .ls-block > .block-main-container > .editor-wrapper {
    padding-left: 0 !important;
  }

  .lf-long-form .bullet-container:hover,
  .lf-long-form .bullet-link-wrap:hover,
  .lf-long-form .bullet-container:focus-visible,
  .lf-long-form .bullet-link-wrap:focus-visible {
    opacity: 1 !important;
  }

  .lf-long-form .ls-block[data-lf-ordered-list="true"] .bullet-container,
  .lf-long-form .ls-block[data-lf-ordered-list="true"] .bullet-link-wrap,
  .lf-long-form .ls-block[data-lf-bullet-list="true"] .bullet-container,
  .lf-long-form .ls-block[data-lf-bullet-list="true"] .bullet-link-wrap {
    opacity: 1 !important;
  }

  .lf-long-form .ls-block[data-lf-ordered-list="true"] .block-control {
    margin-left: calc(1.6rem + (var(${ "--lf-list-depth" }, 0) * var(--lf-list-indent-step))) !important;
  }

  .lf-long-form .ls-block[data-lf-bullet-list="true"] .block-control {
    margin-left: calc(1.6rem + (var(${ "--lf-list-depth" }, 0) * var(--lf-list-indent-step))) !important;
  }

  #lf-word-count-root {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 1200;
    pointer-events: none;
  }

  .lf-word-count-widget {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--ls-secondary-background-color, var(--rx-gray-03, rgba(148, 163, 184, 0.12)));
    color: var(--ls-primary-text-color, inherit);
    border: 1px solid var(--ls-border-color, rgba(148, 163, 184, 0.24));
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
    backdrop-filter: blur(8px);
    font-size: ${settings.wordCountFontSize}px;
  }

  .lf-word-count-widget.is-achieved {
    background: color-mix(in srgb, var(--ls-secondary-background-color, white) 78%, #16a34a 22%);
    border-color: color-mix(in srgb, var(--ls-border-color, rgba(148, 163, 184, 0.24)) 65%, #16a34a 35%);
  }

  .lf-word-count-label {
    opacity: 0.68;
    font-size: inherit;
  }

  .lf-word-count-value {
    font-size: inherit;
    font-weight: 600;
    line-height: 1;
  }

  .lf-word-count-goal {
    opacity: 0.82;
    font-size: inherit;
  }

  .lf-export-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(15, 23, 42, 0.42);
    z-index: 1400;
  }

  .lf-export-dialog {
    width: min(920px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    background: #ffffff;
    color: #0f172a;
    border-radius: 10px;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.24);
    display: grid;
    grid-template-rows: auto 1fr auto;
    overflow: hidden;
  }

  .dark .lf-export-dialog {
    background: #0f172a;
    color: #e2e8f0;
  }

  .lf-export-header,
  .lf-export-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  }

  .lf-export-actions {
    justify-content: flex-end;
    border-bottom: 0;
    border-top: 1px solid rgba(148, 163, 184, 0.18);
  }

  .lf-export-textarea {
    width: 100%;
    min-height: 420px;
    resize: vertical;
    border: 0;
    padding: 16px;
    font: 13px/1.65 "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    background: transparent;
    color: inherit;
  }

  .lf-export-icon-btn,
  .lf-export-primary,
  .lf-export-secondary {
    border: 0;
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font: inherit;
  }

  .lf-export-icon-btn {
    padding: 4px 10px;
    font-size: 20px;
    background: transparent;
    color: inherit;
  }

  .lf-export-primary {
    background: #2563eb;
    color: white;
  }

  .lf-export-secondary {
    background: rgba(148, 163, 184, 0.16);
    color: inherit;
  }

  ${keepIndents}
  ${nonHeadingIndent}
  ${timestampVisibility}
`,
  });
}
