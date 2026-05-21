"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsProps, Spin } from "antd";
import { TranslationOutlined } from "@ant-design/icons";
import JSONTranslator from "./JSONTranslator";
import { useTranslations, useLocale } from "next-intl";
import { TranslationProvider } from "@/app/components/TranslationContext";
import { getDocUrl } from "@/app/utils";
import ToolPage from "@/app/components/styled/ToolPage";

const TranslationSettings = dynamic(() => import("@/app/components/TranslationSettings"), {
  loading: () => (
    <div className="flex justify-center items-center py-20">
      <Spin size="large" />
    </div>
  ),
});

const ClientPage = () => {
  const tJson = useTranslations("JSON");
  const t = useTranslations("common");
  const locale = useLocale();
  const userGuideUrl = getDocUrl("guide/translation/json-translate/index.html", locale);
  // 使用时间戳来强制重新渲染
  const [activeKey, setActiveKey] = useState("basic");

  const handleTabChange = (key: string) => {
    setActiveKey(key);
  };

  const items: TabsProps["items"] = [
    {
      key: "basic",
      label: t("basicTab"),
      children: <JSONTranslator onOpenApiSettings={() => setActiveKey("advanced")} />,
    },
    {
      key: "advanced",
      label: t("advancedTab"),
      children: <TranslationSettings />,
    },
  ];

  return (
    <TranslationProvider>
      <ToolPage icon={<TranslationOutlined />} toolKey="jsonTranslate" description={tJson("clientDescription")} guideUrl={userGuideUrl}>
        <Tabs activeKey={activeKey} onChange={handleTabChange} items={items} type="card" className="w-full" animated={false} />
      </ToolPage>
    </TranslationProvider>
  );
};

export default ClientPage;
