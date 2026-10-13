import test from "node:test";
import assert from "node:assert/strict";
import { categoryFromUrl } from "../src/lib/x-capture.js";

const endpoint = operation => "https://x.com/i/api/graphql/query-id/" + operation + "?variables=%7B%7D";

test("recognizes every supported X timeline operation", () => {
  assert.equal(categoryFromUrl(endpoint("Bookmarks")), "bookmark");
  assert.equal(categoryFromUrl(endpoint("Likes")), "like");
  assert.equal(categoryFromUrl(endpoint("UserLikes")), "like");
  assert.equal(categoryFromUrl(endpoint("UserTweets")), "post");
  assert.equal(categoryFromUrl(endpoint("UserOriginalsTimeline")), "post");
  assert.equal(categoryFromUrl(endpoint("UserTweetsAndReplies")), "reply");
  assert.equal(categoryFromUrl(endpoint("UserRepliesTimeline")), "reply");
  assert.equal(categoryFromUrl(endpoint("Following")), "following");
  assert.equal(categoryFromUrl(endpoint("Followers")), "follower");
  assert.equal(categoryFromUrl(endpoint("BlockedAccountsAll")), "blocked");
});

test("ignores unrelated operations and malformed URLs", () => {
  assert.equal(categoryFromUrl(endpoint("FavoriteTweet")), null);
  assert.equal(categoryFromUrl("not a url"), null);
});
