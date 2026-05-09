# Changelog

## 0.2.1

- Added release-ready README polish, including an animated preview
- Refined long-form list alignment so indented and non-indented modes behave more consistently
- Fixed ordered and unordered list rendering edge cases in Home and long-form views
- Fixed markdown export so ordered lists keep sibling numbering instead of resetting every item to `1.`
- Improved markdown export markers for nested ordered lists

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
