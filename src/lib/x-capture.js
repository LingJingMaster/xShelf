export const OPERATION_CATEGORY = Object.freeze({
  Bookmarks: "bookmark",
  BookmarkFolderTimeline: "bookmark",
  Likes: "like",
  UserLikes: "like",
  UserTweetsAndReplies: "post",
  Followers: "follower",
  Following: "following",
  BlockedAccountsAll: "blocked"
});

export function categoryFromUrl(value) {
  try {
    const operation = new URL(value).pathname.split("/").filter(Boolean).at(-1);
    return OPERATION_CATEGORY[operation] || null;
  } catch {
    return null;
  }
}
