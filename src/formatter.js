import {
  applyEdits,
  createScanner,
  format,
  parseTree,
  printParseErrorCode,
  SyntaxKind,
} from "jsonc-parser";

export class JsonInputError extends Error {
  /**
   * @param {string} message
   * @param {string} source
   * @param {number} offset
   * @param {"zh" | "en"} [locale]
   */
  constructor(message, source, offset, locale = "zh") {
    const before = source.slice(0, offset).split("\n");
    const line = before.length;
    const column = Array.from(before[before.length - 1]).length + 1;
    super(locationMessages[locale](line, column, message));
    this.name = "JsonInputError";
    this.line = line;
    this.column = column;
    this.offset = offset;
  }
}

/** @type {Record<"zh" | "en", (line: number, column: number, message: string) => string>} */
const locationMessages = {
  zh: (line, column, message) => `第 ${line} 行，第 ${column} 列：${message}`,
  en: (line, column, message) => `Line ${line}, column ${column}: ${message}`,
};

/** @type {Record<"zh" | "en", Record<string, string>>} */
const errorMessages = {
  zh: {
    InvalidSymbol: "存在非法字符",
    InvalidNumberFormat: "数字格式不正确",
    PropertyNameExpected: "属性名必须使用双引号",
    ValueExpected: "缺少有效的 JSON 值",
    ColonExpected: "属性名后缺少冒号",
    CommaExpected: "字段或数组元素之间缺少逗号",
    CloseBraceExpected: "缺少右花括号 }",
    CloseBracketExpected: "缺少右方括号 ]",
    EndOfFileExpected: "根节点后存在多余内容",
    InvalidCommentToken: "注释格式不正确",
    UnexpectedEndOfComment: "块注释没有结束",
    UnexpectedEndOfString: "字符串没有结束",
    UnexpectedEndOfNumber: "数字没有结束",
    InvalidUnicode: "Unicode 转义不正确",
    InvalidEscapeCharacter: "字符串转义不正确",
    InvalidCharacter: "字符串中存在非法字符",
  },
  en: {
    InvalidSymbol: "Invalid character",
    InvalidNumberFormat: "Malformed number",
    PropertyNameExpected: "Property names must use double quotes",
    ValueExpected: "Missing a valid JSON value",
    ColonExpected: "Missing colon after the property name",
    CommaExpected: "Missing comma between fields or array elements",
    CloseBraceExpected: "Missing closing brace }",
    CloseBracketExpected: "Missing closing bracket ]",
    EndOfFileExpected: "Unexpected content after the root value",
    InvalidCommentToken: "Malformed comment",
    UnexpectedEndOfComment: "Block comment was not closed",
    UnexpectedEndOfString: "String was not closed",
    UnexpectedEndOfNumber: "Number was not closed",
    InvalidUnicode: "Invalid Unicode escape",
    InvalidEscapeCharacter: "Invalid string escape",
    InvalidCharacter: "Invalid character inside string",
  },
};

/** @type {Record<"zh" | "en", { invalidInput: string, invalidIndent: string }>} */
const genericMessages = {
  zh: { invalidInput: "输入必须是字符串", invalidIndent: "缩进只支持 2 或 4 个空格" },
  en: { invalidInput: "Input must be a string", invalidIndent: "Indent only supports 2 or 4 spaces" },
};

/**
 * Format JSONC without serializing values, then align actual line-comment tokens.
 * @param {string} source
 * @param {{ indentSize?: 2 | 4, locale?: "zh" | "en" }} [options]
 * @returns {{ text: string, commentCount: number, commentColumn: number | null }}
 */
export function formatJsonc(source, { indentSize = 2, locale = "zh" } = {}) {
  const messages = genericMessages[locale] ?? genericMessages.zh;
  if (typeof source !== "string") {
    throw new TypeError(messages.invalidInput);
  }
  if (indentSize !== 2 && indentSize !== 4) {
    throw new RangeError(messages.invalidIndent);
  }

  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  /** @type {import("jsonc-parser").ParseError[]} */
  const errors = [];
  parseTree(normalized, errors, { allowTrailingComma: true });
  if (errors.length) {
    const error = errors[0];
    const code = printParseErrorCode(error.error);
    const localizedMessages = errorMessages[locale] ?? errorMessages.zh;
    throw new JsonInputError(localizedMessages[code] ?? code, normalized, error.offset, locale);
  }

  const formatted = applyEdits(
    normalized,
    format(normalized, undefined, {
      tabSize: indentSize,
      insertSpaces: true,
      eol: "\n",
      keepLines: false,
      insertFinalNewline: true,
    }),
  );
  const scanner = createScanner(formatted, false);
  /** @type {{ start: number, end: number, width: number, content: string }[]} */
  const comments = [];
  let column = 0;
  let lineStart = 0;
  for (
    let kind = scanner.scan();
    kind !== SyntaxKind.EOF;
    kind = scanner.scan()
  ) {
    const offset = scanner.getTokenOffset();
    if (kind === SyntaxKind.LineBreakTrivia) {
      lineStart = offset + scanner.getTokenLength();
    }
    if (kind !== SyntaxKind.LineCommentTrivia) {
      continue;
    }

    // A block comment may contain newlines inside a single scanner token.
    lineStart = Math.max(lineStart, formatted.lastIndexOf("\n", offset - 1) + 1);
    const prefix = formatted.slice(lineStart, offset);
    const code = prefix.trimEnd();
    const width = Array.from(code).length;
    const minimum = code.length ? width + 1 : Array.from(prefix).length;
    column = Math.max(column, minimum);
    comments.push({
      start: lineStart + code.length,
      end: offset + scanner.getTokenLength(),
      width,
      content: formatted.slice(offset + 2, offset + scanner.getTokenLength()).trim(),
    });
  }

  const edits = comments.map((comment) => ({
    offset: comment.start,
    length: comment.end - comment.start,
    content: `${" ".repeat(column - comment.width)}// ${comment.content}`,
  }));
  return {
    text: applyEdits(formatted, edits),
    commentCount: comments.length,
    commentColumn: comments.length ? column + 1 : null,
  };
}
