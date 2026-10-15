# Changelog

CiteLog is currently an early preview. These versions describe local trial builds; they do not imply that each version was publicly released.

## 0.1.5

- Removed the fixed waiting interval for manual checks. Repeated requests during an active check share that check.
- Kept automatic checks on the configured schedule and retained pause behavior for Scholar verification and access restrictions.
- Simplified both READMEs with installation first and named the exact folders to select for Chrome and source downloads.

## 0.1.4

- Renamed the product to **CiteLog** across the popup, toolbar, and notifications.
- Reduced the popup from 432 × 600 to 380 × 460 pixels and tightened spacing.
- Preserved existing storage identifiers so local trial updates retain records.
- Added bilingual project and installation guides, a ready-to-load Chrome package, and an MIT license for the first public preview.

## 0.1.3

- Replaced raw HTML insertion during parsing with a local tokenizer and a restricted, detached DOM builder.
- Fixed Content Security Policy style warnings without weakening the extension's security policy.
- Bundled parser dependencies and license notices locally.

## 0.1.2

- Kept the footer accessible when Chrome provides less popup height than requested.
- Added internal scrolling for the main content.

## 0.1.1

- Fixed a collapsed popup by giving the root and body explicit dimensions.
- Used the manifest version when naming the local package.

## 0.1.0

- Added profile binding, periodic count checks, per-paper differences, daily history, and optional notifications.
- Added local source recording from user-opened Scholar pages and complete-visit baseline comparison.
- Added request throttling, pause behavior for restricted access, and bounded local history.
