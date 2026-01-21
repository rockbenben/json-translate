"use client";

import React, { useMemo, useState, useRef } from "react";
import { Row, Col, Button, Typography, Tooltip, Form, Input, InputNumber, Select, App, Card, Space, Spin, Flex, Upload, Divider, Switch, Collapse, theme } from "antd";
import { InboxOutlined, ExportOutlined, ImportOutlined, SettingOutlined, GlobalOutlined, ClearOutlined, SaveOutlined, FileTextOutlined, ControlOutlined } from "@ant-design/icons";
import { JSONPath } from "jsonpath-plus";
import { useTranslations } from "next-intl";
import pLimit from "p-limit";
import type { JsonPathNode, JsonValue, KeyMapping, ValidMapping } from "@/app/types";
import { generateCacheSuffix } from "@/app/lib/translation";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import useFileUpload from "@/app/hooks/useFileUpload";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useTextStats } from "@/app/hooks/useTextStats";
import { useExportFilename } from "@/app/hooks/useExportFilename";

import { filterObjectPropertyMatches, preprocessJson, downloadFile, getErrorMessage, stripJsonWrapper, splitBySpaces } from "@/app/utils";
import KeyMappingInput from "@/app/components/KeyMappingInput";
import { useLanguageOptions } from "@/app/components/languages";
import LanguageSelector from "@/app/components/LanguageSelector";
import TranslationAPISelector from "@/app/components/TranslationAPISelector";
import { useTranslationContext } from "@/app/components/TranslationContext";
import ResultCard from "@/app/components/ResultCard";
import TranslationProgressModal from "@/app/components/TranslationProgressModal";
import AdvancedTranslationSettings from "@/app/components/AdvancedTranslationSettings";

import MultiLanguageSettingsModal from "@/app/components/MultiLanguageSettingsModal";

const { TextArea } = Input;
const { Dragger } = Upload;
const { Paragraph, Text } = Typography;

type TranslateMode = "allKeys" | "nodeKeys" | "keyMapping" | "selectiveKey" | "i18nMode";

const JSONTranslator = () => {
  const tJson = useTranslations("json");
  const t = useTranslations("common");
  const { sourceOptions } = useLanguageOptions();
  const { copyToClipboard } = useCopyToClipboard();

  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { isFileProcessing, fileList, multipleFiles, sourceText, setSourceText, handleFileUpload, handleUploadRemove, handleUploadChange, resetUpload } = useFileUpload();
  const {
    exportSettings,
    importSettings,
    translationMethod,
    setTranslationMethod,
    getCurrentConfig,
    handleConfigChange,
    sourceLanguage,
    targetLanguage,
    target_langs,
    setTarget_langs,
    useCache,
    setUseCache,
    removeChars,
    setRemoveChars,
    sysPrompt,
    userPrompt,
    multiLanguageMode,
    setMultiLanguageMode,
    retryTranslate,
    translatedText,
    setTranslatedText,
    translateInProgress,
    setTranslateInProgress,
    handleLanguageChange,
    validateTranslate,
    retryCount,
    setRetryCount,
    retryTimeout,
    setRetryTimeout,
  } = useTranslationContext();

  const [directExport, setDirectExport] = useState(false);
  const [translationResults, setTranslationResults] = useState<Record<string, string>>({}); // Store results by language

  // Progress tracking
  const translatedCountRef = useRef(0);
  const totalCountRef = useRef(0);
  const [progressPercent, setProgressPercent] = useState(0);

  const [translateMode, setTranslateMode] = useLocalStorage<TranslateMode>("translateMode", "allKeys"); // 翻译模式状态：'allKeys', 'nodeKeys', 'keyMapping', "selectiveKey", 'i18nMode'
  const [jsonPathForNodeTranslation, setJsonPathForNodeTranslation] = useLocalStorage("jsonPathForNodeTranslation", ""); // 局部节点路径
  const [showSimpleInput, setShowSimpleInput] = useLocalStorage<boolean>("showSimpleInput", true);
  const [simpleInputKey, setSimpleInputKey] = useLocalStorage<string>("simpleInputKey", "");
  const [keyMappings, setKeyMappings] = useLocalStorage<KeyMapping[]>("keyMappings", [{ inputKey: "", outputKey: "", id: 1 }]);

  const [jsonStartNode, setJsonStartNode] = useLocalStorage("jsonStartNode", ""); // 开始翻译的节点位置
  const [translationField, setTranslationField] = useLocalStorage("translationField", ""); // 待翻译字段
  const [activeCollapseKeys, setActiveCollapseKeys] = useLocalStorage<string[]>("jsonTranslatorCollapseKeys", ["jsonmode"]);
  const [multiLangModalOpen, setMultiLangModalOpen] = useState(false);
  const { customFileName, setCustomFileName, generateFileName } = useExportFilename("json");

  const sourceStats = useTextStats(sourceText);
  const resultStats = useTextStats(translatedText);

  const config = getCurrentConfig();
  const concurrency = Math.max(Number(config?.batchSize) || 10, 1);
  const limit = useMemo(() => pLimit(concurrency), [concurrency]);
  const translationConfig = {
    sysPrompt: sysPrompt,
    userPrompt: userPrompt,
    useCache: useCache,
    ...config,
  };

  // Progress tracking helper
  const updateProgress = () => {
    translatedCountRef.current++;
    if (totalCountRef.current > 0) {
      setProgressPercent((translatedCountRef.current / totalCountRef.current) * 100);
    }
  };

  const toggleInputType = () => {
    setShowSimpleInput(!showSimpleInput);
  };

  // 应用翻译结果
  const applyTranslation = (jsonObject: JsonValue, path: string, translatedText: string) => {
    const outputNodePathArray = JSONPath.toPathArray(path) as Array<string | number>;
    if (!outputNodePathArray || outputNodePathArray.length === 0) {
      throw new Error(tJson("invalidOutputKey"));
    }
    let currentNode = jsonObject as unknown as Record<string | number, unknown>;
    for (let i = 1; i < outputNodePathArray.length - 1; i++) {
      currentNode = currentNode[outputNodePathArray[i]] as Record<string | number, unknown>;
    }
    currentNode[outputNodePathArray[outputNodePathArray.length - 1]] = translatedText;
  };

  const handleI18nTranslation = async (jsonObject: JsonValue, currentTargetLang: string) => {
    // 使用选择的源语言作为 i18n 源字段
    const sourceField = sourceLanguage === "auto" ? "en" : sourceLanguage;
    const cacheSuffix = generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, {
      model: config?.model as string,
      temperature: config?.temperature as number,
      sysPrompt,
      userPrompt,
    });

    // 遍历所有可能包含 sourceField 字段的对象
    const promises: Promise<void>[] = [];

    const processObject = (obj: JsonValue) => {
      if (typeof obj !== "object" || obj === null) return;

      // 数组：遍历元素
      if (Array.isArray(obj)) {
        obj.forEach(processObject);
        return;
      }

      const record = obj as Record<string, JsonValue>;

      // 检查当前对象是否有 sourceField 字段
      const sourceValue = record[sourceField];
      if (typeof sourceValue === "string") {
        totalCountRef.current++;
        promises.push(
          limit(async () => {
            // 在多语言模式下，我们只翻译当前目标语言字段不存在的情况
            if (record[currentTargetLang] == null) {
              const translatedText = await retryTranslate(sourceValue, cacheSuffix, {
                translationMethod,
                targetLanguage: currentTargetLang,
                sourceLanguage,
                ...translationConfig,
              });
              // 添加翻译结果到同一个对象中的目标语言字段
              record[currentTargetLang] = translatedText;
            }
            updateProgress();
          })
        );
      }

      // 递归处理子对象
      Object.values(record).forEach((value) => processObject(value));
    };

    processObject(jsonObject);
    await Promise.all(promises);
  };

  // 处理全局键值翻译
  const handleAllKeysTranslation = async (jsonObject: JsonValue, currentTargetLang: string) => {
    const allNodes = JSONPath({ path: "$..*", json: jsonObject, resultType: "all" }) as JsonPathNode[];
    const stringNodes = allNodes.filter((node) => typeof node.value === "string");
    totalCountRef.current += stringNodes.length;

    const cacheSuffix = generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, {
      model: config?.model as string,
      temperature: config?.temperature as number,
      sysPrompt,
      userPrompt,
    });
    const tasks: Promise<void>[] = [];

    for (const node of stringNodes) {
      const sourceText = node.value as string;

      tasks.push(
        limit(async () => {
          const translatedText = await retryTranslate(sourceText, cacheSuffix, {
            translationMethod,
            targetLanguage: currentTargetLang,
            sourceLanguage,
            ...translationConfig,
          });
          applyTranslation(jsonObject, node.path, translatedText || "");
          updateProgress();
        })
      );
    }

    await Promise.all(tasks);
  };

  // 处理指定节点的键值对翻译
  const handleNodeKeysTranslation = async (jsonObject: JsonValue, currentTargetLang: string, jsonPath: string) => {
    const nodes = JSONPath({ path: jsonPath, json: jsonObject, resultType: "all" }) as JsonPathNode[];

    if (nodes.length === 0) {
      throw new Error(`${tJson("invalidPathKey")}: ${jsonPath}`);
    }

    const tasks: Promise<void>[] = [];
    for (const node of nodes) {
      if (typeof node.value !== "object" || node.value == null) continue;
      // 调用 handleAllKeysTranslation 对节点的值进行翻译
      tasks.push(handleAllKeysTranslation(node.value as JsonValue, currentTargetLang));
    }

    await Promise.all(tasks);
  };

  // 处理指定键名的映射翻译
  const handleKeyMappingTranslation = async (jsonObject: JsonValue, currentTargetLang: string) => {
    const mappings: KeyMapping[] = showSimpleInput
      ? simpleInputKey
          .replace(/，/g, ",")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
          .map((key, index) => ({ inputKey: key, outputKey: key, id: index + 1 }))
      : keyMappings;

    const inputNodesMap = new Map<string, JsonPathNode[]>();
    const outputNodesMap = new Map<string, JsonPathNode[]>();
    const validMappings: ValidMapping[] = []; // 存储有效的映射

    for (const { id, inputKey, outputKey } of mappings) {
      if (!inputKey || !outputKey) {
        console.warn(`Skipping mapping with missing key: inputKey="${inputKey}", outputKey="${outputKey}"`);
        continue; // 跳过无效的映射，而不是抛出错误
      }

      if (!inputNodesMap.has(inputKey)) {
        const allInputNodes = JSONPath({ path: `$..${inputKey}`, json: jsonObject, resultType: "all" }) as JsonPathNode[];
        const filteredInputNodes = filterObjectPropertyMatches(allInputNodes, inputKey);
        inputNodesMap.set(inputKey, filteredInputNodes);
      }
      if (!outputNodesMap.has(outputKey)) {
        const allOutputNodes = JSONPath({ path: `$..${outputKey}`, json: jsonObject, resultType: "all" }) as JsonPathNode[];
        const filteredOutputNodes = filterObjectPropertyMatches(allOutputNodes, outputKey);
        outputNodesMap.set(outputKey, filteredOutputNodes);
      }

      const inputNodes = inputNodesMap.get(inputKey)!;
      const outputNodes = outputNodesMap.get(outputKey)!;

      if (inputNodes.length === 0) {
        console.warn(`Input key not found, skipping: ${inputKey}`);
        continue; // 跳过不存在的输入键，而不是抛出错误
      }
      if (outputNodes.length === 0) {
        console.warn(`Output key not found, skipping: ${outputKey}`);
        continue; // 跳过不存在的输出键，而不是抛出错误
      }
      if (inputNodes.length !== outputNodes.length) {
        console.warn(`Node count mismatch for ${inputKey}:${outputKey}, skipping`);
        continue; // 跳过节点数量不匹配的映射，而不是抛出错误
      }

      // 如果所有检查都通过，添加到有效映射列表
      validMappings.push({ id, inputKey, outputKey, inputNodes, outputNodes });
    }
    console.log(`validMappings:`, validMappings);

    // 如果没有有效的映射，抛出错误
    if (validMappings.length === 0) {
      console.warn("No valid key mappings found");
      throw new Error("No valid key mappings found. Please check if the specified keys exist in the JSON.");
    }

    console.log(`Processing ${validMappings.length} valid mappings out of ${mappings.length} total mappings`);

    // 处理所有有效的映射
    const allPromises: Promise<void>[] = [];
    for (const { inputNodes, outputNodes } of validMappings) {
      totalCountRef.current += inputNodes.length;
      const cacheSuffix = generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, {
        model: config?.model as string,
        temperature: config?.temperature as number,
        sysPrompt,
        userPrompt,
      });
      const promises = inputNodes.map((node, index: number) => {
        return limit(async () => {
          const sourceValue = typeof node.value === "string" ? node.value : JSON.stringify(node.value);
          const translatedText = await retryTranslate(sourceValue, cacheSuffix, {
            translationMethod,
            targetLanguage: currentTargetLang,
            sourceLanguage,
            ...translationConfig,
          });
          applyTranslation(jsonObject, outputNodes[index].path, translatedText || "");
          updateProgress();
        });
      });
      allPromises.push(...promises);
    }

    await Promise.all(allPromises);
  };

  // 扁平 json，单一键名，可选择起始翻译节点
  const handldSelectiveKeyTranslation = async (jsonObject: JsonValue, currentTargetLang: string) => {
    if (translationField.trim() === "") {
      throw new Error(`${t("enter")} ${tJson("fieldToTranslate")}`);
    }

    if (typeof jsonObject !== "object" || jsonObject === null || Array.isArray(jsonObject)) {
      throw new Error(tJson("invalidJson"));
    }

    const rootRecord = jsonObject as Record<string, Record<string, JsonValue>>;

    const keys = translationField
      .replace(/，/g, ",")
      .split(",")
      .filter((k) => k.trim() !== "");
    const mappings = keys.map((key) => ({ inputKey: key.trim(), outputKey: key.trim() }));

    for (const { inputKey, outputKey } of mappings) {
      if (!inputKey || !outputKey) {
        throw new Error(tJson("inputOutputKeyMissing"));
      }

      // Get all object keys
      const objectKeys = Object.keys(rootRecord);

      // Find start index if jsonStartNode is provided
      const startIndex = jsonStartNode ? objectKeys.indexOf(jsonStartNode) : 0;
      if (jsonStartNode && startIndex === -1) {
        throw new Error(`${tJson("invalidStartKey")}: ${jsonStartNode}`);
      }

      // Get relevant keys (all keys if no start node, or keys from start index onwards)
      const relevantKeys = startIndex === -1 ? objectKeys : objectKeys.slice(startIndex);

      // Find all nodes that need translation
      const nodesToTranslate = relevantKeys
        .map((key) => ({
          key: key,
          value: rootRecord[key]?.[inputKey],
        }))
        .filter((node) => node.value !== undefined);

      if (nodesToTranslate.length === 0) {
        throw new Error(`${tJson("invalidPathKey")}: ${inputKey}`);
      }

      totalCountRef.current += nodesToTranslate.length;
      const cacheSuffix = generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, {
        model: config?.model as string,
        temperature: config?.temperature as number,
        sysPrompt,
        userPrompt,
      });
      // Translate all nodes
      const promises = nodesToTranslate.map(async (node) => {
        return limit(async () => {
          const translatedText = await retryTranslate(String(node.value), cacheSuffix, {
            translationMethod,
            targetLanguage: currentTargetLang,
            sourceLanguage,
            ...translationConfig,
          });
          // Update the value in the original object
          rootRecord[node.key][outputKey] = translatedText;
          updateProgress();
        });
      });

      await Promise.all(promises);
    }
  };

  const handleExportFile = async (currentTargetLang: string | null = null) => {
    const fileName = multipleFiles[0]?.name || (translateMode === "i18nMode" ? "translated_i18n.json" : "translated.json");

    if (currentTargetLang && multiLanguageMode) {
      const content = translationResults[currentTargetLang];
      const downloadFileName = generateFileName(fileName, currentTargetLang, "json");
      await downloadFile(content, downloadFileName, "application/json;charset=utf-8");
      return downloadFileName;
    } else {
      // Export single language result - use generateFileName with targetLanguage
      const downloadFileName = generateFileName(fileName, targetLanguage, "json");
      await downloadFile(translatedText, downloadFileName, "application/json;charset=utf-8");
      return downloadFileName;
    }
  };

  const handleTranslate = async () => {
    setTranslatedText("");
    setTranslationResults({});

    // Reset progress
    translatedCountRef.current = 0;
    totalCountRef.current = 0;
    setProgressPercent(0);

    if (!sourceText.trim()) {
      message.error(t("noSourceText"));
      return;
    }

    const isValid = await validateTranslate();
    if (!isValid) {
      return;
    }

    let originalJsonObject: JsonValue;
    try {
      originalJsonObject = preprocessJson(sourceText);
    } catch {
      message.error(tJson("invalidJson"));
      return;
    }

    setSourceText(JSON.stringify(originalJsonObject, null, 2));
    setTranslateInProgress(true);

    // Determine target languages to translate to
    const targetLanguagesToUse = multiLanguageMode ? target_langs : [targetLanguage];

    if (multiLanguageMode && targetLanguagesToUse.length === 0) {
      message.error(t("noTargetLanguage"));
      setTranslateInProgress(false);
      return;
    }

    // For storing results from all languages
    const allResults: Record<string, string> = {};

    // Sequential processing of each target language
    try {
      if (translateMode === "i18nMode" && multiLanguageMode) {
        // For i18nMode + multiLanguageMode, process all languages in the same JSON object
        const jsonObject = JSON.parse(JSON.stringify(originalJsonObject));

        // Process each target language sequentially but add to the same object
        for (const currentTargetLang of targetLanguagesToUse) {
          await handleI18nTranslation(jsonObject, currentTargetLang);
        }

        let resultText = JSON.stringify(jsonObject, null, 2);

        // Remove specified characters from the final JSON text (after all formatting is done)
        if (removeChars.trim()) {
          const charsToRemove = splitBySpaces(removeChars);
          charsToRemove.forEach((char) => {
            resultText = resultText.replaceAll(char, "");
          });
        }

        // Store the combined result for all languages
        setTranslatedText(resultText);
        setTranslationResults({ combined: resultText });

        // Handle direct export if enabled
        if (directExport) {
          const fileName = multipleFiles[0]?.name || `translated_i18n.json`;
          let downloadFileName;
          if (fileName.endsWith(".txt")) {
            downloadFileName = fileName.replace(/\.txt$/, `.json`);
          } else {
            downloadFileName = `${fileName}`;
          }
          await downloadFile(resultText, downloadFileName, "application/json;charset=utf-8");

          message.success(`${t("exportedFile")}: ${downloadFileName}`);
        }
      } else {
        for (const currentTargetLang of targetLanguagesToUse) {
          try {
            const jsonObject = JSON.parse(JSON.stringify(originalJsonObject));

            if (translateMode === "allKeys") {
              await handleAllKeysTranslation(jsonObject, currentTargetLang);
            } else if (translateMode === "nodeKeys") {
              await handleNodeKeysTranslation(jsonObject, currentTargetLang, jsonPathForNodeTranslation);
            } else if (translateMode === "keyMapping") {
              await handleKeyMappingTranslation(jsonObject, currentTargetLang);
            } else if (translateMode === "selectiveKey") {
              await handldSelectiveKeyTranslation(jsonObject, currentTargetLang);
            } else if (translateMode === "i18nMode") {
              await handleI18nTranslation(jsonObject, currentTargetLang);
            }

            let resultText = JSON.stringify(jsonObject, null, 2);

            // Remove specified characters from the final JSON text (after all formatting is done)
            if (removeChars.trim()) {
              const charsToRemove = splitBySpaces(removeChars);
              charsToRemove.forEach((char) => {
                resultText = resultText.replaceAll(char, "");
              });
            }

            // Store result for this language
            allResults[currentTargetLang] = resultText;

            // If direct export is enabled, download the file immediately
            if (directExport) {
              const langLabel = sourceOptions.find((option) => option.value === currentTargetLang)?.label || currentTargetLang;
              const fileName = multipleFiles[0]?.name || `translated.json`;
              const downloadFileName = generateFileName(fileName, currentTargetLang, "json");
              await downloadFile(resultText, downloadFileName, "application/json;charset=utf-8");

              message.success(`${langLabel} ${t("exportedFile")}: ${downloadFileName}`);
            }
          } catch (error: unknown) {
            console.error(`Error translating to ${currentTargetLang}:`, error);
            const errMsg = getErrorMessage(error);
            message.error(`${errMsg} ${sourceOptions.find((option) => option.value === currentTargetLang)?.label || currentTargetLang}  ${t("translationError")}`, 5);
          }
        }
      }

      // Update state with all translation results
      setTranslationResults(allResults);

      // Keep backward compatibility for single language mode
      if (!multiLanguageMode && allResults[targetLanguage]) {
        setTranslatedText(allResults[targetLanguage]);
      }

      // Show success message
      if (!directExport) {
        message.success(t("textProcessed"));
      }
    } catch (error: unknown) {
      console.error("Translation process error:", error);
      const errMsg = getErrorMessage(error);
      message.error(`${errMsg} ${t("translationError")}`, 5);
    } finally {
      setTranslateInProgress(false);
      setProgressPercent(100); // Ensure progress shows complete
    }
  };

  const exportAllFiles = async () => {
    if (multiLanguageMode && Object.keys(translationResults).length > 0) {
      const exportedFiles = [];
      const languageCodes = Object.keys(translationResults);
      // 使用 for...of 循环来正确处理异步操作
      for (const langCode of languageCodes) {
        try {
          // 等待 Promise 解析为实际的文件名
          const fileName = await handleExportFile(langCode);
          exportedFiles.push(fileName);
          // 添加短暂延迟，确保浏览器能处理完一个下载后再开始下一个
          // await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`${langCode} Export Failure:`, error);
        }
      }
      message.success(`${exportedFiles.length} ${t("exportedFile")}: ${exportedFiles.join(", ")}`, 10);
    } else {
      const fileName = await handleExportFile();
      message.success(`${t("exportedFile")}: ${fileName}`);
    }
  };

  // Render language results for multi-language mode
  const renderMultiLanguageResults = () => {
    if (!multiLanguageMode || Object.keys(translationResults).length === 0) {
      return null;
    }

    return (
      <Space orientation="vertical" style={{ width: "100%" }}>
        {target_langs.map((langCode) => {
          if (!translationResults[langCode]) return null;
          const langLabel = sourceOptions.find((option) => option.value === langCode)?.label || langCode;

          return (
            <ResultCard
              key={langCode}
              title={`${t("translationResult")} - ${langLabel}`}
              content={translationResults[langCode]}
              showStats={false}
              rows={8}
              onCopy={() => copyToClipboard(translationResults[langCode])}
              onCopyNode={() => copyToClipboard(stripJsonWrapper(translationResults[langCode]))}
              onExport={() => handleExportFile(langCode)}
            />
          );
        })}
      </Space>
    );
  };

  return (
    <Spin spinning={isFileProcessing} tip="Please wait..." size="large">
      <Row gutter={[24, 24]}>
        {/* Left Column: Source Area */}
        <Col xs={24} lg={14} xl={15}>
          <Card
            title={
              <Space>
                <InboxOutlined /> {t("sourceArea")}
              </Space>
            }
            extra={
              <Tooltip title={t("resetUploadTooltip")}>
                <Button
                  type="text"
                  danger
                  disabled={translateInProgress}
                  onClick={() => {
                    resetUpload();
                    message.success(t("resetUploadSuccess"));
                  }}
                  icon={<ClearOutlined />}
                  aria-label={t("resetUpload")}>
                  {t("resetUpload")}
                </Button>
              </Tooltip>
            }
            className="h-full shadow-sm">
            <Dragger
              customRequest={({ file }) => handleFileUpload(file as File)}
              accept=".txt,.json"
              showUploadList
              beforeUpload={resetUpload}
              onRemove={handleUploadRemove}
              onChange={handleUploadChange}
              fileList={fileList}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{t("dragAndDropText")}</p>
              <p className="ant-upload-hint">{t("supportedFormats")} .txt, .json</p>
            </Dragger>

            <>
              <TextArea
                placeholder={t("pasteUploadContent")}
                value={sourceStats.isEditable ? sourceText : sourceStats.displayText}
                onChange={sourceStats.isEditable ? (e) => setSourceText(e.target.value) : undefined}
                rows={8}
                className="mt-1"
                allowClear
                readOnly={!sourceStats.isEditable}
                aria-label={t("sourceArea")}
              />
              {sourceText && (
                <Flex justify="end" className="mt-2">
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {sourceStats.charCount} {t("charLabel")} / {sourceStats.lineCount} {t("lineLabel")}
                  </Typography.Text>
                </Flex>
              )}
            </>

            <Divider />

            <Flex gap="small" wrap className="mt-auto pt-4">
              <Button type="primary" size="large" onClick={handleTranslate} loading={translateInProgress} icon={<GlobalOutlined spin={translateInProgress} />} className="flex-1 shadow-md">
                {multiLanguageMode ? `${t("translate")} | ${t("totalLanguages")}${target_langs.length || 0}` : t("translate")}
              </Button>

              {multiLanguageMode && Object.keys(translationResults).length > 0 && (
                <Button icon={<ExportOutlined />} onClick={exportAllFiles} size="large">
                  {t("exportAllFile")}
                </Button>
              )}
            </Flex>
          </Card>
        </Col>

        {/* Right Column: Settings and Configuration */}
        <Col xs={24} lg={10} xl={9}>
          <Card
            title={
              <Space>
                <SettingOutlined /> {t("configuration")}
              </Space>
            }
            className="shadow-sm"
            extra={
              <Space>
                <Tooltip title={t("exportSettingTooltip")}>
                  <Button
                    type="text"
                    icon={<SaveOutlined />}
                    size="small"
                    disabled={translateInProgress}
                    onClick={async () => {
                      await exportSettings();
                    }}
                    aria-label={t("exportSettingTooltip")}
                  />
                </Tooltip>
                <Tooltip title={t("importSettingTooltip")}>
                  <Button
                    type="text"
                    icon={<ImportOutlined />}
                    size="small"
                    disabled={translateInProgress}
                    onClick={async () => {
                      await importSettings();
                    }}
                    aria-label={t("importSettingTooltip")}
                  />
                </Tooltip>
                <Tooltip title={t("batchEditMultiLangTooltip")}>
                  <Button type="text" icon={<GlobalOutlined />} size="small" disabled={translateInProgress} onClick={() => setMultiLangModalOpen(true)} aria-label={t("batchEditMultiLangTooltip")} />
                </Tooltip>
              </Space>
            }>
            <Form layout="vertical" className="w-full">
              {/* Language Selection */}
              <LanguageSelector
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                target_langs={target_langs}
                multiLanguageMode={multiLanguageMode}
                handleLanguageChange={handleLanguageChange}
                setTarget_langs={setTarget_langs}
                setMultiLanguageMode={setMultiLanguageMode}
              />

              {/* API Settings */}
              <TranslationAPISelector translationMethod={translationMethod} setTranslationMethod={setTranslationMethod} config={config} handleConfigChange={handleConfigChange} />
            </Form>

            <Divider style={{ margin: "12px 0" }} />

            <Collapse
              ghost
              activeKey={activeCollapseKeys}
              onChange={(keys) => setActiveCollapseKeys(typeof keys === "string" ? [keys] : keys)}
              expandIconPlacement="end"
              items={[
                {
                  key: "jsonmode",
                  label: (
                    <Space>
                      <FileTextOutlined />
                      <Text strong>{t("translationMode")}</Text>
                    </Space>
                  ),
                  children: (
                    <Form layout="vertical" className="w-full">
                      <Form.Item style={{ marginBottom: 6 }}>
                        <Select
                          value={translateMode}
                          onChange={setTranslateMode}
                          options={[
                            { label: tJson("allKeys"), value: "allKeys" },
                            { label: tJson("nodeKeys"), value: "nodeKeys" },
                            { label: tJson("keyMapping"), value: "keyMapping" },
                            { label: tJson("selectiveKey"), value: "selectiveKey" },
                            { label: tJson("i18nMode"), value: "i18nMode" },
                          ]}
                          aria-label={t("translationMode")}
                        />
                      </Form.Item>

                      {/* Mode-specific configurations */}
                      {translateMode === "keyMapping" && (
                        <div style={{ padding: "12px", backgroundColor: token.colorFillQuaternary, borderRadius: token.borderRadiusLG }}>
                          <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                            <Text style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{tJson("keyMapping")}</Text>
                            <Tooltip title={tJson("keyMappingTooltip")} placement="top">
                              <Switch
                                size="small"
                                checked={showSimpleInput}
                                onChange={setShowSimpleInput}
                                checkedChildren={tJson("toggleKeyMapping")}
                                unCheckedChildren={tJson("toggleKeyOriginal")}
                                aria-label={tJson("keyMapping")}
                              />
                            </Tooltip>
                          </Flex>

                          {showSimpleInput ? (
                            <Form.Item label={tJson("keyToTranslate")} style={{ marginBottom: 0 }}>
                              <Input
                                value={simpleInputKey}
                                onChange={(e) => setSimpleInputKey(e.target.value)}
                                placeholder={`${t("example")}: langName,object,attribute`}
                                aria-label={tJson("keyToTranslate")}
                              />
                            </Form.Item>
                          ) : (
                            <KeyMappingInput keyMappings={keyMappings} setKeyMappings={setKeyMappings} />
                          )}
                        </div>
                      )}

                      {translateMode === "selectiveKey" && (
                        <div style={{ padding: "12px", backgroundColor: token.colorFillQuaternary, borderRadius: token.borderRadiusLG }}>
                          <Form.Item label={tJson("startKey")} extra={tJson("StartKeyExtra")} style={{ marginBottom: 6 }}>
                            <Input value={jsonStartNode} onChange={(e) => setJsonStartNode(e.target.value)} placeholder={`${t("example")}: fetchError`} aria-label={tJson("startKey")} />
                          </Form.Item>
                          <Form.Item label={tJson("fieldToTranslate")} extra={tJson("fieldToTranslateExtra")}>
                            <Input value={translationField} onChange={(e) => setTranslationField(e.target.value)} placeholder={`${t("example")}: message`} aria-label={tJson("fieldToTranslate")} />
                          </Form.Item>
                        </div>
                      )}

                      {translateMode === "nodeKeys" && (
                        <div style={{ padding: "12px", backgroundColor: token.colorFillQuaternary, borderRadius: token.borderRadiusLG }}>
                          <Form.Item label={tJson("nodeToTranslate")} extra={`${tJson("nodeToTranslateExtra")} ${tJson("multiValueHint")}`}>
                            <Input
                              value={jsonPathForNodeTranslation}
                              onChange={(e) => setJsonPathForNodeTranslation(e.target.value)}
                              placeholder={`${t("example")}: content,data.title`}
                              aria-label={tJson("nodeToTranslate")}
                            />
                          </Form.Item>
                        </div>
                      )}

                      {translateMode === "i18nMode" && (
                        <div style={{ padding: "12px", backgroundColor: token.colorFillQuaternary, borderRadius: token.borderRadiusLG }}>
                          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            {tJson("i18nModeExtra")}
                          </Text>
                        </div>
                      )}
                    </Form>
                  ),
                },
                {
                  key: "advanced",
                  label: (
                    <Space>
                      <ControlOutlined />
                      <Text strong>{t("advancedSettings")}</Text>
                    </Space>
                  ),
                  children: (
                    <AdvancedTranslationSettings
                      customFileName={customFileName}
                      setCustomFileName={setCustomFileName}
                      removeChars={removeChars}
                      setRemoveChars={setRemoveChars}
                      retryCount={retryCount}
                      setRetryCount={setRetryCount}
                      retryTimeout={retryTimeout}
                      setRetryTimeout={setRetryTimeout}
                      useCache={useCache}
                      setUseCache={setUseCache}>
                      {/* Component-specific settings */}
                      <Flex justify="space-between" align="center">
                        <Tooltip title={t("directExportTooltip")}>
                          <span>{t("directExport")}</span>
                        </Tooltip>
                        <Switch size="small" checked={directExport} onChange={setDirectExport} aria-label={t("directExport")} />
                      </Flex>
                    </AdvancedTranslationSettings>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* Results Section */}
      {!directExport && (translatedText || (multiLanguageMode && Object.keys(translationResults).length > 0)) && (
        <div className="mt-6">
          {multiLanguageMode && translateMode !== "i18nMode"
            ? renderMultiLanguageResults()
            : translatedText && (
                <ResultCard
                  content={resultStats.displayText}
                  charCount={resultStats.charCount}
                  lineCount={resultStats.lineCount}
                  onCopy={() => copyToClipboard(translatedText)}
                  onCopyNode={() => copyToClipboard(stripJsonWrapper(translatedText))}
                  onExport={() => {
                    const fileName = handleExportFile();
                    message.success(`${t("exportedFile")}: ${fileName}`);
                  }}
                />
              )}
        </div>
      )}

      <TranslationProgressModal open={translateInProgress} percent={progressPercent} multiLanguageMode={multiLanguageMode} targetLanguageCount={target_langs.length} />

      <MultiLanguageSettingsModal
        open={multiLangModalOpen}
        onClose={() => setMultiLangModalOpen(false)}
        target_langs={target_langs}
        setTarget_langs={setTarget_langs}
        setMultiLanguageMode={setMultiLanguageMode}
      />
    </Spin>
  );
};

export default JSONTranslator;
