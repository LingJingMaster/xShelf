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

test("reads current user core/avatar fields and tweet media", () => {
  const payload = timeline({ tweet_results: { result: {
    __typename: "TweetWithVisibilityResults",
    tweet: {
      rest_id: "99",
      core: { user_results: { result: {
        rest_id: "8",
        core: { name: "Current Ada", screen_name: "current_ada" },
        avatar: { image_url: "https://pbs.twimg.com/profile_images/8/avatar.jpg" }
      } } },
      legacy: {
        full_text: "Tweet with a picture https://t.co/1EGqlEXEwS",
        created_at: "Tue Jan 02 00:00:00 +0000 2024",
        entities: { urls: [{ url: "https://t.co/1EGqlEXEwS", expanded_url: "https://twitter.com/readswithravi/status/2107321952050524605/photo/1" }] },
        extended_entities: { media: [{
          type: "photo",
          media_url_https: "https://pbs.twimg.com/media/picture.jpg",
          ext_alt_text: "A diagram",
          sizes: { large: { w: 1200, h: 800 } }
        }] }
      }
    }
  } } });
  const result = parseTimelineResponse(payload, "like");
  assert.equal(result.rows[0].authorName, "Current Ada");
  assert.equal(result.rows[0].authorHandle, "@current_ada");
  assert.equal(result.rows[0].avatarUrl, "https://pbs.twimg.com/profile_images/8/avatar.jpg");
  assert.equal(result.rows[0].media[0].url, "https://pbs.twimg.com/media/picture.jpg");
  assert.deepEqual(result.rows[0].contentTypes, ["image"]);
  assert.equal(result.rows[0].links[0].url, "https://t.co/1EGqlEXEwS");
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

test("normalizes current user identity fields without legacy names", () => {
  const payload = timeline({ user_results: { result: {
    rest_id: "9",
    core: { name: "New Shape", screen_name: "new_shape", created_at: "Mon Jan 01 00:00:00 +0000 2024" },
    avatar: { image_url: "https://pbs.twimg.com/profile_images/9/new.jpg" },
    legacy: { description: "Still keeps metrics here", followers_count: 4 }
  } } });
  const result = parseTimelineResponse(payload, "follower");
  assert.equal(result.rows[0].authorName, "New Shape");
  assert.equal(result.rows[0].authorHandle, "@new_shape");
  assert.equal(result.rows[0].avatarUrl, "https://pbs.twimg.com/profile_images/9/new.jpg");
});
