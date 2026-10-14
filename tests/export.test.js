import test from "node:test";
import assert from "node:assert/strict";
import { rowsForExport, rowsToMarkdown } from "../src/lib/export.js";

const exportRows = [
  { id: "1", text: "Selected" },
  { id: "2", text: "Also selected" },
  { id: "3", text: "Not selected" }
];

test("exports only selected rows when a selection exists", () => {
  assert.deepEqual(rowsForExport(exportRows, exportRows, new Set(["1", "2"])).map(row => row.id), ["1", "2"]);
});

test("exports the current scope when nothing is selected", () => {
  assert.deepEqual(rowsForExport(exportRows.slice(1), exportRows, new Set()).map(row => row.id), ["2", "3"]);
});

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
