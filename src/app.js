import { formatJsonc, JsonInputError } from "./formatter.js";
import { highlightJsonc } from "./highlight.js";
import { diffSideBySide } from "./diff.js";
import { sample } from "./sample.js";
import { applyTranslations, getLocale, t, toggleLocale } from "./i18n.js";

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @param {{ new(...args: never[]): T }} type
 * @returns {T}
 */
function element(id, type) {
  const result = document.getElementById(id);
  if (!(result instanceof type)) {
    throw new Error(`Missing element: ${id}`);
  }
  return result;
}

const input = element("input", HTMLTextAreaElement);
const output = element("output", HTMLTextAreaElement);
const inputLines = element("input-lines", HTMLDivElement);
const outputLines = element("output-lines", HTMLDivElement);
const inputHighlight = element("input-highlight", HTMLElement);
const outputHighlight = element("output-highlight", HTMLElement);
const indent = element("indent", HTMLDivElement);
const keepLines = element("keep-lines", HTMLInputElement);
const status = element("status", HTMLParagraphElement);
const count = element("input-count", HTMLSpanElement);
const copy = element("copy", HTMLButtonElement);
const download = element("download", HTMLButtonElement);
const diffButton = element("diff", HTMLButtonElement);
const diffDialog = element("diff-dialog", HTMLDialogElement);
const diffView = element("diff-view", HTMLDivElement);
const diffSummary = element("diff-summary", HTMLSpanElement);
const langToggle = element("lang-toggle", HTMLButtonElement);

/** @returns {"zh" | "en"} the formatter locale matching the active UI language */
function formatterLocale() {
  return getLocale() === "zh-CN" ? "zh" : "en";
}

/** @returns {2 | 4} */
function indentSize() {
  const selected = indent.querySelector('input[name="indent"]:checked');
  return selected instanceof HTMLInputElement && selected.value === "4" ? 4 : 2;
}

applyTranslations();
langToggle.addEventListener("click", () => {
  toggleLocale();
  applyTranslations();
  invalidate();
  notify(t("statusReady"));
});

/**
 * Re-render a textarea's syntax-highlighted backdrop, escaping and coloring
 * its current value. Call whenever the textarea's value changes.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} backdrop
 */
function renderHighlight(textarea, backdrop) {
  backdrop.innerHTML = highlightJsonc(textarea.value);
}

/**
 * Keep the highlighted backdrop scrolled to the same position as the
 * (transparent) textarea rendered on top of it.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} backdrop
 */
function syncScroll(textarea, backdrop) {
  const pre = backdrop.parentElement;
  if (pre) {
    pre.scrollTop = textarea.scrollTop;
    pre.scrollLeft = textarea.scrollLeft;
  }
}

input.addEventListener("scroll", () => syncScroll(input, inputHighlight));
output.addEventListener("scroll", () => syncScroll(output, outputHighlight));

/**
 * Keep a textarea's highlight-backdrop container and line-number gutter
 * the same height as the textarea itself. Both are laid out as flex
 * siblings/ancestors whose "auto" height would otherwise be stretched to
 * fit the gutter's unclipped (always-full-length) content, so dragging
 * the textarea's native resize handle smaller left the backdrop and
 * gutter tall while only the interactive textarea box shrank, drifting
 * the two layers apart. Setting an explicit height here removes that
 * dependency on flex stretch entirely.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLDivElement} lineNumbers
 */
function syncEditorHeight(textarea, lineNumbers) {
  const codeEditor = textarea.parentElement;
  if (!codeEditor) return;
  const height = `${textarea.offsetHeight}px`;
  codeEditor.style.height = height;
  lineNumbers.style.height = height;
}

if (typeof ResizeObserver !== "undefined") {
  const inputResize = new ResizeObserver(() => syncEditorHeight(input, inputLines));
  const outputResize = new ResizeObserver(() => syncEditorHeight(output, outputLines));
  inputResize.observe(input);
  outputResize.observe(output);
} else {
  syncEditorHeight(input, inputLines);
  syncEditorHeight(output, outputLines);
}

const editors = element("editors", HTMLDivElement);
const splitter = element("editors-splitter", HTMLDivElement);

const SPLIT_STORAGE_KEY = "editorSplit";
const SPLIT_MIN = 20;
const SPLIT_MAX = 80;

/** @param {number} percent */
function clampSplit(percent) {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, percent));
}

/** @param {number} percent */
function applySplit(percent) {
  const clamped = clampSplit(percent);
  editors.style.setProperty("--split-left", `${clamped}%`);
  return clamped;
}

/** Restore a previously saved input/output split ratio, if any. */
function restoreSplit() {
  const saved = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
  if (Number.isFinite(saved) && saved > 0) {
    applySplit(saved);
  }
}

restoreSplit();

/** @param {PointerEvent} event */
function onSplitterPointerMove(event) {
  const rect = editors.getBoundingClientRect();
  if (rect.width <= 0) return;
  const percent = ((event.clientX - rect.left) / rect.width) * 100;
  const clamped = applySplit(percent);
  localStorage.setItem(SPLIT_STORAGE_KEY, String(clamped));
}

splitter.addEventListener("pointerdown", (event) => {
  splitter.classList.add("dragging");
  splitter.setPointerCapture(event.pointerId);
  event.preventDefault();
});
splitter.addEventListener("pointermove", (event) => {
  if (splitter.classList.contains("dragging")) {
    onSplitterPointerMove(event);
  }
});
/** @param {PointerEvent} event */
function stopSplitterDrag(event) {
  splitter.classList.remove("dragging");
  if (splitter.hasPointerCapture(event.pointerId)) {
    splitter.releasePointerCapture(event.pointerId);
  }
}
splitter.addEventListener("pointerup", stopSplitterDrag);
splitter.addEventListener("pointercancel", stopSplitterDrag);
splitter.addEventListener("keydown", (event) => {
  const current = Number.parseFloat(getComputedStyle(editors).getPropertyValue("--split-left")) || 50;
  if (event.key === "ArrowLeft") {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(applySplit(current - 2)));
    event.preventDefault();
  } else if (event.key === "ArrowRight") {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(applySplit(current + 2)));
    event.preventDefault();
  } else if (event.key === "Home") {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(applySplit(50)));
    event.preventDefault();
  }
});

const themeToggle = element("theme-toggle", HTMLButtonElement);

/** @returns {"light" | "dark"} */
function getInitialTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** @param {"light" | "dark"} theme */
function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-checked", String(isDark));
  themeToggle.title = t(isDark ? "themeToDay" : "themeToNight");
}

applyTheme(getInitialTheme());
themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", nextTheme);
  applyTheme(nextTheme);
});

/** @param {string} message @param {"info" | "success" | "error"} [tone] */
function notify(message, tone = "info") {
  status.textContent = message;
  status.dataset.tone = tone;
}

/** @param {HTMLTextAreaElement} textarea @param {HTMLDivElement} lineNumbers */
function updateLineNumbers(textarea, lineNumbers) {
  const lineCount = textarea.value.split("\n").length;
  lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
  lineNumbers.scrollTop = textarea.scrollTop;
}

function updateAllLineNumbers() {
  updateLineNumbers(input, inputLines);
  updateLineNumbers(output, outputLines);
}

function invalidate() {
  count.textContent = t("charCount", { count: Array.from(input.value).length.toLocaleString(getLocale()) });
  output.value = "";
  updateAllLineNumbers();
  copy.disabled = true;
  download.disabled = true;
  diffButton.disabled = true;
  input.removeAttribute("aria-invalid");
  renderHighlight(input, inputHighlight);
  renderHighlight(output, outputHighlight);
}

/**
 * Append character-level diff spans for one side (old or new) of a changed line,
 * skipping segments that only apply to the other side.
 * @param {HTMLElement} container
 * @param {{ type: "equal" | "remove" | "add", value: string }[]} segments
 * @param {"old" | "new"} side
 */
function appendSegments(container, segments, side) {
  for (const segment of segments) {
    if ((side === "old" && segment.type === "add") || (side === "new" && segment.type === "remove")) {
      continue;
    }
    const span = document.createElement("span");
    if (segment.type === "remove") {
      span.className = "diff-char-remove";
    } else if (segment.type === "add") {
      span.className = "diff-char-add";
    }
    span.textContent = segment.value;
    container.append(span);
  }
}

/**
 * Pick the pane-level highlight class for one side of a diff row.
 * @param {import("./diff.js").DiffRow} row
 * @param {"old" | "new"} side
 * @returns {string}
 */
function paneModifierClass(row, side) {
  if (row.type === "modify") {
    return side === "old" ? "diff-pane-remove" : "diff-pane-add";
  }
  if (row.type === "remove") {
    return side === "old" ? "diff-pane-remove" : "diff-pane-empty";
  }
  if (row.type === "add") {
    return side === "new" ? "diff-pane-add" : "diff-pane-empty";
  }
  return "";
}

/**
 * Build one side (old or new) of a side-by-side diff row.
 * @param {import("./diff.js").DiffRow} row
 * @param {"old" | "new"} side
 * @returns {HTMLDivElement}
 */
function buildPane(row, side) {
  const lineNo = side === "old" ? row.oldLineNo : row.newLineNo;
  const pane = document.createElement("div");
  pane.className = `diff-pane ${paneModifierClass(row, side)}`.trim();
  if (lineNo === null) {
    return pane;
  }

  const gutter = document.createElement("span");
  gutter.className = "diff-gutter";
  gutter.textContent = String(lineNo);

  const marker = document.createElement("span");
  marker.className = "diff-marker";
  marker.textContent = row.type === "equal" ? " " : side === "old" ? "-" : "+";

  const text = document.createElement("span");
  text.className = "diff-text";
  if (row.segments) {
    appendSegments(text, row.segments, side);
  } else {
    text.textContent = (side === "old" ? row.oldText : row.newText) ?? "";
  }

  pane.append(gutter, marker, text);
  return pane;
}

/**
 * Render a git-diff-style, side-by-side comparison of the text before and after formatting,
 * with character-level highlighting inside changed lines (e.g. an inserted space).
 * @param {string} before
 * @param {string} after
 */
function renderDiff(before, after) {
  const rows = diffSideBySide(before, after);
  diffView.replaceChildren();
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.type === "add" || row.type === "modify") {
      added++;
    }
    if (row.type === "remove" || row.type === "modify") {
      removed++;
    }

    const rowElement = document.createElement("div");
    rowElement.className = "diff-row";
    rowElement.append(buildPane(row, "old"), buildPane(row, "new"));
    diffView.append(rowElement);
  }
  diffSummary.textContent = added || removed
    ? t("diffChangedLines", { added: added.toLocaleString(getLocale()), removed: removed.toLocaleString(getLocale()) })
    : t("diffNoChange");
}

function runFormat() {
  try {
    const result = formatJsonc(input.value, {
      indentSize: indentSize(),
      keepLines: keepLines.checked,
      locale: formatterLocale(),
    });
    output.value = result.text;
    updateAllLineNumbers();
    input.removeAttribute("aria-invalid");
    copy.disabled = false;
    download.disabled = false;
    diffButton.disabled = false;
    renderHighlight(input, inputHighlight);
    renderHighlight(output, outputHighlight);
    const detail = result.commentCount
      ? t("alignedDetail", { count: result.commentCount, column: result.commentColumn ?? 0 })
      : t("noCommentsDetail");
    notify(t("formatSuccess", { detail }), "success");
  } catch (error) {
    invalidate();
    input.setAttribute("aria-invalid", "true");
    notify(error instanceof Error ? error.message : String(error), "error");
    if (error instanceof JsonInputError) {
      input.focus();
      const offset = error.offset + (input.value.startsWith("\uFEFF") ? 1 : 0);
      input.setSelectionRange(offset, offset);
    }
  }
}

/**
 * Re-run formatting after a formatting option changes, while avoiding a
 * surprising syntax error when the editor is still empty.
 * @param {string} emptyMessage
 */
function rerunFormatAfterOptionChange(emptyMessage) {
  if (input.value.trim()) {
    runFormat();
  } else {
    invalidate();
    notify(emptyMessage);
  }
}

input.addEventListener("input", () => {
  invalidate();
  notify(t("inputUpdated"));
});
input.addEventListener("scroll", () => updateLineNumbers(input, inputLines));
output.addEventListener("scroll", () => updateLineNumbers(output, outputLines));
indent.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const value = String(indentSize());
  input.style.tabSize = value;
  output.style.tabSize = value;
  inputHighlight.parentElement?.style.setProperty("tab-size", value);
  outputHighlight.parentElement?.style.setProperty("tab-size", value);
  rerunFormatAfterOptionChange(t("indentUpdated"));
});
keepLines.addEventListener("change", () => {
  rerunFormatAfterOptionChange(t("keepLinesUpdated"));
});
element("format", HTMLButtonElement).addEventListener("click", runFormat);
element("sample", HTMLButtonElement).addEventListener("click", () => {
  if (input.value && !window.confirm(t("sampleConfirm"))) {
    return;
  }
  input.value = sample;
  invalidate();
  runFormat();
});
element("clear", HTMLButtonElement).addEventListener("click", () => {
  input.value = "";
  invalidate();
  notify(t("cleared"));
  input.focus();
});
diffButton.addEventListener("click", () => {
  renderDiff(input.value, output.value);
  diffDialog.showModal();
});
element("diff-close", HTMLButtonElement).addEventListener("click", () => diffDialog.close());
diffDialog.addEventListener("click", (event) => {
  if (event.target === diffDialog) {
    diffDialog.close();
  }
});
copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    notify(t("copied"), "success");
  } catch (error) {
    output.focus();
    output.select();
    notify(t("copyFailed", { error: error instanceof Error ? error.message : String(error) }), "error");
  }
});
download.addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([output.value], {
    type: "text/plain;charset=utf-8",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "formatted.jsonc";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(t("downloadStarted"), "success");
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runFormat();
  }
});

invalidate();
