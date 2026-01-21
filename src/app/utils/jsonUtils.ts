/**
 * JSON 预处理工具 - 使用 json5 实现宽松解析
 * 支持：尾逗号、未加引号的键名、注释、单引号字符串等
 * 保留原有的自动包裹功能
 */

import JSON5 from "json5";
import type { JsonObject, JsonValue } from "@/app/types";

// 移除 UTF-8 BOM
const stripBOM = (s: string) => (s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

// 尝试使用 json5 解析，失败返回 null
const tryParse = (str: string): JsonValue | null => {
  try {
    return JSON5.parse(str) as JsonValue;
  } catch {
    return null;
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

  // 1) 首先尝试直接解析
  let parsed = tryParse(base);
  if (parsed !== null) return parsed;

  // 2) 尝试用 {} 包裹后解析（用于处理没有外层对象包裹的情况）
  parsed = tryParse(`{${base}}`);
  if (parsed !== null) return parsed;

  // 3) 尝试用 [] 包裹后解析（用于处理没有外层数组包裹的情况）
  parsed = tryParse(`[${base}]`);
  if (parsed !== null) return parsed;

  // 4) 全部失败，抛出错误
  throw new Error("Unable to parse JSON 无法解析 JSON 数据。");
};

/**
 * 去除 JSON 字符串的最外层包裹（{} 或 []），返回内部内容。
 */
export const stripJsonWrapper = (input: string): string => {
  const trimmed = stripBOM(input).trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed.slice(1, -1).trim();
  }
  throw new Error("JSON format error: 缺少有效的外层包裹结构，请检查格式");
};
