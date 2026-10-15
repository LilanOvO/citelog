# 安装 CiteLog

[English](INSTALL.md) · [返回项目首页](../README.zh-CN.md)

需要 **桌面版 Chrome 116 或更新版本**、能正常访问 `scholar.google.com` 的网络，以及一个公开的 Scholar 个人主页。当前界面为中文，不需要开发工具。

## 1. 下载并解压

[**下载 citelog-chrome.zip · v0.1.4 试用版**](https://github.com/LilanOvO/citelog/releases/download/v0.1.4/citelog-chrome.zip)

解压后，把文件夹放在固定位置，例如「文稿 / citelog-chrome」。安装后请保留它，Chrome 会直接从这里读取插件文件。

请选择 **citelog-chrome.zip**，不用下载 GitHub 自动生成的「Source code」压缩包。

## 2. 加载到 Chrome

1. 在 Chrome 地址栏输入 `chrome://extensions`。
2. 打开右上角的「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择解压后的 **citelog-chrome** 文件夹；里面应该能直接看到 `manifest.json`。

![安装图解：下载解压、打开开发者模式、选择解压文件夹](assets/install.svg)

如果解压软件多套了一层文件夹，请选里面直接包含 `manifest.json` 的那一层。不要选择 ZIP 文件本身。

## 3. 绑定个人主页

点击 Chrome 工具栏的拼图图标，把 **CiteLog** 固定到工具栏。打开 CiteLog，粘贴公开的 Scholar 个人主页链接，点击「绑定主页」。

链接格式如下：

```text
https://scholar.google.com/citations?user=YOUR_PROFILE_ID
```

第一次成功检查会保存总引用数并建立基线。之后的成功检查才能比较变化；安装前的每日引用历史无法补算。

默认每 24 小时检查一次。在「设置」中可改为 1–720 小时，也可以关闭桌面提醒。Chrome 需要保持运行，电脑休眠或浏览器调度可能使检查推迟。

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
| 提示找不到或无法读取清单文件 | 先解压，再选择直接包含 `manifest.json` 的文件夹。 |
| 工具栏没有图标 | 打开 Chrome 的拼图菜单，点击 CiteLog 旁的固定图标。 |
| 绑定后没有论文变化 | 首次检查建立基线，之后观察到变化才会显示。 |
| 提示检查间隔过短 | 距离上次检查尝试至少等 15 分钟，手动检查也有这个间隔。 |
| Scholar 超时或要求验证 | 正常打开个人主页，处理网页提示，稍后再试。原有记录会保留；安装插件不能解决网络不通或解除 Scholar 限制。 |
| 来源为空或显示未完整检查 | 自己打开该论文的「被引用次数」列表。第一次无筛选、完整浏览建立基线，之后再次完整浏览才会识别新增。 |
| 单位管理的浏览器不能开启开发者模式 | 咨询设备管理员的扩展安装政策，目前尚无商店安装方式。 |

仍有问题时，可以[提交反馈](https://github.com/LilanOvO/citelog/issues)。请提供 Chrome 与 CiteLog 版本、操作步骤和页面提示。截图请隐去个人信息，不要附带 Cookie、访问令牌或整个浏览器配置文件。

## 从源码安装

下载或克隆仓库后，按上面的步骤加载仓库中的 **`extension/`** 文件夹即可。已提交的扩展文件无需编译；只有[开发检查](../CONTRIBUTING.md)需要 Node.js。
