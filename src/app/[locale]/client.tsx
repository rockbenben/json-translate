"use client";

import React from "react";
import { TranslationOutlined } from "@ant-design/icons";
import JSONTranslator from "./JSONTranslator";
import { useTranslations, useLocale } from "next-intl";
import { TranslationProvider } from "@/app/components/TranslationContext";
import { getDocUrl } from "@/app/utils";
import ToolPage from "@/app/components/styled/ToolPage";
import ApiSettingsDrawer from "@/app/components/ApiSettingsDrawer";

const ClientPage = () => {
  const tJson = useTranslations("JSON");
  const locale = useLocale();
  const userGuideUrl = getDocUrl("guide/translation/json-translate/index.html", locale);

  return (
    <TranslationProvider>
      <ToolPage icon={<TranslationOutlined />} toolKey="jsonTranslate" description={tJson("clientDescription")} guideUrl={userGuideUrl}>
        <JSONTranslator />
      </ToolPage>
      <ApiSettingsDrawer />
    </TranslationProvider>
  );
};

export default ClientPage;
