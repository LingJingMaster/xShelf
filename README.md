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
4. Select a category. If it is not connected yet, follow the button to open the
   matching X page. Likes opens `https://x.com/i/history/likes` directly. For
   posts, following, and followers, navigate to the indicated tab on your own
   profile. Once the X list has loaded, return to xShelf and click sync again.

No build step is required. Run `npm test` for parser tests and `npm run package`
to create `dist/xshelf.zip`.

## How sync works

Chrome's read-only `webRequest` observer recognizes the GraphQL request made by
X when you open one of the supported lists. It stores one request template per
category in `chrome.storage.session`. xShelf replays one page at a time from its
open app tab and writes normalized records locally. It does not read or store
your X cookies. Captured authorization headers live only in browser session
storage and disappear when Chrome exits.

A category must be opened on X at least once per browser session before xShelf
can sync it. This request-template approach avoids hard-coding a single set of
GraphQL variables for every account and makes query-ID changes easier to detect.

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
