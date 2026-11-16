/**
 * JSON 预处理工具 - 使用 json5 实现宽松解析
 * 支持：尾逗号、未加引号的键名、注释、单引号字符串等
 * 保留原有的自动包裹功能
 */

import JSON5 from "json5";
import type { JsonObject, JsonValue } from "@/app/types";

// 移除 UTF-8 BOM
const stripBOM = (s: string) => (s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/**
 * 解析失败哨兵。
 *
 * ⚠ **不能用 `null` 当哨兵** —— `null` 是一份合法的 JSON 文档（RFC 8259 允许任何
 * 值作顶层）。旧实现写的是 `if (parsed !== null) return parsed`，于是输入 `null`
 * 被当成"解析失败"，一路落到 `[${base}]` 那个兜底分支，**静默产出 `[null]`**：
 * 一份合法的 JSON 被改写成另一种结构。CLI 侧为此长期绕开本函数（见
 * `lib/translation/cliFormat.ts` 的 jsonHandler 注释，那条理由原本写着
 * "无法表示成功解析出的顶层 null"）。
 *
 * 用 Symbol 而不是 `undefined`：`JSON5.parse("undefined")` 会抛，但语义上"没解析
 * 出来"仍需要与"解析出来了，值恰好是 undefined"区分（虽然 JSON 没有 undefined）。
 */
const PARSE_FAILED = Symbol("json-parse-failed");

// 尝试使用 json5 解析，失败返回 PARSE_FAILED
const tryParse = (str: string): JsonValue | typeof PARSE_FAILED => {
  try {
    return JSON5.parse(str) as JsonValue;
  } catch {
    return PARSE_FAILED;
  }
};

// JSON type guards
export const isJsonObject = (value: JsonValue): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 预处理并解析 JSON 字符串
 * 使用 json5 提供宽松的解析能力，并保留自动包裹功能
 */
export const preprocessJson = (input: string): JsonValue => {
  const base = stripBOM(String(input)).trim();

  // 1) 首先尝试直接解析。⚠ 判据是 `!== PARSE_FAILED`，不是 `!== null`：
  //    顶层 `null` 是合法文档，必须原样返回（见 PARSE_FAILED 的注释）。
  const direct = tryParse(base);
  if (direct !== PARSE_FAILED) return direct;

  // 2) 尝试用 {} 包裹后解析（用于处理没有外层对象包裹的情况）
  const wrapped = tryParse(`{${base}}`);
  if (wrapped !== PARSE_FAILED) return wrapped;

  // 3) 尝试用 [] 包裹后解析（用于处理没有外层数组包裹的情况）
  const asArray = tryParse(`[${base}]`);
  if (asArray !== PARSE_FAILED) return asArray;

  // 4) 全部失败，抛出错误
  throw new Error("Unable to parse JSON. / 无法解析 JSON 数据。");
};

/**
 * 去除 JSON 字符串的最外层包裹（{} 或 []），返回内部内容。
 */
export const stripJsonWrapper = (input: string): string => {
  const trimmed = stripBOM(input).trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed.slice(1, -1).trim();
  }
  throw new Error("JSON format error: missing a valid outer wrapper. / JSON 格式错误：缺少有效的外层包裹结构，请检查格式。");
};

// Separators and operators in an unquoted recursive JSONPath. Other punctuation
// (e.g. "$schema", "C++", "part/one") and Unicode names can be inserted as-is.
const FIELD_PATH_SYNTAX = /[.,，\[\];^~'"]|#\d|^(?:[$*]$|[`@(]|\?\(|-?\d*:-?\d*(?::\d*)?$)/;

/**
 * 收集 JSON 里的字符串字段名及含字符串项的数组路径,去重,保持首次出现顺序。
 *
 * 用途:json-translate 键映射模式及各 JSON 工具的字段快选 chips —— 手打字段名会 typo,
 * 点一下就能加进输入框。
 *
 * ⚠ 三个判据,都不是"节省 chips"那种装饰性理由:
 *  1. 必须能匹配字符串值。字符串数组用 key[*],混合数组的非字符串项由收集器跳过。
 *     列出 count/ok 这类键会让用户点出
 *     一个【不会被翻译】的字段 —— 点了没反应还不知道为什么。
 *  2. 快选把键名直接写进逗号分隔的 JSONPath 输入框，排除会被拆分或解释成路径的名字。
 *     例如 "a.b" 会指向嵌套字段，"a，b" 会被拆成两项。
 *  3. 递归走对象【与】数组。json-value-swapper 的 availableKeys 只收
 *     Array.isArray 的扁平根,嵌套对象(a.b[].c)一个字段都列不出 —— 而嵌套
 *     正是最常见的形状。
 *
 * 解析失败(用户还在敲、JSON 半完整)返回 [] 而不是抛:调用点在渲染期,
 * 抛错会把整个工具页炸掉。
 */
export const collectStringFieldNames = (input: string): string[] => {
  const keys = new Set<string>();
  const walk = (value: JsonValue): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isJsonObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key && key === key.trim() && !FIELD_PATH_SYNTAX.test(key)) {
        if (typeof child === "string") keys.add(key);
        // 数字键的通配路径还可能命中数组下标；末层过滤器无法区分其祖先。
        else if (Array.isArray(child) && !/^\d+$/.test(key) && child.some((item) => typeof item === "string")) keys.add(`${key}[*]`);
      }
      if (typeof child === "object" && child !== null) walk(child);
    }
  };
  try {
    walk(preprocessJson(input));
  } catch {
    return [];
  }
  return Array.from(keys);
};

/** Rooted paths; arrays share a wildcard so repeated records produce one suggestion. */
export const collectJsonPaths = (input: string, { stringsOnly = false, includeContainers = false } = {}): string[] => {
  const paths = new Set<string>();
  const walk = (value: JsonValue, path: string): boolean => {
    if (typeof value !== "object" || value === null) {
      const matches = !stringsOnly || typeof value === "string";
      if (matches && path !== "$") paths.add(path);
      return matches;
    }
    let hasMatch = false;
    if (Array.isArray(value)) {
      for (const child of value) hasMatch = walk(child, `${path}[*]`) || hasMatch;
    } else {
      for (const [key, child] of Object.entries(value)) {
        // jsonpath-plus cannot reliably round-trip quotes/brackets in literal keys.
        if (/[\[\]'"\\]/.test(key)) continue;
        hasMatch = walk(child, `${path}['${key}']`) || hasMatch;
      }
    }
    if (includeContainers && (hasMatch || !stringsOnly) && path !== "$") paths.add(path);
    return hasMatch;
  };
  try { walk(preprocessJson(input), "$"); } catch { return []; }
  return Array.from(paths);
};

/** Direct record fields, for tools whose operations do not traverse nested values. */
export const collectJsonRecordKeys = (input: string): string[] => {
  try {
    const value = preprocessJson(input);
    return Array.isArray(value) ? [...new Set(value.filter(isJsonObject).flatMap(Object.keys))] : [];
  } catch { return []; }
};

/** Literal key names for recursive insertion (not JSONPath expressions). */
export const collectJsonObjectKeys = (input: string): string[] => {
  const keys = new Set<string>();
  const walk = (value: JsonValue): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (isJsonObject(value)) {
      for (const [key, child] of Object.entries(value)) { keys.add(key); walk(child); }
    }
  };
  try { walk(preprocessJson(input)); } catch { return []; }
  return [...keys];
};
