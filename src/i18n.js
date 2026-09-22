/**
 * A minimal, dependency-free i18n layer: a flat message dictionary per locale,
 * `{{placeholder}}` interpolation, and DOM helpers that read `data-i18n*`
 * attributes so index.html stays declarative.
 */

const STORAGE_KEY = "language";

/** @type {Record<string, Record<string, string>>} */
const messages = {
  "zh-CN": {
    appTitle: "JSON 注释对齐工具",
    tagline: "让结构清晰，让注释整齐。",
    themeToggleSr: "切换日间 / 暗黑主题",
    themeToDay: "切换到日间主题",
    themeToNight: "切换到暗黑主题",
    langToggleTitle: "切换语言",
    langToggleSr: "切换中文 / English",
    langToggleLabel: "EN",
    privacyNote: "本地处理 · 不上传 · 不自动保存",
    toolbarAriaLabel: "格式化操作",
    formatButton: "格式化并对齐",
    indentLabel: "缩进",
    indent2: "2 个空格",
    indent4: "4 个空格",
    keepLinesLabel: "保留原始换行",
    commentColumnGroupLabel: "注释对齐列",
    commentColumnLeftTitle: "向左移动注释列",
    commentColumnRightTitle: "向右移动注释列",
    commentColumnInputTitle: "编辑注释对齐列",
    commentColumnPlaceholder: "—",
    loadSampleButton: "载入示例",
    clearButton: "清空",
    inputLabel: "输入",
    inputPlaceholder: '在这里粘贴带注释的 JSON，例如：\n{\n  "name": "示例", //名称\n  "enabled": true //是否启用\n}',
    outputLabel: "输出",
    outputLabelSpan: "已对齐的 JSONC",
    diffButton: "对比差异",
    copyButton: "复制",
    downloadButton: "下载 .jsonc",
    outputPlaceholder: "格式化结果将显示在这里",
    statusReady: "准备就绪，粘贴 JSON 后点击「格式化并对齐」。",
    diffTitle: "格式化前后对比",
    diffClose: "关闭对比",
    diffViewAriaLabel: "逐行差异，绿色为新增，红色为删除",
    charCount: "{{count}} 字符",
    diffChangedLines: "+{{added}} -{{removed}} 行",
    diffNoChange: "格式化未改变任何行。",
    alignedDetail: "{{count}} 条行注释已对齐到第 {{column}} 列。",
    noCommentsDetail: "没有需要对齐的行注释。",
    formatSuccess: "格式化完成，{{detail}}",
    inputUpdated: "输入已更新，请重新格式化。",
    indentUpdated: "缩进已更新，请重新格式化。",
    keepLinesUpdated: "换行保留选项已更新，请重新格式化。",
    sampleConfirm: "载入示例将替换当前输入，是否继续？",
    cleared: "已清空。内容不会自动保存。",
    copied: "已复制到剪贴板。",
    copyFailed: "复制失败，请按 Ctrl / ⌘ + C 手动复制。{{error}}",
    downloadStarted: "已发起下载 formatted.jsonc。",
  },
  en: {
    appTitle: "JSON Comment Aligner",
    tagline: "Clear structure, tidy comments.",
    themeToggleSr: "Toggle light / dark theme",
    themeToDay: "Switch to light theme",
    themeToNight: "Switch to dark theme",
    langToggleTitle: "Switch language",
    langToggleSr: "Switch 中文 / English",
    langToggleLabel: "中",
    privacyNote: "Processed locally · Nothing uploaded · Nothing auto-saved",
    toolbarAriaLabel: "Formatting actions",
    formatButton: "Format & align",
    indentLabel: "Indent",
    indent2: "2 spaces",
    indent4: "4 spaces",
    keepLinesLabel: "Keep original line breaks",
    commentColumnGroupLabel: "Comment alignment column",
    commentColumnLeftTitle: "Shift comments left",
    commentColumnRightTitle: "Shift comments right",
    commentColumnInputTitle: "Edit comment alignment column",
    commentColumnPlaceholder: "—",
    loadSampleButton: "Load sample",
    clearButton: "Clear",
    inputLabel: "Input",
    inputPlaceholder: 'Paste JSON with comments here, e.g.:\n{\n  "name": "example", //name\n  "enabled": true //is enabled\n}',
    outputLabel: "Output",
    outputLabelSpan: "Aligned JSONC",
    diffButton: "Show diff",
    copyButton: "Copy",
    downloadButton: "Download .jsonc",
    outputPlaceholder: "The formatted result will appear here",
    statusReady: 'Ready. Paste JSON, then click "Format & align".',
    diffTitle: "Diff before / after formatting",
    diffClose: "Close diff",
    diffViewAriaLabel: "Line-by-line diff, green is added, red is removed",
    charCount: "{{count}} characters",
    diffChangedLines: "+{{added}} -{{removed}} lines",
    diffNoChange: "Formatting did not change any line.",
    alignedDetail: "{{count}} line comment(s) aligned to column {{column}}.",
    noCommentsDetail: "No line comments needed alignment.",
    formatSuccess: "Formatted. {{detail}}",
    inputUpdated: "Input updated. Please format again.",
    indentUpdated: "Indent updated. Please format again.",
    keepLinesUpdated: "Line-break preservation updated. Please format again.",
    sampleConfirm: "Loading the sample will replace the current input. Continue?",
    cleared: "Cleared. Content is not auto-saved.",
    copied: "Copied to clipboard.",
    copyFailed: "Copy failed, please press Ctrl / ⌘ + C to copy manually. {{error}}",
    downloadStarted: "Download of formatted.jsonc started.",
  },
};

const defaultLocale = "zh-CN";
const supportedLocales = Object.keys(messages);

/** @param {string | undefined | null} locale @returns {string} */
function normalizeLocale(locale) {
  return typeof locale === "string" && locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** @returns {string} */
function detectLocale() {
  try {
    const chromeLocale = globalThis.chrome?.i18n?.getUILanguage?.();
    if (chromeLocale) return normalizeLocale(chromeLocale);
  } catch {
    // chrome.i18n is only available inside the extension runtime.
  }
  return normalizeLocale(globalThis.navigator?.language);
}

let currentLocale = detectLocale();
try {
  const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (stored && supportedLocales.includes(stored)) {
    currentLocale = stored;
  }
} catch {
  // localStorage can be unavailable (e.g. privacy mode).
}

/** @returns {string} the active locale, e.g. "zh-CN" or "en" */
export function getLocale() {
  return currentLocale;
}

/** @param {string} locale */
export function setLocale(locale) {
  currentLocale = supportedLocales.includes(locale) ? locale : defaultLocale;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, currentLocale);
  } catch {
    // localStorage can be unavailable (e.g. privacy mode).
  }
}

/** Switch to the other supported locale and return it. */
export function toggleLocale() {
  setLocale(currentLocale === "zh-CN" ? "en" : "zh-CN");
  return currentLocale;
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
  const template = messages[currentLocale]?.[key] ?? messages[defaultLocale][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));
}

/**
 * Apply translations to every element under `root` that carries a
 * `data-i18n*` attribute, and keep <html lang> in sync.
 * @param {ParentNode} [root]
 */
export function applyTranslations(root = document) {
  for (const el of Array.from(root.querySelectorAll("[data-i18n]"))) {
    el.textContent = t(el.getAttribute("data-i18n") ?? "");
  }
  for (const el of Array.from(root.querySelectorAll("[data-i18n-html]"))) {
    el.innerHTML = t(el.getAttribute("data-i18n-html") ?? "");
  }
  for (const el of Array.from(root.querySelectorAll("[data-i18n-placeholder]"))) {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder") ?? ""));
  }
  for (const el of Array.from(root.querySelectorAll("[data-i18n-title]"))) {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title") ?? ""));
  }
  for (const el of Array.from(root.querySelectorAll("[data-i18n-aria-label]"))) {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label") ?? ""));
  }
  if (root === document) {
    document.documentElement.lang = currentLocale;
  }
}
