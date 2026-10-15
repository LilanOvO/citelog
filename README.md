<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/LilanOvO/citelog/releases/download/v0.1.4/citelog-chrome.zip"><strong>Download for Chrome</strong></a> ·
  <a href="docs/INSTALL.md">Install guide</a> ·
  <a href="https://github.com/LilanOvO/citelog/issues">Feedback</a>
</p>

<p align="center">
  <img src="docs/assets/hero.jpg" alt="CiteLog — your Google Scholar citations, at a glance" width="960">
</p>

CiteLog is a small Chrome popup for your Google Scholar citation history. See your total, the changes you have observed, and which papers gained citations.

**Early preview · Chrome 116+ · Chinese interface**  
English documentation is available. The extension is installed manually for now; there is no Chrome Web Store listing yet.

## A little less checking

- **See what changed.** Total citations, daily observed changes, and changes for individual papers.
- **Keep a record.** A compact history with configurable checks from 1 to 720 hours; daily by default.
- **Get a reminder.** Optional desktop notifications when citation counts increase.
- **Read the sources.** Save citing articles as you browse their Scholar pages, then compare complete visits to find new entries.

<p align="center">
  <img src="docs/assets/overview.jpg" alt="CiteLog's citation overview, daily history, and citing-article detail screens" width="960">
</p>

<p align="center"><sub>Actual extension UI with sample data. Names, papers, and counts are illustrative.</sub></p>

## Install

1. [Download **citelog-chrome.zip**](https://github.com/LilanOvO/citelog/releases/download/v0.1.4/citelog-chrome.zip), unzip it, and keep the folder somewhere permanent.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder containing `manifest.json`.
3. Pin **CiteLog**, open it, paste your public Google Scholar profile URL, and click **绑定主页** (Bind profile).

No Node.js, build step, or CiteLog account is needed. Your first successful check starts your history.

[Visual installation guide and troubleshooting →](docs/INSTALL.md)

**Already using the local trial?** Update files in your original installation folder and click **Reload**. Keep that folder in place to retain your extension identity and records. [Update instructions →](docs/INSTALL.md#update-without-losing-your-records)

## How citation sources work

CiteLog checks your **profile counts** automatically. Citing-article lists are recorded only when you choose to open them.

1. Visit a paper's **Cited by** list from the first page to the last, without filters. The first complete visit establishes a baseline.
2. Complete another visit later. CiteLog compares the lists and shows newly discovered articles.

Partial visits save the articles you saw, but do not establish which ones are new. A complete visit must finish within 30 minutes and fit the current 500-source limit per paper. [How it works and current limits →](docs/HOW-IT-WORKS.md)

“Today” means **when CiteLog observed a change**. Scholar may update counts and source lists at different times, so a newly discovered article cannot always be matched to a particular count increase.

## Local by default

Settings and records stay in this Chrome profile. CiteLog has no server, analytics, ads, or cloud sync. It pauses automatic checks when Scholar requests verification or restricts access. Installing it does not bypass Scholar's access limits.

[Privacy and permissions →](PRIVACY.md) · [Validation and known limits →](TESTING.md)

## Contribute

Bug reports, clearer translations, and small improvements are welcome. For a bug, include your Chrome version, what you did, and what appeared; remove personal information from screenshots.

[Contribution guide](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [MIT license](LICENSE)

CiteLog is an independent project and is not affiliated with Google or Google Scholar.
