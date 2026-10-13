# Twillot 11.0.9 静态分析

分析日期以本地文件时间为准：2026-10-13。对象有两件：

- Chrome 扩展 `flkokionhgagpmnhlngldhbfnblmenen`，商店名 Twitter Bookmarks Search & Export（Twillot），版本 **11.0.9**，Manifest V3。
- 主站页面 `https://www.twillot.com/zh/twitter-bookmarks?isInstalled=true`。该页 HTML 标题是「推特书签一键导出，AI自动分类推特书签……」。

先做的是静态分析，没有跑过一次书签同步。后补了一次已打开页面的 CDP 快照，见下文「CDP 补充」。那次快照没有刷新页面，也没有看到发往 X 的 GraphQL。

结论先写在前面：

- 这份 CRX 是桥，不是书签客户端。搜索、文件夹、导出、AI 分类的实现都在网页脚本里。
- 数据本体在网页打开的 IndexedDB `twillot`（版本 41），不在扩展里。
- 这是产品拆法，不是技术限制。不上架时，可以用未打包扩展把同步、本地库、搜索、文件夹和导出做进插件。AI 分类和付款依赖他们的服务器，不是「必须有网页」本身。

## 仓库里有什么

| 路径 | 内容 |
|---|---|
| `downloads/twillot-flkokionhgagpmnhlngldhbfnblmenen.crx` | 商店 CRX3，约 50 KB |
| `downloads/twillot-flkokionhgagpmnhlngldhbfnblmenen.zip` | 去掉 Cr24 头后的 ZIP。SHA-256 `db658ef932de166c3dc7a9a824a6c39f3e02dccfd5e24538ba1d9d0b7cadc6ad` |
| `artifacts/crx-unpacked/` | REA `extract_artifact` 解出的 41 个文件 |
| `artifacts/web/html/twitter-bookmarks.html` | 书签页 HTML，约 334 KB |
| `artifacts/web/urls.txt` | HTML 里的脚本 URL |
| `artifacts/web/page.js`、`artifacts/web/layout.js` | 页面 chunk 和 twitter layout chunk 的单独副本 |
| `artifacts/web/chunks/` | 该页加载的 46 个脚本，合计约 2.7 MB |
| `artifacts/web/focus/` | 页面入口、`6936`、`7720` 三个核心文件 |
| `artifacts/web/slices/` | 从 minify 源码切出的阅读片段，不是运行时日志 |
| `artifacts/web/cdp/bookmarks-snapshot.json` | 已打开页面的 CDP 快照。查询串已去掉，订阅 id 已打码 |

CRX 头是 `Cr24`，版本 3，header 1310 字节，ZIP 从偏移 1322 开始。REA 不能直接打开 `.crx`，打开的是这个 ZIP。

## 证据与覆盖

扩展：

- 解包证据 `ev_8e4544364dd80ee61f8519432d846ac9757499e60501d5bcdd216767518b5830`。完整性矛盾为空。
- JavaScript 图父证据 `ev_af47ae29cc3f68de70d60f1296f2d1329437e1a6034365b4bb4d92c9acde42d2`。20 个 JS 全部解析，无 source map。摘要视图 `ev_4e3d99b23939efafa89261d89384d68ff1adfffade1bd1581d8f67ebb1f694c8`。
- 语义关系是部分覆盖，约 2291 个未知。端点和存储是静态观察到的，不代表某次浏览真的执行过。
- REA 把 `chrome.storage.sync.get("profile")` 和 `timeline_settings` 标成了网络端点。源码里它们是 storage 读取。

网页：

- 46 个 chunk 的父证据 `ev_c79b6ead543955665b81f6e078588706582e0677d4997eafe0ec79d23fc5369f`。目录 SHA-256 `d923001ba7c2106a6b517fa05b6ebb1fcbe6bfd86e8e7930457315b11afe8a7d`。46 个文件全部解析，958 个 webpack 模块，831593 个 AST 节点。语义图因结果预算被截断，书签页没有做完语义分析。
- 只分析三个核心文件的父证据 `ev_0bb4f53eab71e5504c17774b914ca4b205221ec511638b42a865b9678a4093b4`。3 个文件、36 个模块、0 个解析失败，图仍然不完整，字符串种子没有命中端点。
- 因此网页行为的依据是这些已解析文件本身，以及 `artifacts/web/slices/` 里的片段，不是 REA 的调用图。

## CDP 补充

本机 Chrome 的 `DevToolsActivePort` 写的是 `127.0.0.1:9222` 加浏览器 WebSocket `/devtools/browser/2fb065d8-33f9-4e90-987a-1a81908ea806`。这个端口对 `/json/version` 和 `/json/list` 返回 404，WebSocket 本身能升级。REA 的 `list_browser_targets` 只接受带端口的 HTTP 发现地址，连 `http://127.0.0.1:9222` 时报 `invalid_endpoint_response`，所以这次不是 REA 证据，而是直接对这条已有连接做的 CDP。

方法：`Target.getTargets`，再对已经打开的 `twillot.com` 页面 `Target.attachToTarget`。读了 `Page.getResourceTree`，并用 `Runtime.evaluate` 读 `performance.getEntriesByType("resource")` 和界面控件文案。没有刷新，没有点击，没有读 cookie、storage 或响应体。查询串已去掉。控件文字截到 48 字、最多 80 个。原始记录在 `artifacts/web/cdp/bookmarks-snapshot.json`。

当时有三个 `www.twillot.com` 页面：

| 页面 | performance 条目 | 资源树里的脚本 | 看到的界面 |
|---|---|---|---|
| `/zh/twitter-bookmarks` | 134 | 52，含已下载的 `page-012503699327e9c6.js` 和 `layout-034a2f0afb38316d.js` | 侧栏：推文、用户、列表、X 设置、发现、周报、备份与恢复。文件夹 `Unsorted 0`。按钮是「连接」 |
| `/zh` | 78 | 42，资源树里有 twitter layout，没有书签 page chunk | 营销首页：功能、免费工具、定价、常见问题、搜索我的书签、试用演示。演示分类有 LLM 与 RAG、AI 智能体、加密研究、DeFi、基础设施、未分类，计数都是 0 |
| `/zh/twitter-bookmarks` 另一标签 | 151 | 只列出 10 个脚本，入口却是 `(x-settings)/layout-7b6e5692640c9be6.js` | 同一套侧栏。按钮文案是 `@LingJingMaster 免费版`。有一个导航计数 80 |

两个书签标签共同的控件：

- 搜索框占位：`试试：claude、"claude code"、claude and code`，旁边有「搜索语法帮助」。
- 视图：网格、画廊、统计。
- 过滤按钮的说明是日期、文件夹、关键词、用户。
- 导出按钮的说明写的是 PDF、CSV、JSON、Markdown、Obsidian。这和 layout 源码里的导出枚举（只有 JSON、HTML、CSV）不一致。按钮文案是界面承诺，不能当成已经实现了这些格式。
- AI 按钮文案是「用 AI 整理推特书签」。

这段已经加载完的 performance 时间线里，站点请求只有：

- `GET /api/auth/get-session`，多次，状态 200。
- 登录态那个书签标签还有 `GET /api/payments/paddle/subscription/<id>`，状态 200。id 已从快照里删掉。界面仍显示免费版。
- `https://x.twillot.com/api/surveys/`，以及 `x.twillot.com` 的 `/e/`、`/flags/`、`/i/v0/e/`、`/s/`。这是分析脚本，静态里对应到带 `isInstalled=false` 的那段事件采集。
- `https://refgrow.com/tracking.js` 和 `/api/public/tracking-data`。
- `app.chatwoot.com`，客服挂件。
- 登录态标签有 `pbs.twimg.com` 和 `abs.twimg.com` 的图片。没有保存图片或推文正文。

没有出现 `x.com/i/api/graphql`，也没有 `/api/classify`。这只说明快照当下没有正在跑的同步或分类，不能说明这些接口不存在。侧栏链接还指向 `/twitter-following`、`/twitter-lists`、`/twitter-muted-keywords`、`/twitter-reports`、`/twitter-vault`、`/download-twitter-data`、`/zh/twitter-apps`、`/zh/twitter-timeline-management`。这些路由没有逐个解包。

没有 source map。函数名大量被压成单字母。下面的模块号、query id 和字段名都是包内字面量。

---

# 第一部分：扩展

## 它声称做什么，包里实际有什么

`_locales/zh_CN/messages.json` 的描述是：搜索、整理和导出书签与点赞，支持 CSV、JSON、Markdown、PDF，以及文件夹、AI 分类、批量删除、媒体下载。

这些产品功能不在 CRX 里。包内没有书签列表、搜索索引、导出器和分类器。扩展提供的是网页要靠它才能做的浏览器能力。

权限：`storage`、`declarativeNetRequest`、`declarativeNetRequestWithHostAccess`、`downloads`。主机权限：`https://*.x.com/*`、`https://*.twillot.com/*`。地址栏关键字 `tt`。没有 `action.default_popup`，点击图标走 `chrome.action.onClicked`。

## 入口

| Manifest 入口 | 注入 | 加载的模块 | 作用 |
|---|---|---|---|
| `service-worker-loader.js` | service worker | `assets/chunk-e734bcb3.js` | 消息处理和 Chrome API |
| `cs.ts-loader-c69e56eb.js` | `x.com`，`document_start` | 向页面插入 `chunk-fe557e19.js` | 改页面的 `JSON.parse` |
| `cs.ts-loader-53a99909.js` | `x.com`，`document_start` | 向页面插入 `chunk-ae953e6d.js` | 截书签请求的鉴权头 |
| `cs.ts-loader-1af02176.js` | `x.com`，`document_end` | `chunk-4cb0ffee.js` | 推文图片上的下载按钮 |
| `cs.ts-loader-c64d156b.js` | `x.com`，`document_end` | `chunk-343b656b.js` | 用户名上的导出按钮 |
| `index.ts-loader-e595f16e.js` | `www.twillot.com`，`document_end` | `chunk-e51f8194.js` | 网页和扩展之间的桥 |

页面脚本用 `<script type="module" src="chrome.runtime.getURL(...)">` 插进 `document.head`，所以跑在页面环境，能改页面自己的 `fetch` 和 `JSON.parse`。隔离世界的 content script 只负责转发和读 `chrome.*`。

`chunk-6aa1ff38.js` 是三端共用的消息类。环境写死为 `"chrome"`，因此 `I`（是否 Safari）为 false。自定义事件名是 `ContentScriptMessage` 和 `WebPageMessage`。service worker 用 `chrome.runtime.onMessage`，按 `message.type` 找 handler。

## Service worker 的 handler

实现在 `artifacts/crx-unpacked/assets/chunk-e734bcb3.js`。Chrome 构建会注册下载；Safari 分支编进来了，但这份包走不到。

| type | 行为 |
|---|---|
| `getCapabilities` | 返回 target、版本。Chrome 上 `downloads: true`、`tabGroups: true`、`openTabs: false`、`proxiedFetch: true`、`requiresXTab: false`、`storage: true` |
| `fetch` | 把 data URL 转成 `FormData`/`Blob`，然后 POST，`credentials: "include"`，默认超时 15 秒。返回 status、JSON、第一条 error，以及 `X-Rate-Limit-Limit/Remaining/Reset` |
| `getPageContent` | `fetch(url, { credentials: "include" })` 后取 text |
| `getStorage` / `setStorage` / `clearStorage` | `chrome.storage[local\|sync\|session]`。Safari 才把 session 改存 local |
| `openTab` / `closeTab` | `chrome.tabs.create` / `remove` |
| `download` / `cancelDownload` | `chrome.downloads.download` / `cancel` |
| `copyIndexedDBTable` | 打开调用方给出的任意库和 store，用 cursor 按 offset/batch 返回 schema 和数据 |
| `invoke` / `invokeAsync` | 用路径字符串取 `chrome.*` 再调用。网页可以打到权限范围内的任意 API，不限于上面的具名 handler |
| `auth-capture` | 把 `csrf`、`token`、`uuid` 写入 `chrome.storage.session` |
| `block-ads` | 见下面的时间线过滤 |

`invoke` 是泛化桥。已打开的 `www.twillot.com` 不需要扩展再发一版，就能调用新的 Chrome API，只要权限已经声明。

## 鉴权截取

`chunk-ae953e6d.js` 替换 `window.fetch` 和 `XMLHttpRequest.open` / `setRequestHeader`。只处理 origin 为 `https://x.com`、路径含 `/Bookmarks` 或 `/BookmarkFoldersSlice` 的请求，从请求头取出：

- `x-csrf-token`
- `authorization`
- `x-client-uuid`

三者组成的字符串变化时，才派发 `twillot-auth-captured`。content script `chunk-437dd5a0.js` 转发为 `{ type: "auth-capture", payload }`。service worker 写入 session storage。

网页之后用 `getStorage` 把这三个值拿回去，放进自己的 X 请求头。网页不保存 X 的 cookie。cookie 只在扩展代发时以 `credentials: "include"` 带上。

## 声明式网络规则

`src/rules.json` 两条静态规则，代码里没有再调用 `chrome.declarativeNetRequest`：

1. `||x.com`：请求头 `Origin` 设为 `https://x.com`。
2. `||apis.twillot.com`：请求头 `Origin` 设为 `https://apis.twillot.com`。

资源类型包括 `main_frame`、`xmlhttprequest`、`sub_frame`、`script`、`image`、`stylesheet`、`object`、`other`。目的是让扩展发起的请求看起来像对应站点自己发出的。

## 时间线过滤

`chunk-fe557e19.js` 覆盖页面的 `JSON.parse`。设置键是 `block-ads_settings`。content script `chunk-b17512b5.js` 启动时从 `chrome.storage.sync` 读，没有则读 local，再写入页面 `localStorage`。默认 `disabled: true`。

盯的 GraphQL 路径：

- `data.home.home_timeline_urt.instructions`
- `data.threaded_conversation_with_injections_v2.instructions`
- `data.search_by_raw_query.search_timeline.timeline.instructions`

从 `TimelineAddEntries` 去掉带 `promotedMetadata` 的条目。未禁用时还可以按转推、组织高亮名（`affiliates_highlighted_label.label.description`）、关键词（`legacy.full_text`、用户简介、显示名）剔除。然后派发 `twillot-ad-blocked`，detail 里是 `promotedTweets` 和 `filterOutTweets`。

service worker 收到 `block-ads` 之后：

1. sync 里没有 `profile` 时，`fetch("https://x.com/")`，从 HTML 里截 `"users":{...}` 的第一项，写入 `chrome.storage.sync.profile`。
2. 推广推文 POST 到 `https://apix.twillot.com/xblock`。Authorization 是把 `profile.id_str` 的数字映射成 `A`–`J`，拼上时间戳的 base36，再 `btoa`。失败最多 3 次，间隔 2 秒。
3. 被过滤的推文写入扩展自己的 IndexedDB：库名 `twillot`，store `filter_out_tweets`，索引 `ownerId`、`tid`、`uid`、`reason`、`createdAt`。

这个库和网页那个版本 41 的 `twillot` 不是同一个库。扩展页面和网页的 origin 不同，IndexedDB 不共享。名字碰巧一样。

## X 页面上的两个按钮

`chunk-4cb0ffee.js`：鼠标进入 `div[data-testid="tweetPhoto"]` 时盖链接，指向 `https://www.twillot.com/twitter-downloader/{statusId}?from=timeline&isQuote=`。`chrome.storage.sync.timeline_settings.disabled` 为真则不挂。`execMode` 读了但没用，监听写死 `mouseenter`。

`chunk-343b656b.js`：鼠标进入 `[data-testid="UserName"]` 时链到 `https://www.twillot.com/export-twitter-posts?publicUid=`。这里的 uid 是 `location.pathname` 第一段，也就是 screen name，不是数字 user id。

图标来自 `chunk-bb6ecfb7.js`，一个内联 SVG。

## 浏览器壳

常量在 `chunk-6fcbf88f.js`：

- `WELCOME`：`https://www.twillot.com/welcome`
- `BOOKMARKS`：`https://www.twillot.com/twitter-bookmarks`
- `SYNC`：`https://www.twillot.com/twitter-sync`
- `AUTHENTICATE`：`https://x.com/i/bookmarks?twillot=reauth`
- `UNINSTALL`：`https://s.twillot.com/twitter-bookmarks-uninstall`

行为：

- 安装、点击图标、版本 minor 为奇数：打开 welcome，带 `isInstalled=true|false`。
- 地址栏 `tt`：打开 `https://www.twillot.com/twitter-bookmarks&q=...`。源码用的是 `&`，不是 `?`。
- 卸载回访带 `version` 和 `lang`。
- `www.twillot.com` 上的 content script 每 3 秒 `chrome.runtime.connect({ name: "keep-alive" })` 并 `postMessage({ data: "ping" })`，用来拖住 service worker。同时派发 `twillot-installed`。

## 编进包里但 Chrome 构建不走的代理

`__xProxyWork`、`__xProxyTab`、端口名 `x-proxy-keepalive`、消息 `x-proxy-result` 只在 Safari 标志为真时启用。本包该标志为 false。逻辑是开一个不激活的 `https://x.com/` 标签，45 秒超时，空闲约 5 分钟后关掉，并用 `chrome.runtime.getPlatformInfo` 做 15 秒保活。没有任何 content script 消费 `__xProxyWork`。Chrome 上的 `fetch` 直接在 service worker 里发。

---

# 第二部分：网页

技术栈是 Next.js App Router。路由文件名是 `app/[locale]/(twitter)/twitter-bookmarks`。页面 chunk 只有约 2 KB，大量逻辑在共享 chunk 里。核心文件：

| 文件 | 大小 | 角色 |
|---|---|---|
| `artifacts/web/chunks/app__%5Blocale%5D__(twitter)__twitter-bookmarks__page-012503699327e9c6.js` | 2 KB | `WeeklyReportBookmarkSyncTrigger` |
| `artifacts/web/chunks/6936-adc26ac08c4184b2.js` | 79 KB | IndexedDB、X 端点表、请求封装、类别状态、响应解析 |
| `artifacts/web/chunks/7720-bb95da3f7420e7d0.js` | 39 KB | 增量同步、全量同步、帖子回填、列表成员同步 |
| `artifacts/web/chunks/app__%5Blocale%5D__(twitter)__layout-034a2f0afb38316d.js` | 318 KB | 导出、AI 分类、布局 |
| `artifacts/web/slices/slice-*.txt` | | 上面几个文件的阅读片段 |

## 这个 URL 打开时发生什么

`WeeklyReportBookmarkSyncTrigger`：

- `sync=bookmark-full` 时调用 `startAutoFullSync("bookmark")`，再把该查询参数从地址栏去掉。
- 待同步类别是 `bookmark` 时：如果扩展未安装或没有可用登录态，发 `{ kind: "twitter-auth", category: "bookmark", force: true, reason: "weekly-report-bookmark-sync" }`；否则打开书签同步抽屉 `setSyncSheetbyCategory("bookmark", true)`。

`isInstalled=true` 不是「扩展已安装」。探测逻辑在 layout 和 `4630`：扩展未安装且查询参数是 `isInstalled=false` 时，`needsReload` 为真。`6936` 里，地址包含 `isInstalled=false` 时向分析端打 `user_install`。扩展是否存在，看运行时消息，不看这个查询参数。

同一状态机还管这些类别：`bookmark`、`like`、`post`、`reply`、`following`、`follower`、`blocked`、`vault`、`public-post`、`public-follower`、`public-following`、`public-post-reply`、`list-member`。书签只是 `category_name === "bookmark"`。

`actionable` 的定义：扩展已安装，且 `currentUser.auth` 存在。

## 和扩展的消息

网页侧消息类同样是 `getInstance("webpage")`，通过 `ContentScriptMessage` 交给 `www.twillot.com` 上的 content script，再 `chrome.runtime.sendMessage`。

观察到的调用：

- `getStorage`，position `session`，keys `csrf`、`token`、`uuid`
- `getStorage` / `setStorage`，sync 和 local 各写一份（时间线设置、广告过滤设置这一类）
- `clearStorage`
- `fetch`，把扩展返回的 status、JSON、rate limit 交回同步循环
- `getPageContent`，url `https://x.com`，用来做后面的 transaction id
- `invoke`，`runtime.getManifest`

登录态不在网页 cookie 里。没有扩展，这些调用没有接收方，全量同步函数会直接打日志并返回空结果：`Full sync skipped, extension not installed`。

## 请求怎么发给 X

封装在 `6936` 的 `Em`（阅读片段 `slice-em.txt`）。步骤：

1. 从 `currentUser.auth` 取 `csrf`、`token`、`uuid`。没有 token 则返回 401，文案是需要重新授权。这些值来自扩展 session storage。
2. `FormData` 里的 Blob 先转成 data URL，因为消息通道走 JSON。
3. 头包括 `Authorization`、`x-csrf-token`、`x-client-uuid`、`x-twitter-auth-type: OAuth2Session`、`x-twitter-active-user: true`、`x-twitter-client-language`。
4. POST，以及调用方标记过的部分 GET，会再加 `x-client-transaction-id`。它用 `getPageContent("https://x.com")` 拿到的首页 HTML 计算。算法在 `6936` 的 `generateTransactionId`，这里不复述。算错时，部分接口返回 404，客户端把这种 404 当成 txid 无效。
5. 真正的 HTTP 由扩展的 `fetch` handler 发出，所以带上浏览器里 `x.com` 的 cookie。
6. 401 或错误码 353：登出并要求重新授权。错误码 226：403，提示稍后再试。

## 书签同步循环

全量和增量都在 `7720`，阅读片段是 `slice-loop.txt`。类别表在 `6936` 的 `sJ`：

| 类别 | 端点 | 写入 |
|---|---|---|
| `bookmark` | `LIST_BOOKMARKS` | posts |
| `post` / `public-post` | `USER_TWEETS_AND_REPLIES` | posts |
| `media` | `USER_MEDIA` | posts |
| `like` | `USER_LIKES` | posts |
| `follower` | `FOLLOWERS` | users |
| `following` / `public-following` | `FOLLOWING` | users |
| `blocked` | `BLOCKED_ALL` | users |
| `public-follower` | `FOLLOWERS_VERIFIED` | users |
| `public-post-reply` | 搜索 `conversation_id:`，product `Latest` | posts |

书签列表请求：

```text
GET https://x.com/i/api/graphql/tUVliYsHyxrQIT4HXUWNdA/Bookmarks
  ?variables={ cursor, count, includePromotedContent: false }&features=...
```

增量 `count` 为 20，全量 `count` 为 100。文件夹内推文是另一个请求：`bookmark_collection_id` 加 cursor，端点 `BookmarkFolderTimeline`。

全量循环：

- 没装扩展就返回 `{ syncedCount: 0, earliestCreatedAt: null }`。
- 公开类别必须有 `publicUid`。
- cursor 存在 settings 里，键和类别、用户有关，下次接着翻。
- 每页解析出 `docs`、`cursorEntry`、`dataEntries`、`availabilityStats`。
- cursor 为空视为这一页无效，继续。
- `dataEntries` 为空，或 cursor 与上次相同，则结束。
- 可按起始日期截断：最后一条 `created_at` 早于起点就停，并丢掉更早的行。
- 达到行数上限且没有 `suppressUpgradeOnLimit`：停下并打开付费墙 `isCreativePricingVisible`。
- 429：停下，用 `rate_limit.reset` 记 `nextRequestTime`。
- 401：要求重新授权并停。
- 其他失败：等 5 秒再试。
- 成功且条数大于 0：把 cursor 写回 settings，并放一次 confetti。

增量循环类似，但本批真正新写入的文档少于 10 条就停。新行记在内存的 `newItems` 上。

帖子回填不走书签接口。先取用户 legacy 的 `screen_name` 和账号创建时间，再按屏幕名和时间范围搜，结果先积在内存，每 3 秒批量写入。`id` 由 owner、类别、tweet id 合成，`folder` 默认 `unsorted`。搜索没有结果时，把「No tweets found for user」当成完成，而不是失败。

## 响应怎么变成一行

`6936` 的解析函数（`slice-norm.txt`）从指令列表里取 `TimelineAddEntries`，再拆 item、module 和 cursor。推文类型：

- `TweetWithVisibilityResults`：用里面的 `tweet`
- `Tweet`：自身，并递归引用和转推
- `TweetTombstone`、`TweetUnavailable`：计为不可用，不进正常文档

用户行要求 `__typename === "TimelineUser"` 且 `user_results.result.legacy` 存在。

公开类别同步时，如果状态里已有 `publicUser`，会把 `screen_name`、`name`、`profile_image_url_https` 抄进行的 `_data`。

## IndexedDB

库名 `twillot`，`indexedDB.open(name, 41)`。升级函数保证四个 store，主键都是 `id`：

| store | 常量 | 用途 |
|---|---|---|
| `posts` | `ZJ` | 书签、点赞、帖子 |
| `users` | `GE` | 关注、粉丝等 |
| `settings` | `K6` | cursor 和选项 |
| `tweets_history` | | 历史，另有 `user_tweets_index`（`user_id + created_at`） |

`posts` 的索引：

| 名字 | keyPath |
|---|---|
| `owner_category_sort_index` | `owner_id`, `category_name`, `sort_index` |
| `public_index` | `owner_id`, `category_name`, `user_id`, `sort_index` |
| `public_count_index` | `owner_id`, `category_name`, `request_at` |
| `owner_category_created_at_index` | `owner_id`, `category_name`, `created_at` |
| `owner_category_public_created_at_sort_index` | `owner_id`, `category_name`, `user_id`, `created_at` |
| `owner_user_created_at` | `owner_id`, `user_id`, `created_at` |
| `owner_created_at_index` | `owner_id`, `created_at` |
| `onwer_category_index` | `owner_id`, `category_name`, `folder` |

最后这个名字少了一个 `w`，是源码里的拼写。要打开用户已经同步过的库，就不能改这个名字。

列表查询走 `owner_id + category_name + sort_index` 的范围游标。周报按 `owner_category_created_at_index` 对 `bookmark` 做时间范围 `count`。

一行帖子至少这些列参与索引或查询：`id`、`owner_id`、`category_name`、`sort_index`、`folder`、`is_locked`、`is_thread`、`conversations`。用户行再加 `user_id`、`username`、`screen_name`、`avatar_url`。其余字段原样放在记录里，不进索引。插入前会按这个名单把索引列和剩余 `_data` 拆开。

`findHandler` 对书签会去重。`insertHandler` 写 `posts`。文件夹统计用 `onwer_category_index` 扫 `folder` 字段。

扩展里那个 `filter_out_tweets` 库不要和这个库混。origin 不同，版本也不同。

## GraphQL query id

前缀是 `https://x.com/i/api/graphql/`。下表是 `6936` 里的枚举，X 更换 id 后同步会断。只列书签和同步会碰到的；发帖、删帖、转推、拉黑、取消关注也在同一张表里，这里不展开成请求模板。

| 操作 | query id | 路径后缀 |
|---|---|---|
| 书签列表 | `tUVliYsHyxrQIT4HXUWNdA` | `/Bookmarks` |
| 创建书签 | `aoDbu3RHznuiSkQ9aNM67Q` | `/CreateBookmark` |
| 删除书签 | `Wlmlj2-xzyS1GN3a6cj-mQ` | `/DeleteBookmark` |
| 清空书签 | `skiACZKC1GDYli-M8RzEPQ` | `/BookmarksAllDelete` |
| 文件夹列表 | `i78YDd0Tza-dV4SYs58kRg` | `/BookmarkFoldersSlice` |
| 文件夹内推文 | `7cxflqGIowBX_AJyETopRQ` | `/BookmarkFolderTimeline` |
| 用户推文 | `gQlOy4mD5C8M8fYxqa0FJg` | `/UserTweets` |
| 推文和回复 | `Hk4KlJ-ONjlJsucqR55P7g` | `/UserTweetsAndReplies` |
| 用户媒体 | `dexO_2tohK86JDudXXG3Yw` | `/UserMedia` |
| 用户点赞 | `aeJWz--kknVBOl7wQ7gh7Q` | `/UserLikes` |
| 点赞时间线 | `Ov0pT_9__tQmK-XIzOf7pQ` | `/Likes` |
| 粉丝 | `bTRZD3w3wQv72oNU3lV6Rw` | `/Followers` |
| 关注 | `UEMg7scHEoC_FsYmXhkRkQ` | `/Following` |
| 已验证粉丝 | `hf2B_p-eEZQOrNF1brf50Q` | |
| 屏蔽列表 | `Izxh_kzDaIUZif4NFUl9jQ` | |
| 按 rest id 取推文 | `0aTrQMKgj95K791yXeNDRA` | `/TweetResultByRestId`，主机有一处是 `api.x.com` |
| 推文详情 | `jd3V43oDY9cY7obs1YMfbQ` | `/TweetDetail` |
| 用户详情 | `QbG3Wmx-boVUvUqhc3XLqA` | `/UserByRestId` |
| 按屏幕名 | `jUKA--0QkqGIFhmfRZdWrQ` | `/UserByScreenName` |

另外出现过的固定 URL：

- `https://x.com/i/api/graphql/uGjEfWQSYF3MLxu5TVEiRA/SearchTimeline`
- `https://upload.x.com/i/media/upload.json`
- `https://apix.twillot.com/x`
- `https://apix.twillot.com/x/get-active-user-tweets`
- `https://apix.twillot.com/xblock`（这是扩展在过滤广告时调用的，不是书签页同步）

## AI 分类

在 layout，片段 `slice-classify2.txt`。浏览器逐条 POST：

- 推文：`/api/classify`，允许新建文件夹时改为 `/api/classify/dynamic`
- 用户：`/api/classify-user`，同样可加 `/dynamic`

推文请求体是 `tweetText` 加 `folders`。普通推文的正文截到 280 字；文章用标题加 `preview_text`。用户请求体是 `name`、`description`、`screen_name`、`folders`。头 `X-Request-Id` 是 `btoa(JSON.stringify({ reqCount, uid, timestamp }))`。

响应用 `data.folder`，去掉方括号后写回本地 `folder`。已有文件夹且选择跳过时不请求。已有的非 `unsorted` 文件夹少于 3 个、并且不允许新建时，不会开始。没有 `aiCategorization` 权益时直接打开付费墙。默认并发 3 或 10，每条完成后再等 3 秒。

这个接口属于 Twillot 自己的服务器。本地插件拿不到，除非自己做分类器。

## 导出

layout 里的格式枚举只有 `JSON`、`HTML`、`CSV`。片段是 `slice-export.txt`。

- JSON：`JSON.stringify(rows, undefined, 2)`
- CSV：双引号转义，换行变成 `\n`，Blob 前加 UTF-8 BOM
- HTML：用记录的键做表头。用户导出可以走另一套列：用户、文件夹、简介、帖子数、粉丝、喜欢数、列表数、加入时间、URL、横幅。可选把图片嵌进去

下载方式是临时 `<a download>` 加 `URL.createObjectURL`。没有看到 jsPDF 或 docx。商店文案里的 Markdown 和 PDF 不在这个书签页的导出开关里。`4673` 里有 Markdown 字样，但是另一块 UI，不是这个导出器。

## 他们自己的 HTTP API

从全部 chunk 的字符串里看到的站点 API：

- `/api/auth`
- `/api/auth/get-session`
- `/api/auth/refresh-membership`
- `/api/classify`
- `/api/classify-user`
- `/api/payments/paddle/discount/validate`
- `/api/payments/paddle/upgrade`
- `/api/payments/paddle/portal`
- `/api/payments/paddle/update`
- `/api/payments/paddle/subscription/`

会员刷新和 Paddle 是账号体系。个人本地库用不到。

## 页面脚本之间的关系

```text
twitter-bookmarks/page.js
  WeeklyReportBookmarkSyncTrigger
    startAutoFullSync("bookmark") / 打开同步抽屉

7720
  增量 _()、全量 g()、帖子回填 w()、列表成员 b()
    调用 6936 的 sJ[category].fetchHandler / insertHandler

6936
  IDB 打开与索引
  sJ 端点表
  Em：组 X 请求头，sendMessage type=fetch
  把 TimelineAddEntries 解析成 docs + cursor

layout
  JSON/CSV/HTML 导出
  /api/classify 逐条整理
  isInstalled 查询参数与付费墙
```

---

# 第三部分：两边怎么接上

```text
x.com 页面
  chunk-ae953e6d.js 钩住发往 /Bookmarks 的请求
    → content script
    → service worker 写入 chrome.storage.session

www.twillot.com/zh/twitter-bookmarks
  getStorage(session, csrf/token/uuid)
  组 GraphQL URL 和头（含 transaction id）
  sendMessage({ type: "fetch" })
    → content script keep-alive + 转发
    → service worker 带 cookie POST/GET x.com
  解析 cursor
  写入网页 origin 的 IndexedDB twillot v41

扩展自己的 IndexedDB twillot / filter_out_tweets
  只给时间线广告过滤，不给书签库
```

所以「不能只装现在这个 CRX 就得到书签搜索和导出」是对的。缺的是网页里那 2.7 MB 脚本和它的 IndexedDB，不是 Chrome 做不到。

纯本地扩展如果要覆盖书签产品，需要自己重新实现的是网页这一侧：

1. 采集器。输入 cursor，输出文档和下一页 cursor。书签、文件夹、点赞分开。query id 放配置。
2. 扩展 origin 上的 IndexedDB。要读已有网页库才需要兼容 v41 和 `onwer_category_index` 这个错名；新库不必照抄错名，但也不能假装能打开旧库。网页库和扩展库本来就不在一个 origin，未打包扩展读不到用户在 `twillot.com` 里已经同步的数据，除非用现在的 `copyIndexedDBTable` 消息从网页里拷出来。
3. 会话。插件自己截头、自己发请求，不再经过网页消息桥。
4. 长时间同步放在扩展页或 offscreen 文档里。MV3 service worker 会被杀掉。现有网页每 3 秒连一次就是在保活。
5. 导出只读本地 `posts`。
6. AI 另接模型，或删掉。付款和公开主页可以不要。

X 的 query id 和 transaction id 仍会失效，这和上不上架无关。

## x.twillot.com 和备份格式

`https://x.twillot.com` 不是同步或导出服务器。`6936` 里把它当作 PostHog 的 `api_host`：`person_profiles: "identified_only"`，关闭了 session recording、performance 和 autocapture。只有查询串包含 `isInstalled=false` 时才额外打 `user_install`。CDP 里看到的 `/e/`、`/flags/`、`/i/v0/e/`、`/s/` 和 `/api/surveys/` 是这个分析端点的流量。书签数据不经过它。

`9103` 里的 AES 和 PBKDF2 是随支付组件打进来的 sjcl，和备份函数不在同一个文件。layout 里的 `BackupRestore` 没有 `encrypt`、口令或 `crypto.subtle` 加密调用。本地备份是把各个 object store 流式写成 JSONL，再用 deflate（level 9）打成 ZIP，文件名 `backup-<时间戳>.zip`。云备份走自己的 `/api/cloud-backup/manifest`、`manifest/update`、`presigned-url`、`delete`，用登录 token 要预签名地址。界面上的「加密备份」如果存在，这份书签页脚本里没有对应实现。ZIP 压缩不等于加密，解压后就是 JSONL 明文。

## 个人使用功能核对

这里只算自己用的功能：同步自己的数据、本地查找、文件夹、导出、备份、扩展上的入口。付款、PostHog、客服不算。结论是没有全部摸清。下面按证据分开。

已经写进前文、并且实现路径对得上的：

- 扩展截取书签鉴权头，网页用 `fetch` 代发。
- 书签、点赞、帖子、回复、关注、粉丝、屏蔽、公开账号、列表成员的分页同步，以及 cursor、429、401、行数上限。
- IndexedDB `twillot` v41 的 store 和索引。
- 客户端 JSON、CSV、HTML 导出。
- 本地 ZIP/JSONL 备份，以及云备份的预签名接口。
- X 页面上的两个外链按钮，和时间线广告过滤。
- AI 分类的请求形状。分类本身在他们的服务器，个人本地版不能直接复用。

这次补上的本地搜索。实现在 `9091` 的 `PostTable` 和 `5074` 的查询解析，之前文档没写：

- 列表不是全文索引。先按 `owner_id + category_name + sort_index` 打开游标，再对每一行跑谓词，凑满一页就记下 IndexedDB 的 cursor key。翻页用上一页的 key，不把整库读进内存。地址栏 `q` 会覆盖当前关键词；`tweetId` 会按合成 id 直接取一条并打开预览。
- 推文查询字段：`keyword`、`folder`、`contentType`、`postType`、`startTime`、`endTime`、`userIds`、`preferOldest`。
- 关键词先按空白切词，双引号里的内容算一个词。`and` 表示这些词都要出现，`or` 分成两组，组内是且、组间是或。`*` 变成任意字符。匹配范围是 `full_text`，以及文章的 `title` 和 `preview_text`。大小写不敏感。
- `contentType` 看 `has_gif`、`has_image`、`has_video`，以及有没有 `article`。`postType` 看 `is_repost`、`is_reply`、`is_quote`；`post` 表示这三个都不是。`unsorted` 文件夹会把空文件夹和名为 unsorted 的行算在一起。日期用 `created_at` 的秒时间戳。
- 用户列表是另一套查询：关键词、文件夹、`canDm`、`isProtected`，以及发帖效率、发帖数、粉丝数的上下界。具体效率怎么算，这次没展开。
- 视图状态至少有 `grid`。画廊和统计在脚本里有对应名字，统计用 `contentTypeStats`、按年的 `dates` 和 `users`。三种视图的渲染细节没有逐组件读完。

删除、媒体、列表、保险库、周报和导出文案，这次补上：

- 删除在 layout 的确认框里。选中行的 id 用 `_` 拆出 tweet id。书签走 `DELETE_BOOKMARK`，点赞走 `DELETE_LIKE`，回复、关注、粉丝、屏蔽和列表成员各有自己的远程函数。返回如果被判定限流就停。成功后从内存列表拿掉，并删 IndexedDB 里对应的行。另有 `skipRemote: true`，只删本地、不打 X。清空全部书签是两步：`bN(uid, "bookmark")` 按所有者和类别删本地索引范围，再 POST `BOOKMARKS_ALL_DELETE`，然后重置文件夹计数。
- 媒体导出有三种模式。`download`：扩展 `capabilities.downloads` 不为 false 时，`sendMessage({ type: "download", url, filename })`，扩展里就是 `chrome.downloads.download`；每条启动超过 15 秒算失败。`twillot-downloader`：写出一份 `.twillot.json`。第三种是 `twillot-media-urls-日期.txt`，里面是 URL 和保存路径。可以按文件夹分目录。预览卡片上的「下载」仍然只是链到 `/twitter-downloader/{tweetId}?from=preview-tweet`，那个页面的脚本不在这次书签页的 46 个 chunk 里。
- 列表成员除了同步，还有三个写操作：`CreateList`、`ListAddMember`（`listId`、`userId`）、`ListRemoveMember`。本地用 `list-member` 类别的合成 id 检查这个人是不是已经在库里。
- `vault` 是默认类别，表格把回复、引用、转帖和普通帖混在一起。读取不是扫本地书签库，而是 POST `https://apix.twillot.com/x/vaults`，正文是 `owner_id`、`offset`、`limit`，头里带 Authorization。同主机还有 `/tweet-detail` 和 `/sync-user-tweets`。它的关联类别列表是空的，不走书签那条 GraphQL 同步。
- 周报：书签页在 `sync=bookmark-full` 时先全量同步，另一条路径会关同步抽屉并 `router` 到 `/twitter-reports`。额度写在 `6936`：免费版每天 0 次、0 条、0 周；mini 是 1 次、50 条、4 周；basic 是 5 次、200 条、52 周；pro 是 10 次、300 条、520 周。周报页面怎么把这些推文写成一篇报告，不在已下载的书签页脚本里。
- 屏蔽词的执行仍是扩展里那个 `JSON.parse` 钩子，设置键 `block-ads_settings`。书签页脚本只有侧栏链接 `/twitter-muted-keywords`，没有这页的设置界面。
- 导出按钮的无障碍文案写了 PDF、CSV、JSON、Markdown、Obsidian。已加载脚本里没有 jsPDF、pdfmake、pdf-lib，也没有 `application/pdf`。`markdown` 出现的地方是 `markdown-it`，用来渲染，不是导出。Obsidian 这个词只出现在按钮文案里。能对上代码的导出仍是 JSON、CSV、HTML，外加上面的媒体三种模式。
- 地址栏关键字 `tt` 只打开网页，不是本地搜索。

仍没有读完的只剩两块，因为它们的页面脚本没有出现在这次书签页加载列表里：`/twitter-reports` 怎么生成正文，以及 `/twitter-downloader` 和 `/twitter-muted-keywords` 各自的页面实现。个人书签库本身的同步、搜索、筛选、删除、导出、备份和媒体下载通道，现在是清楚的。

## 推特关系管理

关注、粉丝、屏蔽和列表成员用的是同一套用户表 `users`，类别分别是 `following`、`follower`、`blocked`、`list-member`。公开账号另有 `public-following`、`public-follower`（已验证粉丝）。同步端点已经写在类别表里。管理动作在 layout 的删除确认框和 `CleanInactiveUsers` 里，之前没有分开写。

选中后的远程动作：

| 当前类别 | 动作 | 请求 |
|---|---|---|
| `following` | 取消关注 | POST `https://x.com/i/api/1.1/friendships/destroy.json`，表单正文是一串 `include_*` 加 `user_id` |
| `follower` | 移除粉丝 | POST GraphQL `QpNfg0kpPRfjROQ_9eOLXA`，`variables.target_user_id` |
| `blocked` | 取消拉黑 | POST `https://x.com/i/api/1.1/blocks/destroy.json`，表单只有 `user_id` |
| `list-member` | 移出列表 | `ListRemoveMember`，`listId` 来自当前列表，`userId` 来自行 id |

id 都是本地合成 id 用 `_` 切开后的最后一段。成功后删 `users` 里的行，和删书签同一条本地路径。`skipRemote` 同样只删本地。

清理不活跃账号是另一条批量流程，组件名 `CleanInactiveUsers`。没有 `cleanInactiveUsers` 权益就打开升级提示。范围是当前页或已选用户，时间是一周、一月、三月、半年或一年。屏幕名每 20 个一批，POST `https://apix.twillot.com/x/get-active-user-tweets`，正文是 `ids`、`start_date`、`end_date`、`product: "Top"`。它要的是这段时间里没有发帖的人：返回的 `remaining_ids` 如果长过这批的三分之一，就改走本地搜索。本地搜索用 X 的 `SearchTimeline`，查询是 `(from:a OR from:b) since:日期 until:日期`，product `Top`，从结果里划掉发过帖的屏幕名，剩下的就是不活跃。确认后，关注列表调用取消关注，粉丝列表调用移除粉丝，然后删本地行。

用户筛选字段是关键词、文件夹、能否私信 `canDm`、是否锁号 `isProtected`，以及发帖数、粉丝数、发帖效率的上下界。效率的计算公式这次没展开。

这包脚本里没有找到：新关注（`friendships/create`）、新拉黑（`blocks/create`）、静音或取消静音的接口。屏蔽词仍是时间线过滤，不是对某个用户静音。
