# Privacy

xShelf stores bookmarks, likes, posts, and relationship data locally in the extension's IndexedDB database.
Settings and the most recently observed X bookmark request are stored with
Chrome extension storage. Authorization headers use session storage and are not
persisted across browser restarts.

xShelf has no telemetry, remote service, advertising, payment integration, or
AI endpoint. Network access is limited to `x.com` and is used only when you ask
to sync one of the supported categories. Exports and backups are created on
your device.

Removing the extension removes its local database. Create a backup first if you
want to keep the data.
