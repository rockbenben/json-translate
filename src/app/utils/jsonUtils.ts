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
  throw new Error("Unable to parse JSON. / 无法解析 JSON 数据。");
};

/**
 * 粗扫原文中超出 Number 安全范围的整数字面量。JSON5/JSON.parse 把所有数字解析成
 * IEEE double —— 雪花 ID(Discord/Twitter 的 int64)这类 >2^53 的整数被静默改值
 * (12345678901234567890 → …4567000),且损坏发生在用户没碰的字段上、re-stringify
 * 后无任何提示。解析层无法保真(lossless 化是结构性改动),调用方据此弹 warning,
 * 把静默损坏转为知情。字符串字面量先剥掉(JSON5 允许单引号),避免把字符串里的
 * 数字串误报;小数/十六进制/指数形式被前后 [\w.] 锚排除。
 */
export const hasPrecisionLossRisk = (input: string): boolean => {
  const stripped = String(input).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  const runs = stripped.match(/(?<![\w.])\d{16,}(?![\w.])/g);
  // 整数无法逐字回环 ⇒ 在 double 里丢了精度(16 位但 ≤2^53 的精确值、以及 2^53 以上
  // 恰好可表示的整数如 1e16 都【不】报)。先剥前导零再比——否则 "0000…"(全零/前导零
  // 串)Number 后塌成小值,逐字比会把真值其实很小的串误报成丢精度。
  return runs?.some((run) => String(Number(run)) !== (run.replace(/^0+/, "") || "0")) ?? false;
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
