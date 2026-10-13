import test from "node:test";
import assert from "node:assert/strict";
import { parseBookmarksResponse } from "../src/lib/x-sync.js";

test("normalizes timeline tweets and bottom cursor", () => {
  const payload = { data: { timeline: { instructions: [{ entries: [
    { content: { itemContent: { tweet_results: { result: {
      __typename: "Tweet", rest_id: "42", legacy: { full_text: "Saved thought", created_at: "Mon Jan 01 00:00:00 +0000 2024" },
      core: { user_results: { result: { rest_id: "7", legacy: { name: "Ada", screen_name: "ada" } } } }
    } } } } },
    { content: { cursorType: "Bottom", value: "next-page" } }
  ] }] } } };
  const result = parseBookmarksResponse(payload);
  assert.equal(result.cursor, "next-page");
  assert.equal(result.posts[0].id, "bookmark_42");
  assert.equal(result.posts[0].authorHandle, "@ada");
});
