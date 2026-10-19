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
