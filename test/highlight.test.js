import assert from "node:assert/strict";
import test from "node:test";
import { highlightJsonc } from "../src/highlight.js";
import { sample } from "../src/sample.js";

/** Strip the highlighting markup and unescape entities to recover the source text. */
function plainText(html) {
  return html
    .replace(/<span class="tok-[a-z]+">|<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Collect [class, text] pairs for every highlighted span, in document order. */
function spans(html) {
  return Array.from(html.matchAll(/<span class="tok-([a-z]+)">([\s\S]*?)<\/span>/g))
    .map(([, cls, text]) => [cls, text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")]);
}

test("returns an empty string for empty or non-string input", () => {
  assert.equal(highlightJsonc(""), "");
});

test("colors keys, string values, numbers, keywords and punctuation distinctly", () => {
  const html = highlightJsonc('{"a": 1, "b": true, "c": null, "d": "x"}');
  assert.deepEqual(spans(html), [
    ["punct", "{"],
    ["key", '"a"'],
    ["punct", ":"],
    ["number", "1"],
    ["punct", ","],
    ["key", '"b"'],
    ["punct", ":"],
    ["keyword", "true"],
    ["punct", ","],
    ["key", '"c"'],
    ["punct", ":"],
    ["keyword", "null"],
    ["punct", ","],
    ["key", '"d"'],
    ["punct", ":"],
    ["string", '"x"'],
    ["punct", "}"],
  ]);
  assert.match(html, /^<span class="tok-punct">\{<\/span>/u);
  assert.match(html, /<span class="tok-punct">\}<\/span>$/u);
});

test("colors both line and block comments, and distinguishes // inside a string", () => {
  const html = highlightJsonc('{"a": 1 /* block */, "url": "https://x"} //line');
  const found = spans(html);
  assert.deepEqual(found.filter(([cls]) => cls === "comment"), [
    ["comment", "/* block */"],
    ["comment", "//line"],
  ]);
  assert.deepEqual(found.filter(([cls]) => cls === "string"), [["string", '"https://x"']]);
});

test("marks scanner errors, such as an unterminated string, without throwing", () => {
  const html = highlightJsonc('{"a": "unterminated');
  assert.deepEqual(spans(html).filter(([cls]) => cls === "error").length > 0, true);
});

test("escapes HTML-significant characters inside strings and comments", () => {
  const html = highlightJsonc('{"a": "<b>&x</b>"} // <tag>&');
  assert.ok(html.includes("&lt;b&gt;&amp;x&lt;/b&gt;"));
  assert.ok(html.includes("&lt;tag&gt;&amp;"));
  assert.ok(!html.includes("<b>"));
});

test("tolerates incomplete input while it is being typed, without dropping characters", () => {
  for (const partial of ['{"a": ', "{", "[1, 2", '{"a": "unterminated', "//"]) {
    const html = highlightJsonc(partial);
    assert.equal(plainText(html), partial);
  }
});

test("never drops or reorders any character of the original source", () => {
  assert.equal(plainText(highlightJsonc(sample)), sample);
  const source = '{"z":90071992547409931234567890,"a":-0,"z":1.234e+56,"b":1.00}';
  assert.equal(plainText(highlightJsonc(source)), source);
});
