# Preparing a release

This repository includes a manual **draft** release workflow. A push or tag does not publish a release. Chrome Web Store submission is separate and is not automated here.

## Repository presentation

Suggested repository: `LilanOvO/citelog`

About:

> Google Scholar citation tracking in a small Chrome popup. Daily changes, per-paper updates, and local history.

Topics:

`google-scholar` · `chrome-extension` · `citations` · `citation-tracker` · `research-tools` · `academic` · `manifest-v3` · `javascript`

Use `docs/assets/social-preview.jpg` in **Settings → General → Social preview**. The README is English by default, with a Chinese version linked at the top. Enable Issues for reports. No public Web Store install link exists yet.

## Prepare locally

1. Complete the planned local trial. Record known limitations in `TESTING.md`.
2. Keep the manifest, package, lockfile, changelog, README download links, and release notes aligned on the version.
3. Run `npm ci --ignore-scripts`, `npm test`, `npm run check`, and `npm run package`.
4. Inspect `dist/citelog-chrome.zip`, `dist/citelog-source.zip`, and `dist/SHA256SUMS.txt`. Confirm the runtime ZIP has `manifest.json` at its root.
5. Review screenshots and text. Demo records should stay synthetic; do not publish a local browser profile, personal history, or session data.

The GitHub preparation work does not itself authorize a public upload. The owner reviews the files and confirms repository publication first.

## Create a draft after the repository is online

Open **Actions → Prepare draft release → Run workflow**. Use the intended commit/ref and its exact version tag (currently `v0.1.4`). Keep **prerelease** selected during the trial period. The workflow validates the tag/version and builds the release files before creating an unpublished draft.

Review the notes and the three assets in **Releases**, then publish the draft only after the owner confirms. For the first launch, publish the prepared release promptly after making the repository public so the README's version-specific download link works.

The README deliberately links to `/releases/download/v0.1.4/citelog-chrome.zip`. GitHub's `/releases/latest` endpoint does not target a prerelease; update the explicit links when releasing a new preview.

## After launch

- Test the public download link in a fresh browser profile and follow the three installation steps.
- Reply to reproducible issues and keep the known limitations current.
- When a Chrome Web Store listing is approved, add its verified install link to both READMEs. Keep manual installation available for development.
- Moving from an unpacked installation to the store may change extension identity. Data migration is not implemented; do not promise records will move automatically.
