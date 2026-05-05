# Long Form Rebuild

A source-based rebuild of a Logseq long-form writing plugin.

## Current scope

Implemented in the current build:

- Long-form mode toggle
- Toolbar status button: `OT` / `LF`
- Long-form writing styles
- Heading commands:
  - toggle auto heading
  - set heading level 1-6
- Meta block creation and visibility toggles
- List-aware styling for `- ` blocks
- Empty list exit behavior
- Heading `Enter` behavior: create a child block
- Interstitial journal timestamp insertion
- Markdown export dialog and clipboard export
- Floating word counter with goal and font-size setting

Not currently implemented:

- Visual aids / threading guides
- Layout switching
- Keyboard shortcuts

## Development

```bash
npm install
npm run typecheck
npm run build
```

Load [`dist/`](./dist) as an unpacked Logseq plugin.

## Notes

- This project does not import or bundle the original plugin's release files.
- The original repository contents are only reference material for behavior discovery.
- For current status, completed features, known limitations, and restart notes, see [docs/status-summary.zh.md](./docs/status-summary.zh.md).
