import assert from "node:assert/strict";
import test from "node:test";
import { diffLines, diffChars, diffSideBySide } from "../src/diff.js";

/** Reduce a diff result to a compact, easy-to-assert shape. */
function shape(result) {
  return result.map((line) => `${line.type[0]}:${line.value}`);
}

test("returns only equal lines for identical text", () => {
  const result = diffLines("a\nb\nc\n", "a\nb\nc\n");
  assert.deepEqual(shape(result), ["e:a", "e:b", "e:c"]);
});

test("detects a pure addition", () => {
  const result = diffLines("a\nc\n", "a\nb\nc\n");
  assert.deepEqual(shape(result), ["e:a", "a:b", "e:c"]);
});

test("detects a pure removal", () => {
  const result = diffLines("a\nb\nc\n", "a\nc\n");
  assert.deepEqual(shape(result), ["e:a", "r:b", "e:c"]);
});

test("detects a replacement as a remove followed by an add", () => {
  const result = diffLines("a\nb\nc\n", "a\nx\nc\n");
  assert.deepEqual(shape(result), ["e:a", "r:b", "a:x", "e:c"]);
});

test("handles completely disjoint content", () => {
  const result = diffLines("a\nb\n", "c\nd\n");
  const removed = result.filter((line) => line.type === "remove").map((line) => line.value);
  const added = result.filter((line) => line.type === "add").map((line) => line.value);
  assert.deepEqual(removed, ["a", "b"]);
  assert.deepEqual(added, ["c", "d"]);
});

test("treats a formatted, unindented input as one big addition over one removed line", () => {
  const before = '{"a":1,"b":2}';
  const after = '{\n  "a": 1,\n  "b": 2\n}\n';
  const result = diffLines(before, after);
  assert.equal(result.filter((line) => line.type === "remove").length, 1);
  assert.equal(result.filter((line) => line.type === "add").length, 4);
});

test("handles empty inputs", () => {
  assert.deepEqual(diffLines("", ""), []);
  assert.deepEqual(shape(diffLines("", "a\n")), ["a:a"]);
  assert.deepEqual(shape(diffLines("a\n", "")), ["r:a"]);
});

test("does not require a trailing newline to compare the final line", () => {
  const result = diffLines("a\nb", "a\nb\n");
  assert.deepEqual(shape(result), ["e:a", "e:b"]);
});

test("rejects non-string arguments", () => {
  assert.throws(() => diffLines(null, "a"), TypeError);
  assert.throws(() => diffLines("a", undefined), TypeError);
});

test("diffChars detects an inserted space at the character level", () => {
  const result = diffChars('"a": 1,//a', '"a": 1,   // a');
  assert.deepEqual(shape(result), ['e:"a": 1,', "a:   ", "e://", "a: ", "e:a"]);
});

test("diffChars returns a single equal run for identical lines", () => {
  assert.deepEqual(diffChars("same", "same"), [{ type: "equal", value: "same" }]);
});

test("diffChars detects a removed character", () => {
  const result = diffChars("abc", "ac");
  assert.deepEqual(shape(result), ["e:a", "r:b", "e:c"]);
});

test("diffChars rejects non-string arguments", () => {
  assert.throws(() => diffChars(null, "a"), TypeError);
  assert.throws(() => diffChars("a", undefined), TypeError);
});

test("diffSideBySide produces a modify row with character segments when line counts match", () => {
  const rows = diffSideBySide('{"a":1,"b":2}', '{"a": 1,"b":2}');
  assert.deepEqual(
    rows.map((row) => row.type),
    ["modify"],
  );
  const [first] = rows;
  assert.equal(first.oldLineNo, 1);
  assert.equal(first.newLineNo, 1);
  assert.equal(first.oldText, '{"a":1,"b":2}');
  assert.equal(first.newText, '{"a": 1,"b":2}');
  assert.deepEqual(
    first.segments.map((segment) => `${segment.type[0]}:${segment.value}`),
    ['e:{"a":', "a: ", 'e:1,"b":2}'],
  );
});

test("diffSideBySide pairs a line with its true counterpart by content, not position, when a neighboring line splits in two", () => {
  const before = '"list": [{\n"code": "x",//id\n}]\n';
  const after = '"list": [\n  {\n  "code": "x", // id\n  }\n]\n';
  const rows = diffSideBySide(before, after);
  const codeRow = rows.find((row) => row.oldText === '"code": "x",//id');
  assert.ok(codeRow, "the code field line should be present");
  assert.equal(codeRow.type, "modify");
  assert.equal(codeRow.newText, '  "code": "x", // id');
  // Only whitespace was inserted; the meaningful characters must all be marked equal.
  const inserted = codeRow.segments.filter((segment) => segment.type !== "equal");
  assert.ok(inserted.every((segment) => segment.value.trim() === ""));
});

test("diffSideBySide keeps unchanged lines aligned on both sides", () => {
  const rows = diffSideBySide("a\nb\nc\n", "a\nb\nc\n");
  assert.deepEqual(
    rows.map((row) => [row.type, row.oldLineNo, row.newLineNo]),
    [
      ["equal", 1, 1],
      ["equal", 2, 2],
      ["equal", 3, 3],
    ],
  );
});

test("diffSideBySide reports pure removals and additions on a single side", () => {
  const rows = diffSideBySide("a\nb\nc\n", "a\nc\n");
  assert.deepEqual(rows.map((row) => row.type), ["equal", "remove", "equal"]);
  const removed = rows[1];
  assert.equal(removed.oldLineNo, 2);
  assert.equal(removed.newLineNo, null);
  assert.equal(removed.newText, null);

  const addedRows = diffSideBySide("a\nc\n", "a\nb\nc\n");
  assert.deepEqual(addedRows.map((row) => row.type), ["equal", "add", "equal"]);
  const added = addedRows[1];
  assert.equal(added.newLineNo, 2);
  assert.equal(added.oldLineNo, null);
  assert.equal(added.oldText, null);
});

test("diffSideBySide falls back to positional pairing for very large changed blocks", () => {
  const before = Array.from({ length: 100 }, (_, i) => `old-${i}`).join("\n");
  const after = Array.from({ length: 100 }, (_, i) => `new-${i}`).join("\n");
  const rows = diffSideBySide(before, after);
  assert.equal(rows.length, 100);
  assert.ok(rows.every((row) => row.type === "modify"));
  assert.equal(rows[0].oldText, "old-0");
  assert.equal(rows[0].newText, "new-0");
  assert.equal(rows[99].oldText, "old-99");
  assert.equal(rows[99].newText, "new-99");
});
