# Marketplace Submission Notes

This file is a release helper for publishing `logseq-long-form-plugin` to the Logseq marketplace.

## Current Release Target

- Plugin id: `logseq-long-form-plugin`
- Plugin title: `Long Form Plugin`
- Current version: `0.2.1`
- Built entry: `dist/index.html`

## Before You Publish

Make sure all of these are true:

1. `npm run typecheck` passes
2. `npm run build` passes
3. `dist/` contains:
   - `index.html`
   - `package.json`
   - `icon.svg`
   - `assets/...`
4. README includes:
   - plugin overview
   - animated preview
   - installation instructions
   - known limitations
5. `CHANGELOG.md` includes the release notes for the version you are publishing

## Release Artifact

For a GitHub release, package the contents of `dist/` as the plugin artifact.

The release asset should contain the built plugin files directly, so that Logseq can install it as a packaged plugin.

## Suggested GitHub Release Title

```text
v0.2.1
```

## Suggested GitHub Release Notes

```md
## Long Form Plugin 0.2.1

This release prepares the rebuilt long-form writing plugin for broader testing and marketplace submission.

### Highlights

- Three direct display modes:
  - Outline
  - Long form
  - Long form with indentation
- Improved long-form layout consistency between indented and non-indented modes
- Better ordered and unordered list rendering
- More reliable heading enter behavior in normal writing flow
- Better markdown export for ordered lists, including nested list markers
- Sidebar wake-up no longer drops the page back to outline view

### Notes

- Extremely fast typing immediately after structural auto-indent can still race with Logseq host editor behavior
- Logseq reloads may still show duplicate command-registration warnings even when behavior is correct
```

## Marketplace Manifest Template

Create a package entry in the `logseq/marketplace` repository and use a manifest like this:

```json
{
  "title": "Long Form Plugin",
  "description": "A rebuilt long-form writing experience for Logseq with direct switching between outline, long form, and indented long form modes.",
  "author": "YOUR_NAME",
  "repo": "https://github.com/YOUR_GITHUB_USERNAME/logseq-long-form-plugin",
  "icon": "https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/logseq-long-form-plugin/main/icon.svg"
}
```

## Marketplace Submission Checklist

1. Push the repo to a public GitHub repository
2. Create a GitHub release for `v0.2.1`
3. Upload the packaged `dist/` artifact to that release
4. Fork `logseq/marketplace`
5. Add a new package entry with the manifest above
6. Open a PR to `logseq/marketplace`

## Optional Nice-to-Haves

- Add one or two static screenshots in the README below the GIF
- Add a short Chinese description if you want the repo page to be friendlier to bilingual users
- Add a dedicated issue template for bug reports after release
