# Contributing to CiteLog

Thanks for helping make citation changes easier to follow. Bug reports, translations, accessibility improvements, and focused fixes are welcome.

## Report an issue

[Open an issue](https://github.com/LilanOvO/citelog/issues) with your Chrome version, CiteLog version, reproduction steps, expected result, and actual result. State whether it happens on a profile or a citation-source page.

A cropped screenshot or a small synthetic HTML sample is usually enough. Remove names or profile IDs you do not want public. Never share cookies, tokens, or a full Chrome profile. For citation differences, include the observation times so a delayed check can be distinguished from a calculation error.

## Work locally

Use Node.js 20 or later:

```sh
npm ci
npm test
npm run check
```

In Chrome, load the repository's `extension/` folder as an unpacked extension. Runtime files are checked in; there is no build step. After changing them, reload the extension and refresh any open Scholar tabs.

Use a separate Chrome profile or a separate checkout path for development. Do not overwrite your daily-use installation while experimenting with storage behavior.

## Keep changes focused

- Preserve the compact popup and clear, brief copy. The current UI is Chinese; translation work is welcome.
- Keep records local. A new permission or network dependency needs an explanation of why it is necessary.
- Maintain the source workflow: only observe user-opened citation pages. Do not add automatic source fetches, pagination, retries around CAPTCHA, or background crawling.
- Treat partial pages and unknown data explicitly. Avoid claiming daily precision or newly discovered sources without a valid comparison.
- Preserve stored history when changing schemas, identifiers, or packaging.

For a larger change, discuss the proposed behavior in an issue first. Small fixes can go directly to a pull request.

## Before opening a pull request

Run the tests and package checks above. Add or update tests for changed data logic, parsing, scheduling, or persistence. For visual changes, inspect the real Chrome popup and include a screenshot with sample data. Test network-independent cases with fixtures rather than repeated live Scholar requests.

Describe the problem, the resulting behavior, and how you checked it. Mention any permissions, storage migration, or new dependency.

The bundled HTML parser can be regenerated from pinned dependencies with:

```sh
npm run vendor
```

Review the generated diff and retain the upstream licenses in `extension/vendor/`.

To create the release archives locally:

```sh
npm run package
```

This writes `dist/citelog-chrome.zip` (ready to load, with `manifest.json` at its root) and `dist/citelog-source.zip` (the source repository). Packaging does not publish a release. [Testing notes](TESTING.md) explain the current evidence and open checks.

Contributions are distributed under the project's [MIT license](LICENSE). Bundled third-party code retains its original notices.
