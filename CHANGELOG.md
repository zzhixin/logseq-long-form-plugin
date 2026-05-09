# Changelog

## 0.2.0

- Renamed the plugin package and Logseq id to `logseq-long-form-plugin`
- Stabilized the three display modes and long-form layout behavior
- Improved heading enter behavior and post-enter structure normalization
- Improved unordered list rendering, including inline code cases
- Added a default-off debug logging switch for future diagnostics
- Hardened runtime sync so sidebar changes no longer knock the page back to outline view

## Notes

- Extremely fast typing immediately after auto-indent can still race with Logseq host editor behavior
- Logseq reloads may still show duplicate command-registration warnings even when the plugin works normally
