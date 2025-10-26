"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Row, Col, Button, Typography, Tooltip, Form, Checkbox, Input, Select, message, Card, Space, Spin, Flex, Upload, Switch } from "antd";
import { CopyOutlined, DownloadOutlined, InboxOutlined, ExportOutlined, UploadOutlined } from "@ant-design/icons";
import { JSONPath } from "jsonpath-plus";
import { filterObjectPropertyMatches } from "@/app/utils/jsonPathUtils";
import KeyMappingInput from "@/app/components/KeyMappingInput";
import { getTextStats, preprocessJson, stripJsonWrapper, loadFromLocalStorage, saveToLocalStorage, downloadFile, splitBySpaces } from "@/app/utils";
import { categorizedOptions, findMethodLabel, generateCacheSuffix } from "@/app/components/translateAPI";
import { useLanguageOptions, filterLanguageOption } from "@/app/components/languages";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import useFileUpload from "@/app/hooks/useFileUpload";
import useTranslateData from "@/app/hooks/useTranslateData";
import { useTranslations } from "next-intl";
import pLimit from "p-limit";

const { TextArea } = Input;
const { Dragger } = Upload;
const { Paragraph } = Typography;

const JSONTranslator = () => {
  const tJson = useTranslations("json");
  const t = useTranslations("common");
  const { sourceOptions, targetOptions } = useLanguageOptions();
  const { copyToClipboard } = useCopyToClipboard();

  const [messageApi, contextHolder] = message.useMessage();
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
  } = useTranslateData();
  const [largeMode, setLargeMode] = useState(false);
  const [directExport, setDirectExport] = useState(false);
  const [translationResults, setTranslationResults] = useState({}); // Store results by language

  const [translateMode, setTranslateMode] = useState("allKeys"); // 翻译模式状态：'allKeys', 'nodeKeys', 'keyMapping', "selectiveKey", 'i18nMode'
  const [jsonPathForNodeTranslation, setJsonPathForNodeTranslation] = useState(""); // 局部节点路径
  const [showSimpleInput, setShowSimpleInput] = useState<boolean>(true);
  const [simpleInputKey, setSimpleInputKey] = useState<string>("");
  const [keyMappings, setKeyMappings] = useState<Array<{ inputKey: string; outputKey: string }>>([{ inputKey: "", outputKey: "" }]);

  const [jsonStartNode, setJsonStartNode] = useState(""); // 开始翻译的节点位置
  const [translationField, setTranslationField] = useState(""); // 待翻译字段

  const sourceStats = useMemo(() => getTextStats(sourceText), [sourceText]);
  const resultStats = useMemo(() => getTextStats(translatedText), [translatedText]);

  const config = getCurrentConfig();
  const concurrency = Math.max(Number(config?.limit) || 10, 1);
  const limit = pLimit(concurrency);
  const translationConfig = {
    sysPrompt: sysPrompt,
    userPrompt: userPrompt,
    useCache: useCache,
    ...config,
  };

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    const loadState = () => {
      setTranslateMode(loadFromLocalStorage("translateMode") || "allKeys");
      setJsonPathForNodeTranslation(loadFromLocalStorage("jsonPathForNodeTranslation") || "");
      setShowSimpleInput(loadFromLocalStorage("showSimpleInput") ?? true);
      setSimpleInputKey(loadFromLocalStorage("simpleInputKey") || "");
      setKeyMappings(loadFromLocalStorage("keyMappings") || [{ inputKey: "", outputKey: "" }]);
      setJsonStartNode(loadFromLocalStorage("jsonStartNode") || "");
      setTranslationField(loadFromLocalStorage("translationField") || "");

      setIsClient(true);
    };
    loadState();
  }, []);

  useEffect(() => {
    if (isClient) {
      saveToLocalStorage("translateMode", translateMode);
      saveToLocalStorage("jsonPathForNodeTranslation", jsonPathForNodeTranslation);
      saveToLocalStorage("showSimpleInput", showSimpleInput);
      saveToLocalStorage("simpleInputKey", simpleInputKey);
      saveToLocalStorage("keyMappings", keyMappings);
      saveToLocalStorage("jsonStartNode", jsonStartNode);
      saveToLocalStorage("translationField", translationField);
    }
  }, [translateMode, jsonPathForNodeTranslation, showSimpleInput, simpleInputKey, keyMappings, jsonStartNode, translationField, isClient]);

  const toggleInputType = () => {
    setShowSimpleInput(!showSimpleInput);
  };

  const handleTranslate = async () => {
    setTranslatedText("");
    setTranslationResults({});

    if (!sourceText.trim()) {
      messageApi.error(t("noSourceText"));
      return;
    }

    const isValid = await validateTranslate();
    if (!isValid) {
      return;
    }

    let originalJsonObject;
    try {
      originalJsonObject = preprocessJson(sourceText);
    } catch (error) {
      messageApi.error(tJson("invalidJson"));
      return;
    }

    setSourceText(JSON.stringify(originalJsonObject, null, 2));
    setTranslateInProgress(true);

    // Determine target languages to translate to
    const targetLanguagesToUse = multiLanguageMode ? target_langs : [targetLanguage];

    if (multiLanguageMode && targetLanguagesToUse.length === 0) {
      messageApi.error(t("noTargetLanguage"));
      setTranslateInProgress(false);
      return;
    }

    // For storing results from all languages
    const allResults = {};

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

          messageApi.success(`${t("exportedFile")}: ${downloadFileName}`);
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
              let downloadFileName;
              if (fileName.endsWith(".json")) {
                downloadFileName = fileName.replace(/\.json$/, `_${currentTargetLang}.json`);
              } else if (fileName.endsWith(".txt")) {
                downloadFileName = fileName.replace(/\.txt$/, `_${currentTargetLang}.json`);
              } else {
                downloadFileName = `${fileName}_${currentTargetLang}.json`;
              }
              await downloadFile(resultText, downloadFileName, "application/json;charset=utf-8");

              messageApi.success(`${langLabel} ${t("exportedFile")}: ${downloadFileName}`);
            }
          } catch (error) {
            console.error(`Error translating to ${currentTargetLang}:`, error);
            messageApi.error(`${error.message} ${sourceOptions.find((option) => option.value === currentTargetLang)?.label || currentTargetLang}  ${t("translationError")}`, 5);
          }
        }
      }

      // Update state with all translation results
      setTranslationResults(allResults);

      // Keep backward compatibility for single language mode
      if (!multiLanguageMode && allResults[targetLanguage]) {
        setTranslatedText(allResults[targetLanguage]);
      }
    } catch (error) {
      console.error("Translation process error:", error);
      messageApi.error(`Translation process error: ${error.message}`);
    } finally {
      setTranslateInProgress(false);
    }
  };

  const handleI18nTranslation = async (jsonObject, currentTargetLang) => {
    // 使用选择的源语言作为 i18n 源字段
    const sourceField = sourceLanguage === "auto" ? "en" : sourceLanguage;
    const cacheSuffix = generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, { model: config?.model, temperature: config?.temperature, sysPrompt, userPrompt });

    // 遍历所有可能包含 sourceField 字段的对象
    const promises = [];

    const processObject = (obj, path = "$") => {
      if (typeof obj !== "object" || obj === null) return;

      // 检查当前对象是否有 sourceField 字段
      if (obj[sourceField] && typeof obj[sourceField] === "string") {
        promises.push(
          limit(async () => {
            // 在多语言模式下，我们只翻译当前目标语言字段不存在的情况
            if (!obj[currentTargetLang]) {
              const translatedText = await retryTranslate(obj[sourceField], cacheSuffix, {
                translationMethod,
                targetLanguage: currentTargetLang,
                sourceLanguage,
                ...translationConfig,
              });
              // 添加翻译结果到同一个对象中的目标语言字段
              obj[currentTargetLang] = translatedText;
            }
          })
        );
      }

      // 递归处理子对象
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && typeof obj[key] === "object" && obj[key] !== null) {
          processObject(obj[key], `${path}.${key}`);
        }
      }
    };

    processObject(jsonObject);
    await Promise.all(promises);
  };

  // 应用翻译结果
  const applyTranslation = (jsonObject, path, translatedText) => {
    const outputNodePathArray = JSONPath.toPathArray(path);
    if (!outputNodePathArray || outputNodePathArray.length === 0) {
      throw new Error(tJson("invalidOutputKey"));
    }
    let currentNode = jsonObject;
    for (let i = 1; i < outputNodePathArray.length - 1; i++) {
      currentNode = currentNode[outputNodePathArray[i]];
    }
    currentNode[outputNodePathArray[outputNodePathArray.length - 1]] = translatedText;
  };

  const handleExportFile = async (currentTargetLang = null) => {
    const fileName = multipleFiles[0]?.name || (translateMode === "i18nMode" ? "translated_i18n.json" : "translated.json");

    if (currentTargetLang && multiLanguageMode) {
      const content = translationResults[currentTargetLang];

      // 处理文件命名
      let downloadFileName;
      if (fileName.endsWith(".json")) {
        downloadFileName = fileName.replace(/\.json$/, `_${currentTargetLang}.json`);
      } else if (fileName.endsWith(".txt")) {
        downloadFileName = fileName.replace(/\.txt$/, `_${currentTargetLang}.json`);
      } else {
        // 如果原文件名没有.json 后缀，直接添加语言代码和.json
        downloadFileName = `${fileName}_${currentTargetLang}.json`;
      }
      await downloadFile(content, downloadFileName, "application/json;charset=utf-8");
      return downloadFileName; // 返回文件名，用于显示确认消息
    } else {
      // 导出单语言结果
      await downloadFile(translatedText, fileName, "application/json;charset=utf-8");
      return fileName;
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
      messageApi.success(`${exportedFiles.length} ${t("exportedFile")}: ${exportedFiles.join(", ")}`, 10);
    } else {
      const fileName = await handleExportFile();
      messageApi.success(`${t("exportedFile")}: ${fileName}`);
    }
  };

  // 处理指定键名的映射翻译
  const handleKeyMappingTranslation = async (jsonObject, currentTargetLang) => {
    let mappings;
    if (showSimpleInput) {
      const keys = simpleInputKey
        .replace(/，/g, ",")
        .split(",")
        .filter((k) => k.trim() !== "");
      mappings = keys.map((key) => ({ inputKey: key.trim(), outputKey: key.trim() }));
    } else {
      mappings = keyMappings;
    }

    const inputNodesMap = new Map();
    const outputNodesMap = new Map();
    const validMappings = []; // 存储有效的映射

    for (const { inputKey, outputKey } of mappings) {
      if (!inputKey || !outputKey) {
        console.warn(`Skipping mapping with missing key: inputKey="${inputKey}", outputKey="${outputKey}"`);
        continue; // 跳过无效的映射，而不是抛出错误
      }

      if (!inputNodesMap.has(inputKey)) {
        const allInputNodes = JSONPath({ path: `$..${inputKey}`, json: jsonObject, resultType: "all" });
        const filteredInputNodes = filterObjectPropertyMatches(allInputNodes, inputKey);
        inputNodesMap.set(inputKey, filteredInputNodes);
      }
      if (!outputNodesMap.has(outputKey)) {
        const allOutputNodes = JSONPath({ path: `$..${outputKey}`, json: jsonObject, resultType: "all" });
        const filteredOutputNodes = filterObjectPropertyMatches(allOutputNodes, outputKey);
        outputNodesMap.set(outputKey, filteredOutputNodes);
      }

      const inputNodes = inputNodesMap.get(inputKey);
      const outputNodes = outputNodesMap.get(outputKey);

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
      validMappings.push({ inputKey, outputKey, inputNodes, outputNodes });
    }
    console.log(`validMappings:`, validMappings);

    // 如果没有有效的映射，抛出错误
    if (validMappings.length === 0) {
      console.warn("No valid key mappings found");
      throw new Error("No valid key mappings found. Please check if the specified keys exist in the JSON.");
    }

    console.log(`Processing ${validMappings.length} valid mappings out of ${mappings.length} total mappings`);

    // 处理所有有效的映射
    const allPromises = [];
    for (const { inputKey, outputKey, inputNodes, outputNodes } of validMappings) {
      const cacheSuffix = generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, { model: config?.model, temperature: config?.temperature, sysPrompt, userPrompt });
      const promises = inputNodes.map(async (node, index) => {
        return limit(async () => {
          const translatedText = await retryTranslate(node.value, cacheSuffix, {
            translationMethod,
            targetLanguage: currentTargetLang,
            sourceLanguage,
            ...translationConfig,
          });
          applyTranslation(jsonObject, outputNodes[index].path, translatedText);
        });
      });
      allPromises.push(...promises);
    }

    await Promise.all(allPromises);
  };

  // 扁平 json，单一键名，可选择起始翻译节点
  const handldSelectiveKeyTranslation = async (jsonObject, currentTargetLang) => {
    if (translationField.trim() === "") {
      throw new Error(`${t("enter")} ${tJson("fieldToTranslate")}`);
    }

    const keys = translationField
      .replace(/，/g, ",")
      .split(",")
      .filter((k) => k.trim() !== "");
    let mappings = keys.map((key) => ({ inputKey: key.trim(), outputKey: key.trim() }));

    for (const { inputKey, outputKey } of mappings) {
      if (!inputKey || !outputKey) {
        throw new Error(tJson("inputOutputKeyMissing"));
      }

      // Get all object keys
      const objectKeys = Object.keys(jsonObject);

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
          value: jsonObject[key][inputKey],
        }))
        .filter((node) => node.value !== undefined);

      if (nodesToTranslate.length === 0) {
        throw new Error(`${tJson("invalidPathKey")}: ${inputKey}`);
      }

      const cacheSuffix = generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, { model: config?.model, temperature: config?.temperature, sysPrompt, userPrompt });
      // Translate all nodes
      const promises = nodesToTranslate.map(async (node) => {
        return limit(async () => {
          const translatedText = await retryTranslate(node.value, cacheSuffix, {
            translationMethod,
            targetLanguage: currentTargetLang,
            sourceLanguage,
            ...translationConfig,
          });
          // Update the value in the original object
          jsonObject[node.key][outputKey] = translatedText;
        });
      });

      await Promise.all(promises);
    }
  };

  // 处理全局键值翻译
  const handleAllKeysTranslation = async (jsonObject, currentTargetLang) => {
    const allNodes = JSONPath({ path: "$..*", json: jsonObject, resultType: "all" });
    const cacheSuffix = generateCacheSuffix(sourceLanguage, currentTargetLang, translationMethod, { model: config?.model, temperature: config?.temperature, sysPrompt, userPrompt });
    const promises = allNodes.map(async (node) => {
      if (typeof node.value === "string") {
        return limit(async () => {
          const translatedText = await retryTranslate(node.value, cacheSuffix, {
            translationMethod,
            targetLanguage: currentTargetLang,
            sourceLanguage,
            ...translationConfig,
          });
          applyTranslation(jsonObject, node.path, translatedText);
        });
      }
    });

    await Promise.all(promises);
  };

  // 处理指定节点的键值对翻译
  const handleNodeKeysTranslation = async (jsonObject, currentTargetLang, jsonPath) => {
    const nodes = JSONPath({ path: jsonPath, json: jsonObject, resultType: "all" });

    if (nodes.length === 0) {
      throw new Error(`${tJson("invalidPathKey")}: ${jsonPath}`);
    }

    const promises = nodes.map(async (node) => {
      if (typeof node.value === "object") {
        // 调用 handleAllKeysTranslation 对节点的值进行翻译
        await handleAllKeysTranslation(node.value, currentTargetLang);
      }
    });

    await Promise.all(promises);
  };

  // Render language results for multi-language mode
  const renderMultiLanguageResults = () => {
    if (!multiLanguageMode || Object.keys(translationResults).length === 0) {
      return null;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        {target_langs.map((langCode) => {
          if (!translationResults[langCode]) return null;
          const langLabel = sourceOptions.find((option) => option.value === langCode)?.label || langCode;

          return (
            <Card
              key={langCode}
              title={`${t("translationResult")} - ${langLabel}`}
              extra={
                <Space wrap>
                  <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(translationResults[langCode], messageApi)}>
                    {t("copy")}
                  </Button>
                  <Button onClick={() => copyToClipboard(stripJsonWrapper(translationResults[langCode]), messageApi)}>{tJson("copyNode")}</Button>
                  <Button icon={<DownloadOutlined />} onClick={() => handleExportFile(langCode)}>
                    {t("exportFile")}
                  </Button>
                </Space>
              }>
              <TextArea value={translationResults[langCode]} rows={8} readOnly />
            </Card>
          );
        })}
      </Space>
    );
  };

  return (
    <Spin spinning={translateInProgress || isFileProcessing} size="large">
      {contextHolder}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title={t("sourceArea")}>
            <Form layout="horizontal" labelWrap>
              <Form.Item label={t("translationMode")} extra={translateMode === "i18nMode" ? tJson("i18nModeExtra") : null}>
                <Select
                  value={translateMode}
                  onChange={(value) => {
                    setTranslateMode(value);
                  }}
                  options={[
                    { label: tJson("allKeys"), value: "allKeys" },
                    { label: tJson("nodeKeys"), value: "nodeKeys" },
                    { label: tJson("keyMapping"), value: "keyMapping" },
                    { label: tJson("selectiveKey"), value: "selectiveKey" },
                    { label: tJson("i18nMode"), value: "i18nMode" },
                  ]}
                />
              </Form.Item>
              <Form.Item label={t("translationAPI")}>
                <Space.Compact block>
                  <Select showSearch value={translationMethod} onChange={(e) => setTranslationMethod(e)} options={categorizedOptions} />
                  {config?.apiKey !== undefined && translationMethod !== "llm" && (
                    <Tooltip title={`${t("enter")} ${findMethodLabel(translationMethod)} API Key`}>
                      <Input.Password
                        autoComplete="off"
                        placeholder={`API Key ${findMethodLabel(translationMethod)} `}
                        value={config.apiKey}
                        onChange={(e) => handleConfigChange(translationMethod, "apiKey", e.target.value)}
                      />
                    </Tooltip>
                  )}
                </Space.Compact>
              </Form.Item>
              <Space wrap>
                <Form.Item label={t("sourceLanguage")}>
                  <Select
                    value={sourceLanguage}
                    onChange={(e) => handleLanguageChange("source", e)}
                    options={sourceOptions}
                    showSearch
                    placeholder={t("selectSourceLanguage")}
                    optionFilterProp="children"
                    filterOption={(input, option) => filterLanguageOption({ input, option })}
                    style={{ minWidth: 120 }}
                  />
                </Form.Item>
                <Form.Item label={t("targetLanguage")}>
                  {!multiLanguageMode ? (
                    <Select
                      value={targetLanguage}
                      onChange={(e) => handleLanguageChange("target", e)}
                      options={targetOptions}
                      showSearch
                      placeholder={t("selectTargetLanguage")}
                      optionFilterProp="children"
                      filterOption={(input, option) => filterLanguageOption({ input, option })}
                      style={{ minWidth: 120 }}
                    />
                  ) : (
                    <Select
                      mode="multiple"
                      allowClear
                      value={target_langs}
                      onChange={(e) => setTarget_langs(e)}
                      options={targetOptions}
                      placeholder={t("selectMultiTargetLanguages")}
                      optionFilterProp="children"
                      filterOption={(input, option) => filterLanguageOption({ input, option })}
                      style={{ minWidth: 300 }}
                    />
                  )}
                </Form.Item>
              </Space>
              <Form.Item label={t("advancedSettings")}>
                <Space wrap>
                  <Tooltip title={t("largeModeTooltip")}>
                    <Checkbox checked={largeMode} onChange={(e) => setLargeMode(e.target.checked)}>
                      {t("largeMode")}
                    </Checkbox>
                  </Tooltip>
                  <Tooltip title={t("directExportTooltip")}>
                    <Checkbox checked={directExport} onChange={(e) => setDirectExport(e.target.checked)}>
                      {t("directExport")}
                    </Checkbox>
                  </Tooltip>
                  <Tooltip title={t("useCacheTooltip")}>
                    <Checkbox checked={useCache} onChange={(e) => setUseCache(e.target.checked)}>
                      {t("useCache")}
                    </Checkbox>
                  </Tooltip>
                  <Tooltip title={t("multiLanguageModeTooltip")}>
                    <Switch checked={multiLanguageMode} onChange={(checked) => setMultiLanguageMode(checked)} checkedChildren={t("multiLanguageMode")} unCheckedChildren={t("singleLanguageMode")} />
                  </Tooltip>
                </Space>
              </Form.Item>
              <Form.Item label={t("removeCharsAfterTranslation")}>
                <Tooltip title={t("removeCharsAfterTranslationTooltip")}>
                  <Input placeholder={`${t("example")}: ♪ <i> </i>`} value={removeChars} onChange={(e) => setRemoveChars(e.target.value)} style={{ minWidth: 200 }} allowClear />
                </Tooltip>
              </Form.Item>

              {translateMode === "keyMapping" && (
                <>
                  {showSimpleInput ? (
                    <Form.Item label={tJson("keyToTranslate")} extra={`${tJson("keyToTranslateExtra")}. ${tJson("multiValueHint")}`}>
                      <Input value={simpleInputKey} onChange={(e) => setSimpleInputKey(e.target.value)} placeholder={`${t("example")}: langName,object,attribute`} />
                    </Form.Item>
                  ) : (
                    <KeyMappingInput keyMappings={keyMappings} setKeyMappings={setKeyMappings} />
                  )}
                </>
              )}
              {translateMode === "selectiveKey" && (
                <>
                  <Form.Item label={tJson("startKey")} extra={tJson("StartKeyExtra")}>
                    <Input value={jsonStartNode} onChange={(e) => setJsonStartNode(e.target.value)} placeholder={`${t("example")}: fetchError`} />
                  </Form.Item>
                  <Form.Item label={tJson("fieldToTranslate")} extra={tJson("fieldToTranslateExtra")}>
                    <Input value={translationField} onChange={(e) => setTranslationField(e.target.value)} placeholder={`${t("example")}: message`} />
                  </Form.Item>
                </>
              )}

              {translateMode === "nodeKeys" && (
                <Form.Item label={tJson("nodeToTranslate")} extra={`${tJson("nodeToTranslateExtra")} ${tJson("multiValueHint")}`}>
                  <Input value={jsonPathForNodeTranslation} onChange={(e) => setJsonPathForNodeTranslation(e.target.value)} placeholder={`${t("example")}: content,data.title`} />
                </Form.Item>
              )}
            </Form>
            {!largeMode && (
              <TextArea
                placeholder={t("pasteUploadContent")}
                value={sourceStats.displayText}
                onChange={!sourceStats.isTooLong ? (e) => setSourceText(e.target.value) : undefined}
                rows={8}
                className="mt-1 mb-1"
                allowClear
                readOnly={sourceStats.isTooLong}
              />
            )}
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
              <p className="ant-upload-text">{tJson("dragAndDropText")}</p>
            </Dragger>
            {sourceText && (
              <Paragraph type="secondary" className="-mb-2">
                {t("inputStatsTitle")}: {sourceStats.charCount} {t("charLabel")}, {sourceStats.lineCount} {t("lineLabel")}
              </Paragraph>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={t("resultArea")}>
            <Flex wrap gap="small" className="mb-2">
              <Button type="primary" onClick={handleTranslate}>
                {multiLanguageMode ? `${t("translate")} | ${t("totalLanguages")}${target_langs.length || 0}` : t("translate")}
              </Button>
              <Tooltip title={t("exportSettingTooltip")}>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={async () => {
                    await exportSettings();
                  }}>
                  {t("exportSetting")}
                </Button>
              </Tooltip>
              <Tooltip title={t("importSettingTooltip")}>
                <Button
                  icon={<UploadOutlined />}
                  onClick={async () => {
                    await importSettings();
                  }}>
                  {t("importSetting")}
                </Button>
              </Tooltip>
              <Tooltip title={t("resetUploadTooltip")}>
                <Button
                  onClick={() => {
                    resetUpload();
                    messageApi.success(t("resetUploadSuccess"));
                  }}>
                  {t("resetUpload")}
                </Button>
              </Tooltip>
              {multiLanguageMode && Object.keys(translationResults).length > 0 && (
                <Button icon={<ExportOutlined />} onClick={exportAllFiles}>
                  {t("exportAllFile")}
                </Button>
              )}
              {translateMode === "keyMapping" && (
                <Button onClick={toggleInputType}>
                  <Tooltip title={tJson("keyMappingTooltip")} placement="top">
                    {showSimpleInput ? tJson("toggleKeyMapping") : tJson("toggleKeyOriginal")}
                  </Tooltip>
                </Button>
              )}
            </Flex>
            {!directExport &&
              (multiLanguageMode && translateMode !== "i18nMode"
                ? renderMultiLanguageResults()
                : translatedText && (
                    <Card
                      title={t("translationResult")}
                      extra={
                        <Space wrap>
                          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(translatedText, messageApi)}>
                            {t("copy")}
                          </Button>
                          <Button onClick={() => copyToClipboard(stripJsonWrapper(translatedText), messageApi)}>{tJson("copyNode")}</Button>
                          <Button
                            icon={<DownloadOutlined />}
                            onClick={() => {
                              const fileName = handleExportFile();
                              messageApi.success(`${t("exportedFile")}: ${fileName}`);
                            }}>
                            {t("exportFile")}
                          </Button>
                        </Space>
                      }>
                      <TextArea value={resultStats.displayText} rows={10} readOnly />
                      <Paragraph type="secondary" className="-mb-2">
                        {t("outputStatsTitle")}: {resultStats.charCount} {t("charLabel")}, {resultStats.lineCount} {t("lineLabel")}
                      </Paragraph>
                    </Card>
                  ))}
          </Card>
        </Col>
      </Row>
    </Spin>
  );
};

export default JSONTranslator;
