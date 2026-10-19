"use client";

import { App } from "antd";
import { useTranslations } from "next-intl";
import { preprocessJson, hasPrecisionLossRisk } from "@/app/utils";
import type { JsonValue } from "@/app/types";

/**
 * JSON 工具组共用的「解析 + 提示」:非法 JSON 报错并返回 null;超出 double 安全范围的
 * 整数(雪花 ID)在 parse→stringify 往返中会被静默改值 —— 工具保不了真,至少把静默损坏转为知情。
 *
 * ⚠ 返回的 `null` 有**两种**来源,这里分开处理 —— 它们对用户是两件事:
 *   ① 解析失败 → `message.error(invalidJson)`:语法不对,该改文件;
 *   ② 解析成功、但顶层就是 `null`(`null` 是合法 JSON 文档)→ `message.warning(nothingToProcess)`。
 *      六个消费方要的都只是**对象或数组**(按 JSONPath 取节点 / 增删键 / 排序分类),
 *      顶层 `null` 对它们没有可做的操作,所以 ② 也走「没有东西可处理」的早退路径。
 *
 * ② 早退本身没问题,**静默早退才是问题**:用户点了按钮,界面毫无反应也没有任何提示,
 * 只会以为工具坏了(AGENTS.md:「宁可多一个显式的说明,别让用户面对一个不响应的控件」)。
 * ⚠ ② 的文案不能复用 `invalidJson` —— 那会对一份合法 JSON 说谎。
 */
export const useParseJson = () => {
  const { message } = App.useApp();
  const tJson = useTranslations("JSON");
  return (text: string): JsonValue | null => {
    let value: JsonValue;
    try {
      value = preprocessJson(text);
    } catch {
      message.error(tJson("invalidJson"));
      return null;
    }
    // 顶层 `null` 是合法 JSON,但对六个消费方来说「没有可处理的东西」。
    // 早退可以,静默早退不行 —— 说清是「格式没问题、是没东西可处理」。
    if (value === null) {
      message.warning(tJson("nothingToProcess"));
      return null;
    }
    if (hasPrecisionLossRisk(text)) message.warning(tJson("bigIntPrecision"));
    return value;
  };
};
