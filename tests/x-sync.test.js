import test from "node:test";
import assert from "node:assert/strict";
import { parseBookmarksResponse, parseTimelineResponse } from "../src/lib/x-sync.js";

const tweetResult = {
  __typename: "Tweet",
  rest_id: "42",
  legacy: { full_text: "Saved thought", created_at: "Mon Jan 01 00:00:00 +0000 2024" },
  core: { user_results: { result: { rest_id: "7", legacy: { name: "Ada", screen_name: "ada" } } } }
};

function timeline(itemContent) {
  return { data: { timeline: { instructions: [{ entries: [
    { content: { itemContent } },
    { content: { cursorType: "Bottom", value: "next-page" } }
  ] }] } } };
}

test("normalizes bookmark tweets and bottom cursor", () => {
  const result = parseBookmarksResponse(timeline({ tweet_results: { result: tweetResult } }));
  assert.equal(result.cursor, "next-page");
  assert.equal(result.posts[0].id, "bookmark_42");
  assert.equal(result.posts[0].authorHandle, "@ada");
});

test("keeps likes separate from copies of the same bookmarked tweet", () => {
  const result = parseTimelineResponse(timeline({ tweet_results: { result: tweetResult } }), "like");
  assert.equal(result.store, "posts");
  assert.equal(result.rows[0].id, "like_42");
  assert.equal(result.rows[0].category, "like");
});

test("normalizes relationship timelines into users", () => {
  const payload = timeline({ user_results: { result: {
    __typename: "User", rest_id: "7", legacy: {
      name: "Ada", screen_name: "ada", description: "Builds tools",
      followers_count: 120, friends_count: 30, statuses_count: 900,
      created_at: "Mon Jan 01 00:00:00 +0000 2020"
    }
  } } });
  const result = parseTimelineResponse(payload, "following");
  assert.equal(result.store, "users");
  assert.equal(result.rows[0].id, "following_7");
  assert.equal(result.rows[0].followersCount, 120);
});
