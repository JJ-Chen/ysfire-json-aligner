import { createScanner, parseTree, SyntaxKind } from "jsonc-parser";

/** @type {Record<string, string>} */
const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

/** @param {string} text */
function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => escapes[char]);
}

/**
 * Collect the [start, end) offsets of every JSON property key so string
 * tokens can be colored differently from string values while scanning.
 * @param {string} source
 * @returns {[number, number][]}
 */
function collectKeyRanges(source) {
  /** @type {[number, number][]} */
  const ranges = [];
  const root = parseTree(source, [], { allowTrailingComma: true });

  /** @param {import("jsonc-parser").Node | undefined} node */
  function walk(node) {
    if (!node) {
      return;
    }
    if (node.type === "property" && node.children?.[0]) {
      const key = node.children[0];
      ranges.push([key.offset, key.offset + key.length]);
    }
    node.children?.forEach(walk);
  }

  walk(root);
  return ranges;
}

/**
 * @param {[number, number][]} ranges sorted, non-overlapping
 * @param {number} offset
 */
function isKeyOffset(ranges, offset) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = ranges[mid];
    if (offset < start) {
      high = mid - 1;
    } else if (offset >= end) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

/** @type {Partial<Record<import("jsonc-parser").SyntaxKind, string>>} */
const classByKind = {
  [SyntaxKind.OpenBraceToken]: "punct",
  [SyntaxKind.CloseBraceToken]: "punct",
  [SyntaxKind.OpenBracketToken]: "punct",
  [SyntaxKind.CloseBracketToken]: "punct",
  [SyntaxKind.CommaToken]: "punct",
  [SyntaxKind.ColonToken]: "punct",
  [SyntaxKind.NullKeyword]: "keyword",
  [SyntaxKind.TrueKeyword]: "keyword",
  [SyntaxKind.FalseKeyword]: "keyword",
  [SyntaxKind.NumericLiteral]: "number",
  [SyntaxKind.LineCommentTrivia]: "comment",
  [SyntaxKind.BlockCommentTrivia]: "comment",
  [SyntaxKind.Unknown]: "error",
};

/**
 * Render JSONC source as escaped HTML with syntax-highlighting spans.
 * Tolerates incomplete or invalid input so it can highlight text as it is
 * typed, without throwing like {@link import("./formatter.js").formatJsonc}.
 * @param {string} source
 * @returns {string}
 */
export function highlightJsonc(source) {
  if (typeof source !== "string" || source.length === 0) {
    return "";
  }

  const keyRanges = collectKeyRanges(source);
  const scanner = createScanner(source, false);
  let html = "";
  for (
    let kind = scanner.scan();
    kind !== SyntaxKind.EOF;
    kind = scanner.scan()
  ) {
    const start = scanner.getTokenOffset();
    const raw = source.slice(start, start + scanner.getTokenLength());
    const cls = scanner.getTokenError() !== 0
      ? "error"
      : kind === SyntaxKind.StringLiteral
        ? (isKeyOffset(keyRanges, start) ? "key" : "string")
        : classByKind[kind];
    html += cls ? `<span class="tok-${cls}">${escapeHtml(raw)}</span>` : escapeHtml(raw);
  }
  return html;
}
