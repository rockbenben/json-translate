"use client";

import React, { memo } from "react";
import { Button, Flex, Input, Space, Tooltip, Typography } from "antd";
import { MinusCircleOutlined, PlusOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";

import type { KeyMapping } from "@/app/types";

interface KeyMappingInputProps {
  keyMappings: KeyMapping[];
  setKeyMappings: React.Dispatch<React.SetStateAction<KeyMapping[]>>;
}

const KeyMappingInput: React.FC<KeyMappingInputProps> = ({ keyMappings = [], setKeyMappings }) => {
  const t = useTranslations("JSON");

  const deleteMapping = (id: number) => {
    if (keyMappings.length > 1) {
      const newMappings = keyMappings.filter((mapping) => mapping.id !== id);
      setKeyMappings(newMappings);
    }
  };

  const addMapping = () => {
    setKeyMappings([...keyMappings, { inputKey: "", outputKey: "", id: Date.now() + Math.random() }]);
  };

  const handleInputChange = (index: number, field: "inputKey" | "outputKey", value: string) => {
    setKeyMappings((prev) => prev.map((mapping, i) => (i === index ? { ...mapping, [field]: value } : mapping)));
  };

  const canDelete = keyMappings.length > 1;

  return (
    <Flex vertical gap="small">
      {keyMappings.map((mapping, index) => (
        <Flex key={mapping.id} align="center" gap="small" wrap>
          <Space.Compact className="flex-1" style={{ minWidth: 140 }}>
            <Space.Addon>
              <Typography.Text type="secondary" className="!text-xs">
                {t("inputKey")}
              </Typography.Text>
            </Space.Addon>
            <Input
              value={mapping.inputKey}
              placeholder={t("inputKey")}
              onChange={(e) => handleInputChange(index, "inputKey", e.target.value)}
              aria-label={`${t("inputKey")} ${index + 1}`}
            />
          </Space.Compact>
          <ArrowRightOutlined style={{ opacity: 0.6 }} />
          <Space.Compact className="flex-1" style={{ minWidth: 140 }}>
            <Space.Addon>
              <Typography.Text type="secondary" className="!text-xs">
                {t("outputKey")}
              </Typography.Text>
            </Space.Addon>
            <Input
              value={mapping.outputKey}
              placeholder={t("outputKey")}
              onChange={(e) => handleInputChange(index, "outputKey", e.target.value)}
              aria-label={`${t("outputKey")} ${index + 1}`}
            />
          </Space.Compact>
          <Tooltip title={t("deleteMapping")}>
            <Button onClick={() => deleteMapping(mapping.id)} disabled={!canDelete} type="default" icon={<MinusCircleOutlined />} aria-label={t("deleteMapping")} />
          </Tooltip>
        </Flex>
      ))}
      <Button type="dashed" block onClick={addMapping} icon={<PlusOutlined />}>
        {t("addMapping")}
      </Button>
    </Flex>
  );
};

export default memo(KeyMappingInput);
