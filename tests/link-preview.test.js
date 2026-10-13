import test from "node:test";
import assert from "node:assert/strict";
import { extractPreviewImage, extractRedirectTarget, isAllowedPreviewUrl } from "../src/lib/link-preview.js";

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

test("reads the large image from the current X status page", () => {
  const html = '<link rel="preload" as="image" imageSrcSet="https://pbs.twimg.com/media/HUfdNF0aYAEdrXE?format=webp&amp;name=small 680w, https://pbs.twimg.com/media/HUfdNF0aYAEdrXE?format=webp&amp;name=large 2048w">';
  assert.equal(extractPreviewImage(html), "https://pbs.twimg.com/media/HUfdNF0aYAEdrXE?format=webp&name=large");
});

test("follows the script redirect inside a t.co page", () => {
  const html = '<noscript><META http-equiv="refresh" content="0;URL=https://twitter.com/LotusDecoder/status/2109898187582673264/photo/1"></noscript><script>location.replace("https:\\/\\/twitter.com\\/LotusDecoder\\/status\\/2109898187582673264\\/photo\\/1")</script>';
  assert.equal(extractRedirectTarget(html), "https://twitter.com/LotusDecoder/status/2109898187582673264/photo/1");
  assert.equal(extractRedirectTarget('<script>location.replace("https://example.com/x")</script>'), null);
});

test("rejects non-X image metadata", () => {
  assert.equal(extractPreviewImage('<meta property="og:image" content="https://example.com/tracker.png">'), null);
});
