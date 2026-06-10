"use client";

import React, { useMemo, useState, useRef } from "react";
import { Row, Col, Button, Typography, Tooltip, Form, Input, Select, App, Card, Space, Spin, Flex, Upload, Divider, Switch, Collapse, theme } from "antd";
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

import { filterObjectPropertyMatches, preprocessJson, downloadFile, getErrorMessage, isAbortError, isCascadedAbort, isNetworkError, stripJsonWrapper, splitBySpaces, getFileTypePresetConfig } from "@/app/utils";
import { isAuthError } from "@/app/hooks/translation";
import KeyMappingInput from "@/app/components/KeyMappingInput";
import { useLanguageOptions } from "@/app/components/languages";
import LanguageSelector from "@/app/components/LanguageSelector";
import ApiStatusBlock from "@/app/components/ApiStatusBlock";
import { useTranslationContext } from "@/app/components/TranslationContext";
import ResultCard from "@/app/components/ResultCard";
import TranslationProgressModal from "@/app/components/TranslationProgressModal";
import AdvancedTranslationSettings from "@/app/components/AdvancedTranslationSettings";
import TranslateFailurePanel from "@/app/components/TranslateFailurePanel";

import MultiLanguageSettingsModal from "@/app/components/MultiLanguageSettingsModal";
import SourceArea from "@/app/components/SourceArea";

const { Dragger } = Upload;
const { Text } = Typography;

const uploadFileTypes = getFileTypePresetConfig("jsonText");

type TranslateMode = "allKeys" | "nodeKeys" | "keyMapping" | "selectiveKey" | "i18nMode";

const JSONTranslator = () => {
  const tJson = useTranslations("JSON");
  const t = useTranslations("common");
  const { sourceOptions } = useLanguageOptions();
  const { copyToClipboard } = useCopyToClipboard();

  const { message } = App.useApp();
  const { token } = theme.useToken();
  const cardStyle: React.CSSProperties = { boxShadow: token.boxShadowTertiary };
  const { isFileProcessing, fileList, multipleFiles, sourceText, setSourceText, handleFileUpload, handleUploadRemove, handleUploadChange, resetUpload } = useFileUpload();
  const {
    exportSettings,
    importSettings,
    translationMethod,
    getSelectedConfig,
    sourceLanguage,
    targetLanguage,
    targetLanguages,
    setTargetLanguages,
    useCache,
    setUseCache,
    removeChars,
    setRemoveChars,
    systemPrompt,
    userPrompt,
    multiLanguageMode,
    setMultiLanguageMode,
    translateSingleWithGlossary,
    translatedText,
    setTranslatedText,
    failedCount,
    failedLines,
    failedLangs,
    setFailedLangs,
    failedReason,
    clearFailures,
    markRunHadFailures,
    recordLineFailure,
    hadRunFailures,
    isTranslating,
    setIsTranslating,
    handleLanguageChange,
    handleSwapLanguages,
    validate,
    retryCount,
    setRetryCount,
    requestTimeoutSec,
    setRequestTimeoutSec,
    getGlossaryTerms,
  } = useTranslationContext();

  const [directExport, setDirectExport] = useState(false);
  const [translationResults, setTranslationResults] = useState<Record<string, string>>({}); // Store results by language

  // Progress tracking
  const translatedCountRef = useRef(0);
  const totalCountRef = useRef(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const [translateMode, setTranslateMode] = useLocalStorage<TranslateMode>("json-translate-mode", "allKeys"); // 翻译模式状态：'allKeys', 'nodeKeys', 'keyMapping', "selectiveKey", 'i18nMode'
  const [nodeKeysPath, setNodeKeysPath] = useLocalStorage("json-translate-nodeKeysPath", ""); // 局部节点路径（nodeKeys mode）
  const [showSimpleInput, setShowSimpleInput] = useLocalStorage<boolean>("json-translate-showSimpleInput", true);
  const [simpleInputKey, setSimpleInputKey] = useLocalStorage<string>("json-translate-simpleInputKey", "");
  const [keyMappings, setKeyMappings] = useLocalStorage<KeyMapping[]>("json-translate-keyMappings", [{ inputKey: "", outputKey: "", id: 1 }]);

  const [selectiveStartKey, setSelectiveStartKey] = useLocalStorage("json-translate-selectiveStartKey", ""); // 开始翻译的键（selectiveKey mode）
  const [selectiveField, setSelectiveField] = useLocalStorage("json-translate-selectiveField", ""); // 待翻译字段（selectiveKey mode）
  const [collapseKeys, setCollapseKeys] = useLocalStorage<string[]>("json-translate-collapseKeys", ["jsonmode"]);
  const [multiLangModalOpen, setMultiLangModalOpen] = useState(false);
  const { customFileName, setCustomFileName, generateFileName } = useExportFilename("json-translate");

  const sourceStats = useTextStats(sourceText);
  const resultStats = useTextStats(translatedText);

  const config = getSelectedConfig();
  const concurrency = Math.max(Number(config?.batchSize) || 10, 1);
  const limit = useMemo(() => pLimit(concurrency), [concurrency]);
  const runtimeConfig = {
    systemPrompt: systemPrompt,
    userPrompt: userPrompt,
    useCache: useCache,
    ...config,
  };

  // Progress tracking helper
  const updateProgress = () => {
    translatedCountRef.current++;
    if (totalCountRef.current > 0) {
      setProgressPercent((translatedCountRef.current / totalCountRef.current) * 100);
      setProgressInfo({ current: translatedCountRef.current, total: totalCountRef.current });
    }
  };

  const handleI18nTranslation = async (jsonObject: JsonValue, currentTargetLang: string) => {
    // 使用选择的源语言作为 i18n 源字段
    const sourceField = sourceLanguage === "auto" ? "en" : sourceLanguage;
    const cacheSuffix = generateCacheSuffix({
      sourceLanguage,
      targetLanguage: currentTargetLang,
      translationMethod,
      config,
      systemPrompt,
      userPrompt,
      glossaryTerms: getGlossaryTerms(currentTargetLang),
    });

    // 遍历所有可能包含 sourceField 字段的对象
    const promises: Promise<void>[] = [];
    let aborted = false;

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
            if (aborted) return;
            // 在多语言模式下，我们只翻译当前目标语言字段不存在的情况
            if (record[currentTargetLang] == null) {
              try {
                // 添加翻译结果到同一个对象中的目标语言字段(术语注入 + 漏翻
                // 兜底 + 错译重试都在 translateSingleWithGlossary 内)
                record[currentTargetLang] = await translateSingleWithGlossary(sourceValue, cacheSuffix, {
                  translationMethod,
                  targetLanguage: currentTargetLang,
                  sourceLanguage,
                  ...runtimeConfig,
                });
              } catch (error) {
                // auth/级联中止 → 快停;其余 → 行级软失败计入失败面板并继续,
                // 单节点瞬时失败不再丢弃整个语言已完成的翻译。
                if (isAuthError(error) || isCascadedAbort(error)) {
                  aborted = true;
                  throw error;
                }
                recordLineFailure(sourceValue, getErrorMessage(error));
              }
            }
            updateProgress();
          }),
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

    const cacheSuffix = generateCacheSuffix({
      sourceLanguage,
      targetLanguage: currentTargetLang,
      translationMethod,
      config,
      systemPrompt,
      userPrompt,
      glossaryTerms: getGlossaryTerms(currentTargetLang),
    });
    const tasks: Promise<void>[] = [];
    let aborted = false;

    for (const node of stringNodes) {
      const sourceText = node.value as string;

      tasks.push(
        limit(async () => {
          if (aborted) return;
          try {
            node.parent[node.parentProperty] = await translateSingleWithGlossary(sourceText, cacheSuffix, {
              translationMethod,
              targetLanguage: currentTargetLang,
              sourceLanguage,
              ...runtimeConfig,
            });
          } catch (error) {
            if (isAuthError(error) || isCascadedAbort(error)) {
              aborted = true;
              throw error;
            }
            recordLineFailure(sourceText, getErrorMessage(error));
          }
          updateProgress();
        }),
      );
    }

    await Promise.all(tasks);
  };

  // 处理指定节点的键值对翻译
  const handleNodeKeysTranslation = async (jsonObject: JsonValue, currentTargetLang: string, jsonPath: string) => {
    // UI 的 multiValueHint/placeholder 承诺逗号分隔多路径("content,data.title")
    // —— 原样整串喂给 JSONPath 会被解析成畸形 union:只命中最后一个路径,
    // 其余静默丢弃且照常报成功。只按【顶层】逗号拆分:方括号内的逗号是
    // JSONPath 合法的 bracket union($.book[0,1].title),拆了就只剩半截。
    const splitTopLevelCommas = (s: string): string[] => {
      const parts: string[] = [];
      let cur = "";
      let depth = 0;
      for (const ch of s) {
        if (ch === "[") depth++;
        else if (ch === "]") depth = Math.max(0, depth - 1);
        if ((ch === "," || ch === "，") && depth === 0) {
          parts.push(cur);
          cur = "";
          continue;
        }
        cur += ch;
      }
      parts.push(cur);
      return parts;
    };
    const paths = splitTopLevelCommas(jsonPath)
      .map((p) => p.trim())
      .filter(Boolean);
    const nodes = paths.flatMap((p) => JSONPath({ path: p, json: jsonObject, resultType: "all" }) as JsonPathNode[]);

    if (nodes.length === 0) {
      throw new Error(`${tJson("invalidPathKey")}: ${jsonPath}`);
    }

    const tasks: Promise<void>[] = [];
    for (const node of nodes) {
      // 路径解析到字符串叶节点(工具自带示例 $.store.book[*].title 即是)——
      // 装箱借道 handleAllKeysTranslation 翻译后回写。旧逻辑静默跳过非对象
      // 节点,整次运行零翻译却报成功。
      if (typeof node.value === "string") {
        const box: Record<string, JsonValue> = { v: node.value };
        tasks.push(
          handleAllKeysTranslation(box, currentTargetLang).then(() => {
            (node.parent as Record<string, JsonValue>)[node.parentProperty] = box.v;
          }),
        );
        continue;
      }
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

      // 结构化配对:input/output 节点必须是【同一父对象】的兄弟键。两个独立
      // $..key 查询的遍历顺序互不对应,按数组下标配对在计数恰好相等时会把
      // 译文写进错误的对象(静默错位)。父路径 = JSONPath path 去掉末段。
      const parentPathOf = (p: string) => p.replace(/\[[^[\]]*\]$/, "");
      const outputByParent = new Map(outputNodes.map((n) => [parentPathOf(n.path), n]));
      const pairedInputs: JsonPathNode[] = [];
      const pairedOutputs: JsonPathNode[] = [];
      for (const inNode of inputNodes) {
        const outNode = outputByParent.get(parentPathOf(inNode.path));
        if (outNode) {
          pairedInputs.push(inNode);
          pairedOutputs.push(outNode);
        } else {
          console.warn(`No sibling ${outputKey} for ${inNode.path}, skipping that node`);
        }
      }
      if (pairedInputs.length === 0) {
        console.warn(`No structurally-paired nodes for ${inputKey}:${outputKey}, skipping`);
        continue;
      }

      validMappings.push({ id, inputKey, outputKey, inputNodes: pairedInputs, outputNodes: pairedOutputs });
    }

    // 如果没有有效的映射，抛出错误
    if (validMappings.length === 0) {
      console.warn("No valid key mappings found");
      throw new Error(tJson("invalidPathKey"));
    }

    // 处理所有有效的映射
    const allPromises: Promise<void>[] = [];
    let aborted = false;
    for (const { inputNodes, outputNodes } of validMappings) {
      totalCountRef.current += inputNodes.length;
      const cacheSuffix = generateCacheSuffix({
        sourceLanguage,
        targetLanguage: currentTargetLang,
        translationMethod,
        config,
        systemPrompt,
        userPrompt,
        glossaryTerms: getGlossaryTerms(currentTargetLang),
      });
      const promises = inputNodes.map((node, index: number) => {
        return limit(async () => {
          if (aborted) return;
          const sourceValue = typeof node.value === "string" ? node.value : JSON.stringify(node.value);
          try {
            outputNodes[index].parent[outputNodes[index].parentProperty] = await translateSingleWithGlossary(sourceValue, cacheSuffix, {
              translationMethod,
              targetLanguage: currentTargetLang,
              sourceLanguage,
              ...runtimeConfig,
            });
          } catch (error) {
            if (isAuthError(error) || isCascadedAbort(error)) {
              aborted = true;
              throw error;
            }
            recordLineFailure(sourceValue, getErrorMessage(error));
          }
          updateProgress();
        });
      });
      allPromises.push(...promises);
    }

    await Promise.all(allPromises);
  };

  // 扁平 json，单一键名，可选择起始翻译节点
  const handleSelectiveKeyTranslation = async (jsonObject: JsonValue, currentTargetLang: string) => {
    if (selectiveField.trim() === "") {
      throw new Error(`${t("enter")} ${tJson("fieldToTranslate")}`);
    }

    if (typeof jsonObject !== "object" || jsonObject === null || Array.isArray(jsonObject)) {
      throw new Error(tJson("invalidJson"));
    }

    const rootRecord = jsonObject as Record<string, Record<string, JsonValue>>;

    const keys = selectiveField
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

      // Find start index if selectiveStartKey is provided
      const startIndex = selectiveStartKey ? objectKeys.indexOf(selectiveStartKey) : 0;
      if (selectiveStartKey && startIndex === -1) {
        throw new Error(`${tJson("invalidStartKey")}: ${selectiveStartKey}`);
      }

      // Get relevant keys (all keys if no start node, or keys from start index onwards)
      const relevantKeys = startIndex === -1 ? objectKeys : objectKeys.slice(startIndex);

      // Find all nodes that need translation。仅收字符串值:非字符串会被
      // String() 变成 "[object Object]"/"123" 送翻译,译回的垃圾字符串再覆盖
      // 原结构 —— 静默数据损坏。
      const nodesToTranslate = relevantKeys
        .map((key) => ({
          key: key,
          value: rootRecord[key]?.[inputKey],
        }))
        .filter((node): node is { key: string; value: string } => typeof node.value === "string");

      if (nodesToTranslate.length === 0) {
        throw new Error(`${tJson("invalidPathKey")}: ${inputKey}`);
      }

      totalCountRef.current += nodesToTranslate.length;
      const cacheSuffix = generateCacheSuffix({
        sourceLanguage,
        targetLanguage: currentTargetLang,
        translationMethod,
        config,
        systemPrompt,
        userPrompt,
        glossaryTerms: getGlossaryTerms(currentTargetLang),
      });
      // Translate all nodes
      let aborted = false;
      const promises = nodesToTranslate.map(async (node) => {
        return limit(async () => {
          if (aborted) return;
          try {
            // Update the value in the original object
            rootRecord[node.key][outputKey] = await translateSingleWithGlossary(node.value, cacheSuffix, {
              translationMethod,
              targetLanguage: currentTargetLang,
              sourceLanguage,
              ...runtimeConfig,
            });
          } catch (error) {
            if (isAuthError(error) || isCascadedAbort(error)) {
              aborted = true;
              throw error;
            }
            recordLineFailure(node.value, getErrorMessage(error));
          }
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

  const runTranslation = async () => {
    setTranslatedText("");
    setTranslationResults({});
    // Local runTranslation (hook's isn't called here) — reset ALL failure state so
    // counts don't accumulate across runs and the failure warning re-fires.
    clearFailures();

    // Reset progress
    translatedCountRef.current = 0;
    totalCountRef.current = 0;
    setProgressPercent(0);
    setProgressInfo({ current: 0, total: 0 });

    if (!sourceText.trim()) {
      message.warning(t("noSourceText"));
      return;
    }

    // validate 不再自管 isTranslating, 这里统一用 try/finally 兜底,
    // progress modal 在 test ping → JSON 预处理 → 翻译循环之间保持连续可见。
    setIsTranslating(true);
    // Show non-zero progress immediately so users see the modal is alive while
    // the first LLM request is in-flight (DeepSeek etc. can take 10-30s per item).
    setProgressPercent(0.5);

    // For storing results from all languages
    const allResults: Record<string, string> = {};

    try {
      const isValid = await validate();
      if (!isValid) return;

      let originalJsonObject: JsonValue;
      try {
        originalJsonObject = preprocessJson(sourceText);
      } catch {
        message.error(tJson("invalidJson"));
        return;
      }

      setSourceText(JSON.stringify(originalJsonObject, null, 2));

      const targetLangs = multiLanguageMode ? targetLanguages : [targetLanguage];

      if (multiLanguageMode && targetLangs.length === 0) {
        message.error(t("noTargetLanguage"));
        return;
      }

      if (translateMode === "i18nMode" && multiLanguageMode) {
        // For i18nMode + multiLanguageMode, process all languages in the same JSON object
        const jsonObject = JSON.parse(JSON.stringify(originalJsonObject));

        // 逐语言隔离失败(与下方非 i18n 分支一致):此前一个语言抛错会把
        // 已完成语言的全部翻译一起丢弃 —— 现在失败语言记入面板,完成的
        // 语言照常落入合并结果。
        for (const currentTargetLang of targetLangs) {
          try {
            await handleI18nTranslation(jsonObject, currentTargetLang);
          } catch (error: unknown) {
            console.error(`Error translating to ${currentTargetLang}:`, error);
            if (isCascadedAbort(error)) continue;
            setFailedLangs((prev) => (prev.includes(currentTargetLang) ? prev : [...prev, currentTargetLang]));
            markRunHadFailures();
            const friendly = isNetworkError(error) ? t("networkUnavailable") : isAbortError(error) ? t("translationTimeout") : null;
            const langLabel = sourceOptions.find((option) => option.value === currentTargetLang)?.label || currentTargetLang;
            const content = friendly ? `${friendly} (${langLabel})` : `${getErrorMessage(error)} ${langLabel} ${t("translationError")}`;
            message.error({ content, key: "translate-lang-fail", duration: 10 });
          }
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

          message.success(t("fileExported", { fileName: downloadFileName }));
        }
      } else {
        for (const currentTargetLang of targetLangs) {
          try {
            const jsonObject = JSON.parse(JSON.stringify(originalJsonObject));

            if (translateMode === "allKeys") {
              await handleAllKeysTranslation(jsonObject, currentTargetLang);
            } else if (translateMode === "nodeKeys") {
              await handleNodeKeysTranslation(jsonObject, currentTargetLang, nodeKeysPath);
            } else if (translateMode === "keyMapping") {
              await handleKeyMappingTranslation(jsonObject, currentTargetLang);
            } else if (translateMode === "selectiveKey") {
              await handleSelectiveKeyTranslation(jsonObject, currentTargetLang);
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

              message.success(`${langLabel} ${t("fileExported", { fileName: downloadFileName })}`);
            }
          } catch (error: unknown) {
            console.error(`Error translating to ${currentTargetLang}:`, error);
            if (isCascadedAbort(error)) continue;
            // De-duped lang-failure aggregation. Shown in TranslateFailurePanel.
            setFailedLangs((prev) => (prev.includes(currentTargetLang) ? prev : [...prev, currentTargetLang]));
            // Flip the run's failure flag so the success toast below is suppressed even
            // when other langs produced results (otherwise green "完成" contradicts the panel).
            markRunHadFailures();
            const friendly = isNetworkError(error) ? t("networkUnavailable") : isAbortError(error) ? t("translationTimeout") : null;
            const langLabel = sourceOptions.find((option) => option.value === currentTargetLang)?.label || currentTargetLang;
            const content = friendly ? `${friendly} (${langLabel})` : `${getErrorMessage(error)} ${langLabel} ${t("translationError")}`;
            // Shared key: N failed languages roll into one toast instead of stacking
            // N high — the TranslateFailurePanel below keeps the full per-lang list.
            message.error({ content, key: "translate-lang-fail", duration: 10 });
          }
        }
      }

      // Update state with all translation results
      setTranslationResults(allResults);

      // Keep backward compatibility for single language mode
      if (!multiLanguageMode && allResults[targetLanguage]) {
        setTranslatedText(allResults[targetLanguage]);
      }

      // Show success message — but only when the run had NO line- or lang-level failures.
      // Line failures set the ref inside translateSingle; lang failures via markRunHadFailures
      // above. Without this gate a partially/fully failed run shows green "完成" on top of the
      // red error toasts + TranslateFailurePanel.
      setProgressPercent(100);
      if (!directExport && !hadRunFailures()) {
        message.success(t("textProcessed"));
      }
    } catch (error: unknown) {
      console.error("Translation process error:", error);
      if (isCascadedAbort(error)) {
        // Auth error already surfaced via the inner catch — silently exit.
      } else if (isNetworkError(error)) {
        message.error(t("networkUnavailable"), 10);
      } else if (isAbortError(error)) {
        message.error(t("translationTimeout"), 10);
      } else {
        message.error(`${getErrorMessage(error)} ${t("translationError")}`, 10);
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const exportAllFiles = async () => {
    if (multiLanguageMode && Object.keys(translationResults).length > 0) {
      const exportedFiles = [];
      const failedLabels: string[] = [];
      const languageCodes = Object.keys(translationResults);
      for (const langCode of languageCodes) {
        try {
          const fileName = await handleExportFile(langCode);
          exportedFiles.push(fileName);
        } catch (error) {
          console.error(`${langCode} Export Failure:`, error);
          failedLabels.push(sourceOptions.find((option) => option.value === langCode)?.label || langCode);
        }
      }
      if (exportedFiles.length > 0) {
        message.success(`${exportedFiles.length} ${t("exportedFile")}: ${exportedFiles.join(", ")}`, 10);
      }
      if (failedLabels.length > 0) {
        message.warning(t("partialExportFailed", { items: failedLabels.join(", ") }), 10);
      }
    } else {
      const fileName = await handleExportFile();
      message.success(t("fileExported", { fileName }));
    }
  };

  // Render language results for multi-language mode
  const renderMultiLanguageResults = () => {
    if (!multiLanguageMode || Object.keys(translationResults).length === 0) {
      return null;
    }

    return (
      <Space orientation="vertical" className="w-full">
        {targetLanguages.map((langCode) => {
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
              copyNodeLabel={tJson("copyNode")}
              onExport={() => handleExportFile(langCode)}
              className="mb-4"
            />
          );
        })}
      </Space>
    );
  };

  return (
    <Spin spinning={isFileProcessing} description="Please wait..." size="large">
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
                  disabled={isTranslating}
                  onClick={() => {
                    resetUpload();
                    message.success(t("resetUploadSuccess"));
                  }}
                  icon={<ClearOutlined />}
                  aria-label={t("clearAll")}>
                  {t("clearAll")}
                </Button>
              </Tooltip>
            }
            style={cardStyle}>
            <Dragger
              customRequest={({ file }) => handleFileUpload(file as File)}
              accept={uploadFileTypes.accept}
              showUploadList
              beforeUpload={resetUpload}
              onRemove={handleUploadRemove}
              onChange={handleUploadChange}
              fileList={fileList}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{t("dragAndDropText")}</p>
              <p className="ant-upload-hint">
                {t("supportedFormats")} {uploadFileTypes.label}
              </p>
            </Dragger>

            <>
              <SourceArea
                sourceText={sourceText}
                setSourceText={setSourceText}
                stats={sourceStats}
                placeholder={t("pasteUploadContent")}
                ariaLabel={t("sourceArea")}
                className="mt-1"
              />
            </>

            <Divider />

            <Flex gap="small" wrap className="mt-auto pt-4">
              <Button type="primary" size="large" onClick={runTranslation} loading={isTranslating} icon={<GlobalOutlined spin={isTranslating} />} className="flex-1">
                {multiLanguageMode ? `${t("translate")} | ${t("totalLanguages")}${targetLanguages.length || 0}` : t("translate")}
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
            style={cardStyle}
            extra={
              <Space>
                <Tooltip title={t("exportSettingTooltip")}>
                  <Button
                    type="text"
                    icon={<SaveOutlined />}
                    size="small"
                    disabled={isTranslating}
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
                    disabled={isTranslating}
                    onClick={async () => {
                      await importSettings();
                    }}
                    aria-label={t("importSettingTooltip")}
                  />
                </Tooltip>
                <Tooltip title={t("batchEditMultiLangTooltip")}>
                  <Button type="text" icon={<GlobalOutlined />} size="small" disabled={isTranslating} onClick={() => setMultiLangModalOpen(true)} aria-label={t("batchEditMultiLangTooltip")} />
                </Tooltip>
              </Space>
            }>
            <Form layout="vertical" className="w-full !mb-3">
              <LanguageSelector
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                targetLanguages={targetLanguages}
                multiLanguageMode={multiLanguageMode}
                handleLanguageChange={handleLanguageChange}
                handleSwapLanguages={handleSwapLanguages}
                setTargetLanguages={setTargetLanguages}
                setMultiLanguageMode={setMultiLanguageMode}
              />
            </Form>

            <ApiStatusBlock disabled={isTranslating} />

            <Collapse
              ghost
              size="small"
              activeKey={collapseKeys}
              onChange={(keys) => setCollapseKeys(typeof keys === "string" ? [keys] : keys)}
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
                      <Form.Item className="!mb-1">
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
                        <div
                          style={{
                            padding: token.paddingSM,
                            background: "transparent",
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderRadius: token.borderRadiusLG,
                            marginBottom: token.marginMD,
                          }}>
                          <Flex justify="space-between" align="center" className="!mb-2">
                            <Text type="secondary">{tJson("keyMapping")}</Text>
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
                            <Form.Item label={tJson("keyToTranslate")} className="!mb-0">
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
                        <div
                          style={{
                            padding: token.paddingSM,
                            background: "transparent",
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderRadius: token.borderRadiusLG,
                            marginBottom: token.marginMD,
                          }}>
                          <Form.Item label={tJson("startKey")} extra={tJson("StartKeyExtra")} className="!mb-1">
                            <Input value={selectiveStartKey} onChange={(e) => setSelectiveStartKey(e.target.value)} placeholder={`${t("example")}: fetchError`} aria-label={tJson("startKey")} />
                          </Form.Item>
                          <Form.Item label={tJson("fieldToTranslate")} extra={tJson("fieldToTranslateExtra")} className="!mb-0">
                            <Input value={selectiveField} onChange={(e) => setSelectiveField(e.target.value)} placeholder={`${t("example")}: message`} aria-label={tJson("fieldToTranslate")} />
                          </Form.Item>
                        </div>
                      )}

                      {translateMode === "nodeKeys" && (
                        <div
                          style={{
                            padding: token.paddingSM,
                            background: "transparent",
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderRadius: token.borderRadiusLG,
                            marginBottom: token.marginMD,
                          }}>
                          <Form.Item label={tJson("nodeToTranslate")} extra={`${tJson("nodeToTranslateExtra")} ${tJson("multiValueHint")}`} className="!mb-0">
                            <Input
                              value={nodeKeysPath}
                              onChange={(e) => setNodeKeysPath(e.target.value)}
                              placeholder={`${t("example")}: content,data.title`}
                              aria-label={tJson("nodeToTranslate")}
                            />
                          </Form.Item>
                        </div>
                      )}

                      {translateMode === "i18nMode" && (
                        <div
                          style={{
                            padding: token.paddingSM,
                            background: "transparent",
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderRadius: token.borderRadiusLG,
                            marginBottom: token.marginMD,
                          }}>
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
                      requestTimeoutSec={requestTimeoutSec}
                      setRequestTimeoutSec={setRequestTimeoutSec}
                      useCache={useCache}
                      setUseCache={setUseCache}>
                      {/* Component-specific settings */}
                      <Flex justify="space-between" align="center">
                        <Tooltip title={t("directExportTooltip")}>
                          <Text>{t("directExport")}</Text>
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

      {/* Partial-failure panel: auto-retried once, still-failed lines kept originals */}
      <TranslateFailurePanel count={failedCount} lines={failedLines} failedLangs={failedLangs} reason={failedReason} onClose={clearFailures} disabled={isTranslating} onRetry={runTranslation} />

      {/* Results Section */}
      {!directExport && (translatedText || (multiLanguageMode && Object.keys(translationResults).length > 0)) && (
        <div className="mt-6">
          {multiLanguageMode && translateMode !== "i18nMode"
            ? renderMultiLanguageResults()
            : translatedText && (
                <ResultCard
                  title={t("translationResult")}
                  content={resultStats.displayText}
                  charCount={resultStats.charCount}
                  lineCount={resultStats.lineCount}
                  onCopy={() => copyToClipboard(translatedText)}
                  onCopyNode={() => copyToClipboard(stripJsonWrapper(translatedText))}
                  copyNodeLabel={tJson("copyNode")}
                  onExport={async () => {
                    const fileName = await handleExportFile();
                    message.success(t("fileExported", { fileName }));
                  }}
                />
              )}
        </div>
      )}

      <TranslationProgressModal
        open={isTranslating}
        percent={progressPercent}
        multiLanguageMode={multiLanguageMode}
        targetLanguageCount={targetLanguages.length}
        currentCount={progressInfo.current}
        totalCount={progressInfo.total}
      />

      <MultiLanguageSettingsModal
        open={multiLangModalOpen}
        onClose={() => setMultiLangModalOpen(false)}
        targetLanguages={targetLanguages}
        setTargetLanguages={setTargetLanguages}
        setMultiLanguageMode={setMultiLanguageMode}
      />
    </Spin>
  );
};

export default JSONTranslator;
