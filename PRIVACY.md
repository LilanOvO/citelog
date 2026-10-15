# Privacy

[简体中文](#简体中文)

CiteLog has no server, analytics, ads, or account system. The developer does not receive your profile or citation history through the extension.

## Data stored on your device

CiteLog uses Chrome's `storage.local` to save:

- Your bound Scholar profile URL, ID, and displayed name.
- Check interval, notification preference, and the time zone used for daily records.
- Citation counts, check status and timestamps, per-paper metadata, and change history.
- Titles, authors, years, links, identifiers, and observation times for citing articles recorded during your visits.

The extension processes the bound profile and source pages for its known papers. Page HTML is used transiently for local parsing; it is not retained as browsing history. Unrelated pages are not collected.

Records are not synced to other devices or uploaded to the developer. Anyone with access to your Chrome profile may be able to access its local extension data.

## Network access and permissions

| Permission | Purpose |
|---|---|
| `https://scholar.google.com/*` | Read the bound public profile at the configured interval, and record relevant Scholar pages you open. |
| `storage` | Save settings and records in this Chrome profile. |
| `alarms` | Schedule checks. |
| `notifications` | Show optional desktop reminders. |
| `offscreen` | Parse fetched profile HTML locally. |

Background profile requests omit login credentials. CiteLog has no cookie-reading permission. Citing-article lists are not requested, prefetched, or paginated in the background.

Google receives requests made to Scholar, including the normal network information associated with them. When you open Scholar or an article link, the destination website handles that visit under its own privacy policy. These ordinary browser visits may use your existing website session. CiteLog does not bypass verification or access restrictions.

Parser dependencies are bundled with the extension. No runtime code is downloaded from a CDN.

## Retention and deletion

Local storage is bounded: up to 400 profile check events, source histories for 12 papers, and up to 500 recorded sources plus 200 new-discovery records per paper. Older records can be replaced when limits are reached.

Reloading an updated extension from the same installation path preserves its data. Switching the bound profile resets the previous records. Uninstalling CiteLog removes its local storage. Changing the unpacked installation path may create a different extension identity. There is no cloud backup or history recovery feature.

## Questions

Use [GitHub Issues](https://github.com/LilanOvO/citelog/issues) for privacy questions. Issues are public: do not include cookies, credentials, private browsing data, or information you do not want published.

---

## 简体中文

CiteLog 没有服务器、统计分析、广告或账号系统。开发者不会通过插件收到你的个人主页或引用历史。

### 本机保存的数据

插件使用 Chrome 的 `storage.local` 保存绑定主页的链接、ID 与姓名，检查间隔、提醒设置与日期使用的时区，引用数、检查状态与时间、论文信息和变化历史，以及你浏览来源页时记录的引用文章标题、作者、年份、链接、标识与观察时间。

只处理绑定主页及其已知论文的来源页。网页 HTML 仅用于临时的本地解析，不作为浏览历史保存。无关网页不会被采集。

记录不上传给开发者，也不跨设备同步。能访问你 Chrome 配置文件的人，可能读取其中的扩展本机数据。

### 网络与权限

- `https://scholar.google.com/*`：按设置间隔读取公开主页，并记录你主动打开的相关 Scholar 页面。
- `storage`：保存本机设置与记录。
- `alarms`：安排检查时间。
- `notifications`：显示可关闭的桌面提醒。
- `offscreen`：在本机解析返回的主页 HTML。

后台主页请求不携带登录凭据，插件没有读取 Cookie 的权限。来源列表不会被后台请求、预取或自动翻页。

Google 会收到向 Scholar 发出的请求及其正常网络信息。你打开 Scholar 或文章链接时，目标网站按自身隐私政策处理访问；这些正常的浏览器访问可能使用已有的网站登录状态。插件不会绕过验证或访问限制。解析依赖随插件本地打包，不从 CDN 下载运行时代码。

### 保留与删除

最多保留 400 条主页检查事件、12 篇论文的来源历史，每篇最多 500 条来源与 200 条新增发现记录。达到上限后旧记录可能被替换。

在原路径更新并重新加载会保留数据。切换绑定主页会重置旧记录，卸载会删除本机存储。改变加载目录可能产生新的扩展身份。目前没有云备份或历史恢复功能。

隐私问题可通过 [GitHub Issues](https://github.com/LilanOvO/citelog/issues) 反馈。Issue 内容公开，请不要附带 Cookie、账号凭据、私密浏览数据或不希望公开的信息。
