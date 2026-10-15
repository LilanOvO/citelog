# 安装 CiteLog

[English](INSTALL.md) · [返回项目首页](../README.zh-CN.md)

需要 **桌面版 Chrome 116 或更新版本**、能正常访问 `scholar.google.com` 的网络，以及一个公开的 Scholar 个人主页。当前界面为中文，不需要开发工具。

## 1. 下载并解压

[**下载 citelog-chrome.zip · v0.1.5 试用版**](https://github.com/LilanOvO/citelog/releases/download/v0.1.5/citelog-chrome.zip)

解压为 **`citelog-chrome` 文件夹**，放在固定位置，例如「文稿 / citelog-chrome」。macOS 双击 ZIP 解压；Windows 右键选择「全部解压」。安装后请保留这个文件夹。

```text
citelog-chrome/       ← 在 Chrome 中选择这个文件夹
├── manifest.json
├── popup.html
└── …
```

请选择 **citelog-chrome.zip**，不用下载 GitHub 自动生成的「Source code」压缩包。

## 2. 加载到 Chrome

1. 在 Chrome 地址栏输入 `chrome://extensions`。
2. 打开右上角的「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择 **`citelog-chrome` 文件夹**。

![安装图解：下载解压、加载 citelog-chrome 文件夹、绑定主页](assets/install.svg)

请选择文件夹，不要选择 `citelog-chrome.zip` 或其中某个文件。

## 3. 绑定个人主页

点击 Chrome 工具栏的拼图图标，把 **CiteLog** 固定到工具栏。打开 CiteLog，粘贴公开的 Scholar 个人主页链接，点击「绑定主页」。

链接格式如下：

```text
https://scholar.google.com/citations?user=YOUR_PROFILE_ID
```

第一次成功检查会保存总引用数并建立基线。之后的成功检查才能比较变化；安装前的每日引用历史无法补算。

默认每 24 小时检查一次。在「设置」中可改为 1–720 小时，也可以关闭桌面提醒。Chrome 需要保持运行，电脑休眠或浏览器调度可能使检查推迟。

需要更新时可以随时点击「立即检查」。如果已有检查正在进行，重复点击会合并到这次检查。自动检查仍按设置间隔运行，遇到 Scholar 验证码或访问限制时会暂停。

想记录「谁引用了我」，请看[来源记录的两次完整浏览流程](HOW-IT-WORKS.md#citing-articles-two-complete-visits)。

## 更新并保留记录

1. 找到最初加载到 Chrome 的插件文件夹。
2. 把新版安装包解压到别处，再将其中的**文件**复制到原文件夹，覆盖旧文件。`manifest.json` 的路径要保持不变。
3. 打开 `chrome://extensions`，在 CiteLog 卡片上点击「重新加载」。
4. 刷新更新时已打开的 Scholar 标签页。

**保持原路径，不要卸载重装。** 本机记录属于当前扩展安装；改变安装路径可能产生新的扩展身份，卸载会删除存储。目前没有云备份或历史导入功能。

早期试用包的原路径可能是 `scholar-local-trial-v0.1.0/extension/`。继续使用它即可：把新安装包里的运行文件复制到这个 **`extension/` 文件夹**。从 CitePulse 改名为 CiteLog 没有改变原有存储格式。

## 常见问题

| 遇到的情况 | 处理方法 |
|---|---|
| 提示找不到或无法读取清单文件 | 先解压，再选择 **`citelog-chrome` 文件夹**。如果下载的是源码，请按[下方说明](#从源码安装)选择文件夹。 |
| 工具栏没有图标 | 打开 Chrome 的拼图菜单，点击 CiteLog 旁的固定图标。 |
| 绑定后没有论文变化 | 首次检查建立基线，之后观察到变化才会显示。 |
| 再次点击「立即检查」没有发起新请求 | 等待正在进行的检查完成。重复点击会合并到同一次检查，完成后手动检查没有固定等待间隔。 |
| Scholar 超时或要求验证 | 正常打开个人主页，处理网页提示，稍后再试。原有记录会保留；安装插件不能解决网络不通或解除 Scholar 限制。 |
| 来源为空或显示未完整检查 | 自己打开该论文的「被引用次数」列表。第一次无筛选、完整浏览建立基线，之后再次完整浏览才会识别新增。 |
| 单位管理的浏览器不能开启开发者模式 | 咨询设备管理员的扩展安装政策，目前尚无商店安装方式。 |

仍有问题时，可以[提交反馈](https://github.com/LilanOvO/citelog/issues)。请提供 Chrome 与 CiteLog 版本、操作步骤和页面提示。截图请隐去个人信息，不要附带 Cookie、访问令牌或整个浏览器配置文件。

## 从源码安装

源码包的目录不同。解压后，点击「加载已解压的扩展程序」，按下载方式选择：

| 下载方式 | 应选择的文件夹 |
|---|---|
| GitHub **Code → Download ZIP** | **`citelog-main` 里的 `extension`**（`citelog-main/extension`） |
| Release 中的 **`citelog-source.zip`** | **`citelog` 里的 `extension`**（`citelog/extension`） |

如果使用 Git 克隆仓库，选择仓库里的 **`extension`** 文件夹即可。无需编译；只有[开发检查](../CONTRIBUTING.md)需要 Node.js。
