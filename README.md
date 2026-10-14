# xShelf

[中文](#中文) | [English](#english)

## 中文

xShelf 是一款本地优先的 Chrome 扩展，用于同步、搜索、整理、导出和备份个人 X 数据。它支持喜欢、书签、自己发布的推文与回复、正在关注的账号和已屏蔽的账号。

所有资料都保存在扩展自身的 IndexedDB 中。xShelf 没有用户账号、分析 SDK、支付系统或远程服务器。

### 主要功能

- 增量同步喜欢、书签、推文、回复、正在关注和已屏蔽账号
- 将同一条推文的书签记录与喜欢记录分开保存
- 兼容 X 新旧身份、头像和媒体响应字段
- 显示来自 `pbs.twimg.com`、`abs.twimg.com` 和 X 视频域名的媒体
- 从安全的 `t.co → X` 链接补全缺失的图片预览
- 在扩展页面无法直接加载 X 图片时，通过受权限限制的后台代理读取图片
- 搜索短语，并支持 `and`、`or` 和 `*` 通配符
- 按标签、日期、内容类型和帖子类型筛选
- 搜索用户名、账号、简介和标签
- 在紧凑视图、媒体画廊和本地统计之间切换
- 为一条内容添加多个本地标签
- 新建、重命名和删除标签
- 批量添加或移除标签
- 批量选择并仅从本地删除内容，不影响 X 上的原始数据
- 导出已选内容；没有勾选时导出当前分类、标签、搜索和筛选范围
- 支持 Markdown、JSON、CSV 和独立 HTML 导出
- 将所有本地数据备份为包含 JSONL 文件的 ZIP
- 导入兼容的 JSON、JSONL 和 ZIP 备份
- 默认使用浅色模式，并允许用户手动切换深色模式

X 使用未公开且没有正式文档的内部 API。X 修改请求结构后，同步功能可能失效。建议定期导出或备份重要资料。

### 开发安装

1. 运行 `npm install`。
2. 打开 `chrome://extensions`，启用“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本仓库目录。
4. 点击浏览器工具栏中的 xShelf 图标打开应用。
5. 选择一个分类并点击连接或同步。xShelf 会在临时标签页中打开对应的 X 页面，捕获真实列表请求后自动关闭该标签页，返回原来的 xShelf 页面并开始分页同步。

各分类使用的 X 页面：

- 喜欢：`https://x.com/i/history/likes`
- 书签：`https://x.com/i/bookmarks`
- 推文：`https://x.com/{当前账号}`
- 回复：`https://x.com/{当前账号}/with_replies`
- 正在关注：当前账号的关注列表
- 已屏蔽：`https://x.com/settings/blocked/all`

xShelf 会从当前登录的 X 会话中识别账号名，不会在代码中写死用户账号。

项目不需要构建步骤：

```bash
npm test
npm run package
```

`npm test` 运行解析、搜索、标签和导出测试。`npm run package` 生成 `dist/xshelf.zip`。

### 同步原理

xShelf 使用 Chrome 的只读 `webRequest` 监听器识别 X 页面发出的 GraphQL 列表请求。它会为每个分类保存一份请求模板到 `chrome.storage.session`，然后从已打开的 xShelf 页面逐页重放请求，并将标准化后的记录写入本地 IndexedDB。

xShelf 不读取或保存 X Cookie。捕获到的 `authorization` 和 `x-csrf-token` 请求头只保存在浏览器会话存储中，Chrome 退出后会消失。

每个分类在一次浏览器会话中通常只需要捕获一次。使用真实请求模板可以避免把某一组 GraphQL Query ID 和变量永久写死，也能更容易识别 X 的接口变化。

### 数据与安全边界

- 删除记录只会删除 xShelf 本地副本
- 删除标签只会移除本地标签关联
- xShelf 不会取消喜欢、移除书签、取消关注、解除屏蔽或删除 X 推文
- xShelf 不包含 Twillot 私有 API、AI 分类、计费、分析追踪或周报生成

由于扩展需要观察和重放 X 的授权请求头，并依赖 X 的内部 GraphQL API，当前版本更适合以“加载已解压的扩展程序”方式个人使用，并不适合直接提交 Chrome 应用商店审核。

### 许可证

本项目采用 [MIT License](LICENSE)。

---

## English

xShelf is a local-first Chrome extension for syncing, searching, organizing, exporting, and backing up personal X data. It supports likes, bookmarks, your posts and replies, accounts you follow, and blocked accounts.

All data stays in IndexedDB inside the extension. xShelf has no user accounts, analytics SDK, payment system, or remote server.

### Features

- Incrementally sync likes, bookmarks, posts, replies, following, and blocked accounts
- Keep bookmark and like copies of the same post as separate records
- Read both legacy and current X identity, avatar, and media response fields
- Render media from `pbs.twimg.com`, `abs.twimg.com`, and X video domains
- Resolve missing image previews through safe `t.co → X` links
- Use a permission-scoped background image proxy when an extension page cannot load X media directly
- Search phrases with `and`, `or`, and `*` wildcard support
- Filter by tag, date, content type, and post type
- Search names, handles, descriptions, and tags
- Switch between compact rows, a media gallery, and local statistics
- Add multiple local tags to each record
- Create, rename, and delete tags
- Add or remove tags in bulk
- Select and delete records locally without changing the original data on X
- Export selected records, or export the current category, tag, search, and filter scope when nothing is selected
- Export Markdown, JSON, CSV, and standalone HTML
- Back up all local stores as a ZIP containing JSONL files
- Import compatible JSON, JSONL, and ZIP backups
- Start in light mode and let the user switch dark mode manually

X uses private, undocumented APIs. Sync may break when X changes its request shape. Export or back up important data regularly.

### Development installation

1. Run `npm install`.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select this repository.
4. Open xShelf from its toolbar icon.
5. Select a category and click connect or sync. xShelf opens the matching X page in a temporary tab, captures the real list request, closes that tab, returns to the original xShelf page, and starts pagination automatically.

X pages used for each category:

- Likes: `https://x.com/i/history/likes`
- Bookmarks: `https://x.com/i/bookmarks`
- Posts: `https://x.com/{current-account}`
- Replies: `https://x.com/{current-account}/with_replies`
- Following: the current account's following list
- Blocked: `https://x.com/settings/blocked/all`

xShelf detects the current signed-in screen name from the X session. It never hard-codes a user account.

No build step is required:

```bash
npm test
npm run package
```

`npm test` runs parser, search, tag, and export tests. `npm run package` creates `dist/xshelf.zip`.

### How sync works

A read-only Chrome `webRequest` observer recognizes GraphQL list requests made by X. xShelf stores one request template per category in `chrome.storage.session`, replays one page at a time from the open xShelf tab, and writes normalized records to local IndexedDB.

xShelf does not read or store X cookies. Captured `authorization` and `x-csrf-token` headers live only in browser session storage and disappear when Chrome exits.

Each category normally needs to be observed only once per browser session. Capturing a real request template avoids permanently hard-coding one set of GraphQL query IDs and variables, and makes X API changes easier to detect.

### Data and security boundaries

- Deleting a record removes only the local xShelf copy
- Deleting a tag removes only local tag associations
- xShelf does not unlike, unbookmark, unfollow, unblock, or delete posts on X
- xShelf does not include Twillot private APIs, AI classification, billing, analytics, or weekly report generation

Because the extension observes and replays X authorization headers and depends on private X GraphQL APIs, the current build is better suited to personal unpacked use than direct Chrome Web Store publication.

### License

This project is licensed under the [MIT License](LICENSE).
