/**
 * @typedef {{ type: "equal" | "remove" | "add", value: string }} DiffLine
 */

/**
 * @typedef {{
 *   type: "equal" | "modify" | "remove" | "add",
 *   oldLineNo: number | null,
 *   newLineNo: number | null,
 *   oldText: string | null,
 *   newText: string | null,
 *   segments: DiffLine[] | null,
 * }} DiffRow
 */

/**
 * Split text into lines without producing a trailing empty line for a final "\n".
 * @param {string} text
 * @returns {string[]}
 */
function splitLines(text) {
  if (text === "") {
    return [];
  }
  const lines = text.split("\n");
  if (text.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}

/**
 * Build the Myers diff trace between two arrays using strict equality per element.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Map<number, number>[]}
 */
function buildTrace(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  /** @type {Map<number, number>} */
  let v = new Map([[1, 0]]);
  /** @type {Map<number, number>[]} */
  const trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v);
    /** @type {Map<number, number>} */
    const next = new Map(v);
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
        x = v.get(k + 1) ?? 0;
      } else {
        x = (v.get(k - 1) ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      next.set(k, x);
      if (x >= n && y >= m) {
        return trace;
      }
    }
    v = next;
  }
  return trace;
}

/**
 * Walk the trace backwards to build the element-by-element edit script.
 * @param {string[]} a
 * @param {string[]} b
 * @param {Map<number, number>[]} trace
 * @returns {DiffLine[]}
 */
function backtrack(a, b, trace) {
  let x = a.length;
  let y = b.length;
  /** @type {DiffLine[]} */
  const result = [];
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0)) ? k + 1 : k - 1;
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      result.push({ type: "equal", value: a[x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      result.push(x === prevX ? { type: "add", value: b[y - 1] } : { type: "remove", value: a[x - 1] });
    }
    x = prevX;
    y = prevY;
  }
  return result.reverse();
}

/**
 * Diff two arrays of strings (lines or characters) element by element.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {DiffLine[]}
 */
function diffArray(a, b) {
  if (a.length === b.length && a.every((value, index) => value === b[index])) {
    return a.map((value) => ({ type: "equal", value }));
  }
  return backtrack(a, b, buildTrace(a, b));
}

/**
 * Merge consecutive same-type entries produced by a character-level diff into runs,
 * so a renderer can create one span per run instead of one per character.
 * @param {DiffLine[]} segments
 * @returns {DiffLine[]}
 */
function mergeRuns(segments) {
  /** @type {DiffLine[]} */
  const merged = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.type === segment.type) {
      last.value += segment.value;
    } else {
      merged.push({ type: segment.type, value: segment.value });
    }
  }
  return merged;
}

/**
 * Compute a git-diff-style line-by-line comparison between two texts.
 * @param {string} before
 * @param {string} after
 * @returns {DiffLine[]}
 */
export function diffLines(before, after) {
  if (typeof before !== "string" || typeof after !== "string") {
    throw new TypeError("对比内容必须是字符串");
  }
  return diffArray(splitLines(before), splitLines(after));
}

/**
 * Compute a character-level (Unicode code point) diff between two single lines.
 * @param {string} before
 * @param {string} after
 * @returns {DiffLine[]}
 */
export function diffChars(before, after) {
  if (typeof before !== "string" || typeof after !== "string") {
    throw new TypeError("对比内容必须是字符串");
  }
  return mergeRuns(diffArray(Array.from(before), Array.from(after)));
}

/**
 * Cheap similarity estimate for two lines, based on the length of the common prefix
 * and suffix (after stripping all whitespace, since reformatting shifts indentation
 * and comment spacing) relative to the longer line. Used only to pick which
 * removed/added lines within a changed block truly correspond to each other.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function quickSimilarity(a, b) {
  if (a === b) {
    return 1;
  }
  const na = a.replace(/\s+/g, "");
  const nb = b.replace(/\s+/g, "");
  if (na === nb) {
    return 1;
  }
  const maxLen = Math.max(na.length, nb.length) || 1;
  const minLen = Math.min(na.length, nb.length);
  let prefix = 0;
  while (prefix < minLen && na[prefix] === nb[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (suffix < minLen - prefix && na[na.length - 1 - suffix] === nb[nb.length - 1 - suffix]) {
    suffix++;
  }
  return (prefix + suffix) / maxLen;
}

/** Matching is skipped and lines are paired positionally past this candidate-pair budget. */
const MATCH_BUDGET = 5000;
/** Minimum similarity required to treat a removed/added line pair as "the same line, edited". */
const MATCH_THRESHOLD = 0.3;

/**
 * Pair removed lines with added lines inside one changed block by content similarity
 * (not just position), so a line that only gained a space still pairs with its real
 * counterpart even when a neighboring line was split or merged. Matches are kept
 * monotonic (non-crossing) so unmatched lines can be interleaved in their original order.
 * @param {string[]} removed
 * @param {string[]} added
 * @returns {Map<number, number>} removed index -> added index
 */
function matchBlockLines(removed, added) {
  /** @type {Map<number, number>} */
  const matches = new Map();
  if (removed.length * added.length > MATCH_BUDGET) {
    for (let i = 0; i < Math.min(removed.length, added.length); i++) {
      matches.set(i, i);
    }
    return matches;
  }
  let minAllowedA = 0;
  for (let r = 0; r < removed.length; r++) {
    let bestA = -1;
    let bestScore = MATCH_THRESHOLD;
    for (let a = minAllowedA; a < added.length; a++) {
      const score = quickSimilarity(removed[r], added[a]);
      if (score > bestScore) {
        bestScore = score;
        bestA = a;
      }
    }
    if (bestA !== -1) {
      matches.set(r, bestA);
      minAllowedA = bestA + 1;
    }
  }
  return matches;
}

/**
 * Build side-by-side rows (old line | new line) for a git-diff-style split view.
 * Changed lines within a block are paired by content similarity so a character-level
 * diff (e.g. an inserted space) lines up with the correct counterpart, even when a
 * neighboring line was split or merged by formatting; unmatched lines are rendered on
 * their own side only, interleaved in their original order.
 * @param {string} before
 * @param {string} after
 * @returns {DiffRow[]}
 */
export function diffSideBySide(before, after) {
  const lineDiff = diffLines(before, after);
  /** @type {DiffRow[]} */
  const rows = [];
  let oldLineNo = 0;
  let newLineNo = 0;
  let i = 0;
  while (i < lineDiff.length) {
    const line = lineDiff[i];
    if (line.type === "equal") {
      oldLineNo++;
      newLineNo++;
      rows.push({
        type: "equal",
        oldLineNo,
        newLineNo,
        oldText: line.value,
        newText: line.value,
        segments: null,
      });
      i++;
      continue;
    }

    /** @type {string[]} */
    const removed = [];
    /** @type {string[]} */
    const added = [];
    while (i < lineDiff.length && lineDiff[i].type !== "equal") {
      (lineDiff[i].type === "remove" ? removed : added).push(lineDiff[i].value);
      i++;
    }

    const matches = matchBlockLines(removed, added);
    let nextAdded = 0;
    for (let r = 0; r < removed.length; r++) {
      const matchedA = matches.get(r);
      if (matchedA === undefined) {
        oldLineNo++;
        rows.push({ type: "remove", oldLineNo, newLineNo: null, oldText: removed[r], newText: null, segments: null });
        continue;
      }
      while (nextAdded < matchedA) {
        newLineNo++;
        rows.push({ type: "add", oldLineNo: null, newLineNo, oldText: null, newText: added[nextAdded], segments: null });
        nextAdded++;
      }
      oldLineNo++;
      newLineNo++;
      rows.push({
        type: "modify",
        oldLineNo,
        newLineNo,
        oldText: removed[r],
        newText: added[matchedA],
        segments: diffChars(removed[r], added[matchedA]),
      });
      nextAdded = matchedA + 1;
    }
    for (let a = nextAdded; a < added.length; a++) {
      newLineNo++;
      rows.push({ type: "add", oldLineNo: null, newLineNo, oldText: null, newText: added[a], segments: null });
    }
  }
  return rows;
}
