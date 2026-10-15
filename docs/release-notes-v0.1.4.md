CiteLog keeps your Google Scholar citation updates a click away.

This is an **early preview** for Chrome 116+. The interface is currently in Simplified Chinese. English and Chinese installation guides are available in the repository.

## Download and install

Choose **citelog-chrome.zip** under Assets below. Unzip it into a permanent folder, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the extracted folder containing `manifest.json`.

Pin CiteLog, open the popup, and paste your public Google Scholar profile URL. No Node.js, build step, or CiteLog account is required.

[English guide](https://github.com/LilanOvO/citelog/blob/main/docs/INSTALL.md) · [中文安装指南](https://github.com/LilanOvO/citelog/blob/main/docs/INSTALL.zh-CN.md)

## In this preview

- Total citations, daily observed changes, and changes for individual papers.
- Checks every 24 hours by default, with a configurable 1–720 hour interval.
- Optional desktop notifications for citation increases.
- Citing articles saved from Scholar source pages you open yourself.
- A compact, light-blue popup with locally stored records.

The first check starts your history. “Today” means when a change was observed, not when a citation was originally made. Source lists are never fetched automatically: the first complete, unfiltered visit establishes a baseline; later complete visits can identify new entries. Scholar's access restrictions still apply. Long-term reliability and live source comparisons are still being evaluated.

## Updating an existing installation

Keep your original installation folder. Replace the files **inside that same folder**, then click **Reload** in Chrome. Do not uninstall or load a second copy if you want to keep your records. Existing local-trial users should copy the new ZIP's root files into their original `extension/` directory.

## Which file?

| Asset | For |
| --- | --- |
| `citelog-chrome.zip` | Installing the extension |
| `citelog-source.zip` | Reading or developing the complete project |
| `SHA256SUMS.txt` | Optional download-integrity verification |

Feedback is welcome in [Issues](https://github.com/LilanOvO/citelog/issues). Please remove personal details from screenshots and logs.

---

**中文简述：** 下载 `citelog-chrome.zip`，解压，在 `chrome://extensions` 开启开发者模式并加载含 `manifest.json` 的文件夹，随后固定图标并绑定主页。首次检查建立基线；来源文章仅在你主动浏览时记录。已有用户请覆盖原目录并重新加载，以保留历史。
