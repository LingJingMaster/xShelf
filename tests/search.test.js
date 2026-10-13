import test from "node:test";
import assert from "node:assert/strict";
import { createSearchPredicate, filterPosts, parseQuery } from "../src/lib/search.js";

const posts = [
  { text: "Claude Code is useful", authorHandle: "@ada", folder: "tools", createdAt: 20, contentTypes: [], postType: "post" },
  { text: "A Claude field guide", authorHandle: "@lin", folder: "reading", createdAt: 10, contentTypes: ["article"], postType: "quote" },
  { text: "Local-first bookmark shelf", authorHandle: "@ada", folder: "tools", createdAt: 30, contentTypes: ["image"], postType: "post" }
];

test("parses phrases, and, and or groups", () => {
  assert.deepEqual(parseQuery('"claude code" or local and shelf'), [["claude code"], ["local", "shelf"]]);
});

test("matches phrases and wildcard terms case-insensitively", () => {
  assert.equal(createSearchPredicate('"claude code"')(posts[0].text), true);
  assert.equal(createSearchPredicate("book* shelf")(posts[2].text), true);
  assert.equal(createSearchPredicate("claude and shelf")(posts[0].text), false);
});

test("filters and orders posts", () => {
  const rows = filterPosts(posts, { query: "claude", folder: "tools" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].authorHandle, "@ada");
  assert.deepEqual(filterPosts(posts, { contentType: "article" }).map(row => row.createdAt), [10]);
  assert.deepEqual(filterPosts(posts, { oldest: true }).map(row => row.createdAt), [10, 20, 30]);
});
