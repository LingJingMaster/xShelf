# Privacy

xShelf stores bookmarks, likes, posts, and relationship data locally in the extension's IndexedDB database.
Settings and the most recently observed X bookmark request are stored with
Chrome extension storage. Authorization headers use session storage and are not
persisted across browser restarts.

xShelf has no telemetry, remote service, advertising, payment integration, or
AI endpoint. Network access is limited to X and X-owned media domains
(`x.com`, `pbs.twimg.com`, and `video.twimg.com`). They are used only for sync
and displaying the avatars or media already referenced by synchronized
records. Exports and backups are created on your device.

Removing the extension removes its local database. Create a backup first if you
want to keep the data.
