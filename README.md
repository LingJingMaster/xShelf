# xShelf

xShelf is a local-first Chrome extension for syncing, searching, organizing,
exporting, and backing up your personal X data. It supports bookmarks, likes,
your posts and replies, accounts you follow, followers, and blocked accounts.
Data stays in IndexedDB inside the extension. There is no xShelf account,
analytics SDK, payment system, or remote xShelf server.

## What works

- Incrementally sync bookmarks, likes, posts/replies, following, followers, and
  blocked accounts
- Keep the same post as separate bookmark and like records
- Read both legacy and current X identity/media response fields
- Render avatars from `pbs.twimg.com` and media from X image/video domains
- Resolve missing X media previews from safe `t.co → X` links and cache the
  resulting `og:image` locally
- Fall back to a permission-scoped background image proxy when an extension page
  cannot render `pbs.twimg.com` directly
- Search phrases, `and`, `or`, and `*` wildcards
- Filter posts by folder, date, content type, and post type
- Search user names, handles, and descriptions
- Switch between compact rows, a media gallery, and local statistics
- Organize every category into local folders
- Export the current category and filters as JSON, CSV, or standalone HTML
- Back up and restore all local stores as a ZIP containing JSONL files
- Import compatible JSON and JSONL exports

X uses private, undocumented APIs. Sync can break when X changes its request
shape. Export and back up your data regularly.

## Install for development

1. Run `npm install`.
2. Open `chrome://extensions`, enable Developer mode, then choose **Load
   unpacked** and select this repository.
3. Open xShelf from its toolbar icon.
4. Select a category and click connect/sync. xShelf opens the matching X page in
   a temporary tab. As soon as the expected timeline request appears, it closes
   that tab, returns to the original xShelf tab, and starts pagination
   automatically. Likes opens `https://x.com/i/history/likes` directly.
5. Posts, following, and followers may still require one click on the indicated
   profile tab because X has no account-independent URL for those lists. The
   return and synchronization remain automatic after that click.

No build step is required. Run `npm test` for parser tests and `npm run package`
to create `dist/xshelf.zip`.

## How sync works

Chrome's read-only `webRequest` observer recognizes the GraphQL request made by
X when you open one of the supported lists. It stores one request template per
category in `chrome.storage.session`. xShelf replays one page at a time from its
open app tab and writes normalized records locally. It does not read or store
your X cookies. Captured authorization headers live only in browser session
storage and disappear when Chrome exits.

A category only needs an observed X request once per browser session. The
connect flow remembers the originating xShelf tab, opens X, captures the real
request template, returns to xShelf, and starts syncing automatically. This
request-template approach avoids hard-coding a single set of GraphQL variables
for every account and makes query-ID changes easier to detect.

## Project boundaries

xShelf intentionally does not include Twillot APIs, AI classification, billing,
tracking, weekly-report generation, or claimed export formats without a real
implementation. Remote unfollow, follower removal, unblocking, and deleting X
likes/bookmarks are also not enabled yet: the current delete action is explicitly
local-only. The reverse-engineering notes that informed this clean-room
behavioral implementation live in `docs/`. The checked feature matrix is in
`docs/implementation-status.md`.

## License

Private/unlicensed by default. Add a license before accepting external
contributions or redistributing the project.
