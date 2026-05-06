# logseq-long-form

`logseq-long-form` is a rebuild of the classic long-form writing experience for Logseq.

It is designed for people who like writing in Logseq but want the page to feel less like an outliner and more like a clean draft editor, without giving up blocks, headings, lists, and page structure.

## What It Does

When you switch into long-form mode, the page becomes easier to read and write:

- The writing column becomes cleaner and more focused
- Bullets and tree lines are hidden for normal paragraphs
- Numbered lists stay visible and aligned
- `- ` lists render properly in long-form mode
- Nested lists keep their structure
- Headings, meta blocks, and timestamps get special handling
- A floating word-count widget can stay visible while you write
- Markdown export is built in

The top toolbar button cycles through three display modes:

- Outline
- Long form
- Long form with indentation

## Installation

1. Build the plugin:

```bash
npm install
npm run typecheck
npm run build
```

2. In Logseq, load the [`dist/`](./dist) folder as an unpacked plugin.

## Daily Use

After the plugin is loaded, the main things you will use are:

- The toolbar mode button: switches between outline and long-form views
- The export button: opens the Markdown export panel, or copies directly if direct export is enabled
- The command palette: includes mode switching, heading tools, meta block tools, export, and timestamp insertion

Some writing behaviors are also enhanced automatically:

- Pressing `Enter` at the end of a heading creates a child block
- Pressing `Enter` at the end of a non-empty `- ` item creates the next list item
- Pressing `Enter` on an empty `- ` item exits the list

## Settings

The plugin currently includes settings for:

- Display width and spacing
- Showing or hiding timestamps
- Showing or hiding meta blocks
- Word-count goal and font size
- Direct export to clipboard
- Right-sidebar support

## Markdown Export

The exporter is meant to produce cleaner Markdown than raw block text.

It currently:

- Removes long-form-only helper tags and list properties
- Preserves headings
- Preserves numbered lists
- Preserves real `- ` content where appropriate
- Can copy directly to the clipboard without opening the export panel

## Current Limitations

This rebuild is already usable for real writing, but it is not trying to claim full parity with the historical plugin yet.

The main known gaps are:

- The original heading automation is only partially recreated
- Some edge cases in export still need refinement
- The old visual guide / threading UI is not included

## Project Notes

- This project does not bundle old release files from the original plugin
- The original repository is used only as behavior reference
- For detailed internal status and restart notes, see [docs/status-summary.zh.md](./docs/status-summary.zh.md)
