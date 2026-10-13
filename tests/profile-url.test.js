import test from "node:test";
import assert from "node:assert/strict";
import { profileUrl } from "../src/lib/profile-url.js";

test("builds account-specific post and reply URLs", () => {
  assert.equal(profileUrl("post", "LingJingMaster"), "https://x.com/LingJingMaster");
  assert.equal(profileUrl("reply", "LingJingMaster"), "https://x.com/LingJingMaster/with_replies");
  assert.equal(profileUrl("following", "LingJingMaster"), "https://x.com/LingJingMaster/following");
  assert.equal(profileUrl("follower", "LingJingMaster"), "https://x.com/LingJingMaster/followers");
});

test("rejects missing or malformed screen names", () => {
  assert.equal(profileUrl("post", ""), null);
  assert.equal(profileUrl("reply", "../admin"), null);
  assert.equal(profileUrl("bookmark", "LingJingMaster"), null);
});
