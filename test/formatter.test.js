import assert from "node:assert/strict";
import test from "node:test";
import { createScanner, parse, SyntaxKind } from "jsonc-parser";
import { formatJsonc, JsonInputError } from "../src/formatter.js";
import { sample } from "../src/sample.js";

function tokens(text) {
  const scanner = createScanner(text, true);
  const result = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EOF; kind = scanner.scan()) {
    result.push([kind, text.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength())]);
  }
  return result;
}

function comments(text) {
  const scanner = createScanner(text);
  const result = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EOF; kind = scanner.scan()) {
    if (kind !== SyntaxKind.LineCommentTrivia) continue;
    const offset = scanner.getTokenOffset();
    const start = text.lastIndexOf("\n", offset - 1) + 1;
    result.push({
      prefix: text.slice(start, offset),
      text: text.slice(offset, offset + scanner.getTokenLength()),
      column: Array.from(text.slice(start, offset)).length + 1,
    });
  }
  return result;
}

test("formats a document and places every // at a known global column", () => {
  const result = formatJsonc('{"a":1,//a\n"long":2//    b   \n}');
  assert.deepEqual(result, {
    text: '{\n  "a": 1,   // a\n  "long": 2 // b\n}\n',
    commentCount: 2,
    commentColumn: 13,
  });
});

test("formats the complete sample, preserving every token and comment", () => {
  const result = formatJsonc(sample);
  const aligned = comments(result.text);
  assert.equal(result.commentCount, 20);
  assert.equal(new Set(aligned.map((comment) => comment.column)).size, 1);
  assert.deepEqual(tokens(result.text), tokens(sample));
  assert.deepEqual(
    aligned.map((comment) => comment.text.slice(3)),
    comments(sample).map((comment) => comment.text.slice(2).trim()),
  );
  for (const comment of aligned) {
    assert.match(comment.prefix, /\S +$/u);
    assert.match(comment.text, /^\/\/ \S/u);
    assert.equal(comment.column, result.commentColumn);
  }
  assert.match(result.text, /\n  "catalog": \{[^\n]*\n    "title": "Signals After Sundown",/u);
  assert.match(result.text, /\n    "episodes": \[\n      \{[^\n]*/u);
  assert.match(result.text, /\n        "playback": \{[^\n]*/u);
  assert.match(result.text, /\n          "positionSeconds": 486,[^\n]*/u);
  assert.equal(parse(result.text).catalog.episodes[0].title, "The Clockmaker's Balcony");
  assert.equal(formatJsonc(result.text).text, result.text);
});

test("does not touch comment-like strings or escaped quotes and slashes", () => {
  const source = String.raw`{
    "url": "https://example.test/a//b", //url
    "quote": "\"//not a comment", //quote
    "path": "C:\\temp\\", //path
    "block": "/* not a block */",
    "//key": "// value"
  }`;
  const result = formatJsonc(source);
  assert.equal(result.commentCount, 3);
  assert.deepEqual(tokens(result.text), tokens(source));
  assert.deepEqual(comments(result.text).map((comment) => comment.text), ["// url", "// quote", "// path"]);
});

test("preserves raw large numbers, duplicate properties, number spelling and key order", () => {
  const source = '{"z":90071992547409931234567890,"a":-0,"z":1.234e+56,"b":1.00}';
  assert.equal(formatJsonc(source).text,
    '{\n  "z": 90071992547409931234567890,\n  "a": -0,\n  "z": 1.234e+56,\n  "b": 1.00\n}\n');
});

test("aligns standalone, nested, closing-brace and trailing comments globally", () => {
  const source = '//top\n{\n//first\n"nested": {"longField": true //inner\n} //close\n}\n//end';
  const result = formatJsonc(source);
  const aligned = comments(result.text);
  assert.equal(aligned.length, 5);
  assert.equal(new Set(aligned.map((comment) => comment.column)).size, 1);
  assert.deepEqual(aligned.map((comment) => comment.text), ["// top", "// first", "// inner", "// close", "// end"]);
  assert.match(result.text, /\n    "longField": true \/\/ inner\n/u);
  assert.equal(formatJsonc(result.text).text, result.text);
});

test("preserves block comments, including // inside a multiline block", () => {
  const source = '{/* inline // block */"a":1, /* multi\n// not a line comment\n*/"b":2 //real\n}';
  const result = formatJsonc(source);
  assert.equal(result.commentCount, 1);
  assert.ok(result.text.includes("/* inline // block */"));
  assert.ok(result.text.includes("/* multi\n// not a line comment\n*/"));
  assert.deepEqual(tokens(result.text), tokens(source));
  assert.equal(formatJsonc(result.text).text, result.text);
});

test("retains trailing commas in arrays and objects", () => {
  const source = '{"a":[1,2,],"b":true, //ok\n}';
  const result = formatJsonc(source);
  assert.match(result.text, /2,\n  \],/u);
  assert.match(result.text, /"b": true, \/\/ ok/u);
  assert.deepEqual(tokens(result.text), tokens(source));
});

test("normalizes BOM and all newline styles to LF", () => {
  const result = formatJsonc('\uFEFF{\r\n"a":1,//a\r"long":2//b\r\n}');
  assert.equal(result.text, '{\n  "a": 1,   // a\n  "long": 2 // b\n}\n');
});

test("uses Unicode code point columns for Chinese and supplementary characters", () => {
  const result = formatJsonc('{"中文":"😀",//  描述\n"b":2//尾注\n}');
  assert.equal(result.text, '{\n  "中文": "😀", // 描述\n  "b": 2     // 尾注\n}\n');
  assert.equal(result.commentColumn, 14);
  assert.deepEqual(comments(result.text).map((comment) => comment.column), [14, 14]);
});

test("normalizes empty comments and whitespace after // without changing internal content", () => {
  const result = formatJsonc('{"a":1, //\t \n"b":2 //\t hello  world  \n}');
  assert.deepEqual(comments(result.text).map((comment) => comment.text), ["// ", "// hello  world"]);
  assert.equal(formatJsonc(result.text).text, result.text);
});

test("never inserts padding into long field values and has no fixed alignment cap", () => {
  const value = "x".repeat(12000);
  const source = `{"long":"${value}",//long\n"a":1//short\n}`;
  const result = formatJsonc(source);
  assert.ok(result.commentColumn > 12000);
  assert.equal(new Set(comments(result.text).map((comment) => comment.column)).size, 1);
  assert.equal(parse(result.text).long, value);
  assert.deepEqual(tokens(result.text), tokens(source));
});

test("supports four-space indentation", () => {
  assert.equal(formatJsonc('{"a":{"b":[1]}}', { indentSize: 4 }).text,
    '{\n    "a": {\n        "b": [\n            1\n        ]\n    }\n}\n');
});

test("can preserve original line breaks with the formatter keepLines option", () => {
  const source = '{"channels":[1500,1500,1100,1500],"pair":{"a":1,"b":2}//ok\n}';
  const result = formatJsonc(source, { keepLines: true });
  assert.equal(result.text, '{ "channels": [ 1500, 1500, 1100, 1500 ], "pair": { "a": 1, "b": 2 } // ok\n}\n');
  assert.equal(result.commentCount, 1);
  assert.deepEqual(tokens(result.text), tokens(source));
});

for (const [source, expected] of [
  ["{}", "{}\n"],
  ["[]", "[]\n"],
  ["null", "null\n"],
  ["true", "true\n"],
  ["123", "123\n"],
  ['"hello"', '"hello"\n'],
]) {
  test(`accepts a valid JSON root: ${source}`, () => {
    assert.deepEqual(formatJsonc(source), { text: expected, commentCount: 0, commentColumn: null });
  });
}

for (const source of [
  "", "  ", "// only comment", "{", "[1", "{a:1}", '{"a" 1}', '{"a":}',
  '{"a":1 "b":2}', '{"a":"unterminated}', '{"a":"\\q"}', '{"a":"\\uZZZZ"}',
  '{"a":01}', '{"a":NaN}', '{"a":undefined}', '{"a":1e}', "/* unclosed", "{} {}",
  "{'a':1}", '{"a":"line\nbreak"}', "[1,,2]",
]) {
  test(`rejects invalid JSONC without producing output: ${JSON.stringify(source)}`, () => {
    assert.throws(() => formatJsonc(source), JsonInputError);
  });
}

test("reports a syntax error at its original line and column", () => {
  assert.throws(
    () => formatJsonc('{\n  "a":\n}'),
    (error) => {
      assert.ok(error instanceof JsonInputError);
      assert.equal(error.line, 3);
      assert.equal(error.column, 1);
      assert.equal(error.offset, 9);
      assert.match(error.message, /第 3 行，第 1 列/u);
      return true;
    },
  );
});

test("rejects invalid API arguments explicitly", () => {
  assert.throws(() => formatJsonc(null), TypeError);
  assert.throws(() => formatJsonc("{}", { indentSize: 3 }), RangeError);
});
