import test from "node:test";
import assert from "node:assert/strict";
import { extractScreenName, profileUrl } from "../src/lib/profile-url.js";

test("builds account-specific post and reply URLs", () => {
  assert.equal(profileUrl("post", "LingJingMaster"), "https://x.com/LingJingMaster");
  assert.equal(profileUrl("reply", "LingJingMaster"), "https://x.com/LingJingMaster/with_replies");
  assert.equal(profileUrl("following", "LingJingMaster"), "https://x.com/LingJingMaster/following");
  assert.equal(profileUrl("follower", "LingJingMaster"), null);
});

test("reads the signed-in screen name from X page HTML", () => {
  const html = '<link href="android-app://com.twitter.android/twitter/user?screen_name=LingJingMaster">';
  assert.equal(extractScreenName(html), "LingJingMaster");
  assert.equal(extractScreenName("no user here"), null);
});

test("rejects missing or malformed screen names", () => {
  assert.equal(profileUrl("post", ""), null);
  assert.equal(profileUrl("reply", "../admin"), null);
  assert.equal(profileUrl("bookmark", "LingJingMaster"), null);
});
