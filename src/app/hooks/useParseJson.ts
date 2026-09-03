"use client";

import { App } from "antd";
import { useTranslations } from "next-intl";
import { preprocessJson, hasPrecisionLossRisk } from "@/app/utils";
import type { JsonValue } from "@/app/types";

/**
 * JSON 工具组共用的「解析 + 两条提示」:非法 JSON 报错并返回 null;超出 double 安全范围的
 * 整数(雪花 ID)在 parse→stringify 往返中会被静默改值 —— 工具保不了真,至少把静默损坏转为知情。
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
    if (hasPrecisionLossRisk(text)) message.warning(tJson("bigIntPrecision"));
    return value;
  };
};
