# Implementation status

This file tracks the checked implementation against `handoff-notes.md`. It is
intentionally explicit so UI labels do not get mistaken for working features.

| Area | Status | Notes |
|---|---|---|
| Integrated sync handoff | Implemented | Opens X in a temporary tab, returns to the originating xShelf tab, closes the temporary tab, and starts sync automatically after capture |
| Bookmarks sync | Implemented | Captures `Bookmarks`, paginates, stores in `posts` |
| Likes sync | Implemented | Opens `/i/history/likes`; captures both `Likes` and `UserLikes`; stored separately from bookmarks |
| Posts and replies sync | Implemented | Posts capture `UserOriginalsTimeline` from `/{screenName}`; replies capture `UserRepliesTimeline` from `/{screenName}/with_replies`. Older `UserTweets` names are still accepted |
| Following sync | Implemented | Captures `Following`, stores normalized users |
| Followers sync | Implemented | Captures `Followers`, stores normalized users |
| Blocked accounts sync | Implemented | Captures `BlockedAccountsAll`, stores normalized users |
| Search | Implemented | Phrase, `and`, `or`, `*`; names/descriptions included for users |
| Folders | Implemented | Local-only folders for every category |
| Compact / gallery / stats views | Implemented | Compact view has a media column; gallery reads media fields, safely resolves missing `t.co → X` previews, and proxies failed X image loads through the extension background |
| JSON / CSV / HTML export | Implemented | Exports the current category and active filters |
| ZIP backup / restore | Implemented | Deflate ZIP containing plaintext JSONL |
| Local deletion | Implemented | Never changes the corresponding X record |
| Remote unlike / unbookmark | Not implemented | Mutation evidence exists, but destructive remote actions need a separate confirmation flow |
| Remote unfollow / follower removal / unblock | Not implemented | Same safety boundary as other remote mutations |
| List-member management | Not implemented | No list UI or list-specific request capture yet |
| Inactive-account cleanup | Not implemented | Original behavior depends partly on Twillot's private API |
| AI classification | Out of scope | Twillot private API is intentionally not reused |
| Weekly reports | Out of scope | Report-generation page was absent from the analyzed artifacts |
| Timeline keyword/ad filtering | Not implemented | Separate X-page content-script feature, not part of local library yet |

Each category must be opened on X once per browser session. xShelf captures the
real request template for the signed-in account instead of assuming that X's
private query IDs and feature variables are stable.
