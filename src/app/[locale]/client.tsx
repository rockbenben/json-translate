"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsProps, Typography, Spin } from "antd";
import { TranslationOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import JSONTranslator from "./JSONTranslator";
import { useTranslations, useLocale } from "next-intl";
import { TranslationProvider } from "@/app/components/TranslationContext";

const TranslationSettings = dynamic(() => import("@/app/components/TranslationSettings"), {
  loading: () => (
    <div className="flex justify-center items-center py-20">
      <Spin size="large" />
    </div>
  ),
});

const { Title, Paragraph, Link } = Typography;

const ClientPage = () => {
  const tJson = useTranslations("json");
  const t = useTranslations("common");
  const locale = useLocale();
  const isChineseLocale = locale === "zh" || locale === "zh-hant";

  const userGuideUrl = isChineseLocale ? "https://docs.newzone.top/guide/translation/json-translate/index.html" : "https://docs.newzone.top/en/guide/translation/json-translate/index.html";
  // 使用时间戳来强制重新渲染
  const [activeKey, setActiveKey] = useState("basic");

  const handleTabChange = (key: string) => {
    setActiveKey(key);
  };

  const items: TabsProps["items"] = [
    {
      key: "basic",
      label: t("basicTab"),
      children: <JSONTranslator />,
    },
    {
      key: "advanced",
      label: t("advancedTab"),
      children: <TranslationSettings />,
    },
  ];

  return (
    <TranslationProvider>
      <Title level={3}>
        <TranslationOutlined /> {tJson("clientTitle")}
      </Title>
      <Paragraph type="secondary" ellipsis={{ rows: 3, expandable: true, symbol: "more" }}>
        <Link href={userGuideUrl} target="_blank" rel="noopener noreferrer">
          <QuestionCircleOutlined /> {t("userGuide")}
        </Link>{" "}
        {tJson("clientDescription")}
        <br />
        {t("bigNotice")} {t("privacyNotice")}
      </Paragraph>
      <Tabs activeKey={activeKey} onChange={handleTabChange} items={items} type="card" className="w-full" animated={{ inkBar: true, tabPane: true }} />
    </TranslationProvider>
  );
};

export default ClientPage;
