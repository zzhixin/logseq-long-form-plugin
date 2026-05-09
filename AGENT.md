# Agent Rules

## Implementation Strategy for Logseq Long Form Compatibility

When working on this plugin, prefer matching the behavior of the original Long Form plugin over preserving a strict separation from Logseq's editing lifecycle.

Current direction:

- It is acceptable to use Logseq editor commands, selection changes, and editing-state restoration when needed to reproduce original Long Form behavior.
- It is acceptable to use DOM observation and editor event listeners when they are necessary to match the original plugin.
- It is acceptable to apply small timing-based repairs after host updates, such as restoring focus, restoring editing state, or inserting a missing space.

Still avoid:

- Rewriting unrelated block content as a side effect of heading/list behavior.
- Permanent divergence from Logseq's stored block data.
- Large speculative hacks when a smaller host-aligned command path exists.

Preferred order of solutions:

1. Use existing Logseq commands or external commands.
2. Use Logseq editor APIs plus focused DOM/editor-state repair.
3. Use direct rendering-only solutions for purely visual behavior.

Important note:

- This route is intentionally higher risk than a pure observer approach.
- If behavior is being modeled after the original Long Form plugin, compatibility with that behavior takes priority over keeping the implementation completely passive.
