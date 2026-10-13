# xShelf

xShelf is a local-first Chrome extension for searching, organizing, exporting,
and backing up your X bookmarks. Bookmark data stays in IndexedDB inside the
extension. There is no account, analytics SDK, payment system, or xShelf server.

## What works

- Capture the current X bookmark request while you browse `x.com/i/bookmarks`
- Incrementally sync bookmark pages into local IndexedDB
- Search phrases, `and`, `or`, and `*` wildcards
- Filter by folder, author, content type, post type, and date
- Rename folders and move individual bookmarks
- Export JSON, CSV, or standalone HTML
- Back up and restore all local stores as a ZIP containing JSONL files
- Import JSON and JSONL exports from compatible bookmark tools

X uses private, undocumented APIs. Sync can break when X changes its request
shape. Export and back up your data regularly.

## Install for development

1. Run `npm install`.
2. Open `chrome://extensions`, enable Developer mode, then choose **Load
   unpacked** and select this repository.
3. Open `https://x.com/i/bookmarks` once while signed in, then click the xShelf
   toolbar icon.

No build step is required. Run `npm test` for parser tests and `npm run package`
to create `dist/xshelf.zip`.

## How sync works

Chrome's `webRequest` API observes your own bookmark request and stores the
request URL and required headers in `chrome.storage.session`. xShelf replays one
page at a time from its open app tab and writes normalized records locally. It
does not read or store your X cookies. Captured authorization headers live only
in browser session storage and disappear when Chrome exits.

## Project boundaries

xShelf intentionally does not include Twillot APIs, AI classification, billing,
tracking, weekly-report generation, or claimed export formats without a real
implementation. The reverse-engineering notes that informed the clean-room
behavioral implementation live in `docs/`.

## License

Private/unlicensed by default. Add a license before accepting external
contributions or redistributing the project.
