import test from "node:test";
import assert from "node:assert/strict";
import { extractPreviewImage, isAllowedPreviewUrl } from "../src/lib/link-preview.js";

test("allows only X-owned preview pages", () => {
  assert.equal(isAllowedPreviewUrl("https://t.co/1EGqlEXEwS"), true);
  assert.equal(isAllowedPreviewUrl("https://x.com/user/status/1"), true);
  assert.equal(isAllowedPreviewUrl("https://twitter.com/user/status/1"), true);
  assert.equal(isAllowedPreviewUrl("https://example.com/image"), false);
  assert.equal(isAllowedPreviewUrl("javascript:alert(1)"), false);
});

test("extracts and decodes X og:image metadata", () => {
  const html = '<meta property="og:image" content="https://pbs.twimg.com/media/HT5z3VOWUAAzdyW?format=webp&amp;name=large">';
  assert.equal(
    extractPreviewImage(html),
    "https://pbs.twimg.com/media/HT5z3VOWUAAzdyW?format=webp&name=large"
  );
});

test("rejects non-X image metadata", () => {
  assert.equal(extractPreviewImage('<meta property="og:image" content="https://example.com/tracker.png">'), null);
});
