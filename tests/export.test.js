import test from "node:test";
import assert from "node:assert/strict";
import { rowsToMarkdown } from "../src/lib/export.js";

test("exports posts and media as readable Markdown", () => {
  const markdown = rowsToMarkdown([{
    authorName: "Ada", authorHandle: "@ada", text: "First line\nSecond line", createdAt: 1704067200,
    folder: "reading", url: "https://x.com/ada/status/1",
    media: [{ url: "https://pbs.twimg.com/media/photo.jpg", alt: "Diagram" }]
  }], { title: "xShelf · 喜欢", exportedAt: "2026-01-01T00:00:00.000Z" });
  assert.match(markdown, /^# xShelf · 喜欢/m);
  assert.match(markdown, /First line\nSecond line/);
  assert.match(markdown, /!\[Diagram\]\(<https:\/\/pbs\.twimg\.com\/media\/photo\.jpg>\)/);
  assert.match(markdown, /\[在 X 查看原文\]\(<https:\/\/x\.com\/ada\/status\/1>\)/);
});

test("does not export avatars as attached media", () => {
  const markdown = rowsToMarkdown([{ authorName: "Ada", media: [{ url: "https://pbs.twimg.com/profile_images/8/avatar.jpg" }] }]);
  assert.doesNotMatch(markdown, /profile_images/);
});
