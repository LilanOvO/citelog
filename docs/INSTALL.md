# Install CiteLog

[简体中文](INSTALL.zh-CN.md) · [Back to the project](../README.md)

You need **desktop Chrome 116 or later**, access to `scholar.google.com`, and a public Scholar profile. The current interface is Chinese. No development tools are needed.

## 1. Download and unzip

[**Download citelog-chrome.zip — v0.1.5 preview**](https://github.com/LilanOvO/citelog/releases/download/v0.1.5/citelog-chrome.zip)

Unzip it into a permanent folder named **`citelog-chrome`**, for example `Documents/citelog-chrome`. On macOS, double-click the ZIP; on Windows, right-click it and choose **Extract All**. Keep this folder after installation.

```text
citelog-chrome/       ← select this folder in Chrome
├── manifest.json
├── popup.html
└── …
```

Choose **citelog-chrome.zip**, rather than GitHub's automatically generated “Source code” downloads. The Chrome package is ready to load.

## 2. Load it in Chrome

1. Type `chrome://extensions` into Chrome's address bar.
2. Turn on **Developer mode** in the upper-right corner.
3. Click **Load unpacked**.
4. Select the **`citelog-chrome` folder**.

![Download and unzip, load the citelog-chrome folder, then bind your profile](assets/install.svg)

Select the folder, not `citelog-chrome.zip` or an individual file.

## 3. Bind your profile

Click Chrome's puzzle-piece icon and pin **CiteLog**. Open CiteLog, paste your public profile URL, and click **绑定主页** (Bind profile).

A valid link looks like this:

```text
https://scholar.google.com/citations?user=YOUR_PROFILE_ID
```

The first successful check records your total and establishes a baseline. Subsequent checks can show changes; CiteLog cannot reconstruct history from before installation.

Checks run every 24 hours by default. Open **设置** (Settings) to choose 1–720 hours or turn off desktop reminders. Chrome must be running; sleep and browser scheduling can delay checks.

Use **立即检查** (Check now) whenever you want a manual update. If a check is already running, repeated requests share it. Automatic checks still follow your interval and pause when Scholar requests verification or restricts access.

| In the popup | Meaning |
|---|---|
| 总引用 | Total citations |
| 今日净增 | Net change observed today |
| 区间净增 | Change over an interval with missed days |
| 论文 / 每日记录 | Papers / Daily history |
| 设置 / 立即检查 | Settings / Check now |

For citing articles, follow the [two-visit source workflow](HOW-IT-WORKS.md#citing-articles-two-complete-visits).

## Update without losing your records

1. Locate the folder you originally loaded into Chrome.
2. Unzip the new Chrome package elsewhere, then copy its **contents** into that original folder, replacing the old extension files. `manifest.json` must remain in the same location.
3. Open `chrome://extensions` and click **Reload** on CiteLog.
4. Refresh any Scholar tabs that were open during the update.

**Keep the original folder path. Do not remove and reinstall the extension.** Local records belong to its Chrome installation; changing the installation path can create a different extension identity. Uninstalling deletes its storage. There is no cloud backup or history import yet.

If you used an earlier local trial package, your existing path may end with `scholar-local-trial-v0.1.0/extension/`. That is fine: copy the new runtime files into **that `extension/` folder**, even though the new download has a different name. The CitePulse-to-CiteLog rename preserves the existing storage format.

## Common installation issues

| What you see | What to do |
|---|---|
| “Manifest file is missing or unreadable” | Unzip first and select **`citelog-chrome`**. If you downloaded the source instead, use the folder listed [below](#install-from-source). |
| No CiteLog icon in the toolbar | Open Chrome's puzzle-piece menu and click the pin next to CiteLog. |
| No citation changes after binding | The first check is a baseline. Changes appear after later successful observations. |
| Clicking Check now again does not start another request | Wait for the check already in progress to finish. Repeated requests share that check; there is no fixed waiting interval between completed manual checks. |
| Scholar times out or asks for verification | Open your Scholar profile normally and follow any page prompt. Keep the extension's existing records and try again later. Installing CiteLog does not fix network access or remove Scholar limits. |
| Sources are empty or marked incomplete | Open the relevant paper's Cited by list yourself. A first complete, unfiltered visit establishes a baseline; a later complete visit identifies new articles. |
| Managed browser does not allow Developer mode | Ask your device administrator about their extension policy. There is no Web Store installation option yet. |

If an issue persists, [open an issue](https://github.com/LilanOvO/citelog/issues). Include your Chrome and CiteLog versions, the steps taken, and the visible message. Remove personal details from screenshots; do not attach cookies, tokens, or your full browser profile.

## Install from source

Source downloads use a different folder. After unzipping, click **Load unpacked** and select:

| Download | Folder to select |
|---|---|
| GitHub **Code → Download ZIP** | **`extension` inside `citelog-main`** (`citelog-main/extension`) |
| Release asset **`citelog-source.zip`** | **`extension` inside `citelog`** (`citelog/extension`) |

If you cloned the repository, select its **`extension`** folder. No build is required. Node.js is needed only for [development checks](../CONTRIBUTING.md).
