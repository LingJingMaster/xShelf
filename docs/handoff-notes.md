# 交给实现用的交接说明

完整叙述在 `docs/twillot-analysis.md`。这份只保留 2026-10-13 核对过的结论、文件位置和不要做的事。目标是个人本地使用的书签与关系管理，不是把 Twillot 的商业站原样开源。

证据是已保存的包，不是一次真实同步。网页语义图不完整，下面凡是写「代码里有」的，都在对应文件里重新搜到过字符串。

## 先读这些文件

| 要做的事 | 文件 |
|---|---|
| 扩展权限、入口、DNR | `artifacts/crx-unpacked/manifest.json`、`src/rules.json` |
| 扩展消息和代发 | `artifacts/crx-unpacked/assets/chunk-e734bcb3.js` |
| 鉴权截取 | `chunk-ae953e6d.js`，事件名在 `chunk-133312cf.js`：`auth-capture` / `twillot-auth-captured` |
| 时间线过滤 | `chunk-fe557e19.js`、`chunk-b17512b5.js` |
| 本地库、X 端点、请求头 | `artifacts/web/chunks/6936-adc26ac08c4184b2.js` |
| 同步循环 | `7720-bb95da3f7420e7d0.js` |
| 搜索谓词 | `9091-82e5e357bc639afd.js` 的 `PostTable` |
| 关键词语法 | `5074-c895b804f50bc8a8.js` 模块 `78793` 的 `function f` |
| 删除、清理不活跃、导出、备份、媒体 | `app__%5Blocale%5D__(twitter)__layout-034a2f0afb38316d.js` |
| 书签页入口 | `...twitter-bookmarks__page-012503699327e9c6.js` |

扩展版本是 manifest 里的 `11.0.9`。扩展 ID `flkokionhgagpmnhlngldhbfnblmenen` 不在 manifest 里，是商店包名。CRX 原始文件在 `downloads/`。

## 架构

网页才是书签库。扩展只做这些事：截取 X 书签请求上的 `x-csrf-token`、`authorization`、`x-client-uuid`，写入 `chrome.storage.session`；用 `credentials: "include"` 代发请求；`chrome.downloads`；时间线过滤。Chrome 构建不要走 `__xProxyWork` 隐藏标签，那个分支的 Safari 标志是 false。

两边各有一个名叫 `twillot` 的 IndexedDB，不能混：

- 网页 origin，版本 **41**。store：`posts`、`users`、`settings`、`tweets_history`。
- 扩展 origin，只有 `filter_out_tweets`，给定时线过滤用。

网页库有一个必须照抄的错名索引：`onwer_category_index`（少一个 w），keyPath 是 `owner_id, category_name, folder`。

## 个人功能里已经对上的

同步类别和写入位置：

| 类别 | 拉取 | 写入 |
|---|---|---|
| bookmark | `Bookmarks` | posts |
| like | `UserLikes` | posts |
| post / public-post | `UserTweetsAndReplies` | posts |
| follower | `Followers` | users |
| following / public-following | `Following` | users |
| blocked | `Blocked` 列表 | users |
| public-follower | 已验证粉丝 | users |
| list-member | 列表成员接口 | users |
| public-post-reply | 搜索 `conversation_id:` | posts |

全量每页 100，增量每页 20。增量在新写入少于 10 条时停。cursor 与上次相同或本页没有数据条目时停。429 记下 `rate_limit.reset`。401 或错误码 353 要求重新授权。免费额度到顶会打开付费墙，个人版可以把这个上限拿掉。

搜索不是全文索引。按 `owner_id + category_name + sort_index` 扫游标，谓词过滤后再分页。关键词：引号成词，`and` 全要出现，`or` 分组，`*` 任意字符。推文匹配 `full_text`，文章再匹配 `title` 和 `preview_text`。筛选还有文件夹、gif/图/视频/文章、转帖/回复/引用、日期、作者、`preferOldest`。用户另有 `canDm`、`isProtected`、发帖数、粉丝数、发帖效率。效率公式没有展开。

删除：合成 id 用 `_` 切开，最后一段是 X 的 id。成功后删内存行和 IndexedDB。`skipRemote: true` 只删本地。

| 类别 | 远程动作 |
|---|---|
| bookmark | `DELETE_BOOKMARK` |
| like | `DELETE_LIKE` |
| following | POST `friendships/destroy.json`，`user_id` |
| follower | POST `FOLLOWERS_REMOVE`，`target_user_id` |
| blocked | POST `blocks/destroy.json`，`user_id` |
| list-member | `ListRemoveMember` |

清空全部书签：先按 owner 和 `bookmark` 删本地范围，再 `BOOKMARKS_ALL_DELETE`。

清理不活跃账号在 layout 的 `CleanInactiveUsers`，不在 `7720`。没有权益会提示升级。屏幕名 20 个一批，POST `https://apix.twillot.com/x/get-active-user-tweets`。返回的 `remaining_ids` 若长过这批的三分之一，改用 X `SearchTimeline`：`(from:a OR from:b) since:… until:…`。确认后关注列表取关，粉丝列表移除粉丝。

导出代码只有 JSON、CSV、HTML。媒体另有三条：扩展 `type:"download"`、`.twillot.json`、URL 列表文本。备份是 deflate level 9 的 ZIP，里面是 JSONL，不是加密。

列表还有 `CreateList` 和 `ListAddMember`。

## 不要照界面文案实现

- PDF、Markdown、Obsidian：只有导出按钮的 aria-label。没有 PDF 库。`markdown-it` 是渲染。
- `x.twillot.com`：PostHog 分析，不是书签 API。
- `apix.twillot.com` 才是他们的数据接口：`/x/vaults`、`/x/get-active-user-tweets`、`/x/tweet-detail`、`/x/sync-user-tweets`、`/xblock`。保险库读的是 `/x/vaults`，不是本地书签库。
- 新关注、新拉黑、对用户静音：这 46 个脚本里没有对应 URL。
- 周报正文、`/twitter-downloader` 页面、`/twitter-muted-keywords` 设置页：不在这次加载的脚本里。屏蔽词的执行在扩展 `chunk-fe557e19.js`，默认 `disabled: true`。
- 地址栏 `tt` 打开的网址用了 `&q=`，不是 `?q=`。这是源码原样，复现时应改成正常查询串。

## 请求

网页不保存 X 的 cookie。头来自扩展 session 里的 `csrf`、`token`、`uuid`，再加 `x-twitter-auth-type: OAuth2Session`。部分 POST 和标记过的 GET 还要 `x-client-transaction-id`，算法在 `6936` 的 `generateTransactionId`，用 `https://x.com` 首页 HTML 计算。不要另写一套。X 一换 query id 或这个计算，同步就会断。

DNR 两条静态规则：发往 `x.com` 的请求把 `Origin` 设成 `https://x.com`，发往 `apis.twillot.com` 的设成 `https://apis.twillot.com`。

## 实现时的边界

个人版做到这些即可：扩展截头和代发、本地 IndexedDB、书签/点赞/帖子/关注/粉丝/屏蔽的同步和筛选、取关和移除粉丝、明文导出、ZIP 备份、媒体下载。

不要做：Paddle、PostHog、把他们的 `/api/classify` 当自己的接口、把按钮上不存在的格式做成假导出、把两个 `twillot` 数据库当成同一个。

长时间同步不要只放在 MV3 service worker 里，它会被杀掉。现有网页用每 3 秒一次的 `keep-alive` 端口拖住它。
