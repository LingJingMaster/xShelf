import test from "node:test";
import assert from "node:assert/strict";
import { applyTagsToRows, rowTags } from "../src/lib/tags.js";

test("normalizes missing and duplicate tags", () => {
  assert.deepEqual(rowTags({}), []);
  assert.deepEqual(rowTags({ tags: ["tools", "tools", "reading"] }), ["tools", "reading"]);
});

test("adds multiple tags without replacing existing tags", () => {
  const rows = applyTagsToRows([
    { id: "1", tags: ["reading"] },
    { id: "2", tags: [] }
  ], new Set(["1"]), ["tools", "reading"], "add");
  assert.deepEqual(rows[0].tags, ["reading", "tools"]);
  assert.deepEqual(rows[1].tags, []);
});

test("removes selected tags without removing the record", () => {
  const rows = applyTagsToRows([{ id: "1", tags: ["reading", "tools"] }], ["1"], ["reading"], "remove");
  assert.deepEqual(rows, [{ id: "1", tags: ["tools"] }]);
});
