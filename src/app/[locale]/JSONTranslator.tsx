"use client";

import React, { useState } from "react";
import { ConfigProvider, Row, Col, Button, Typography, Tooltip, Form, Input, Select, App, Card, Space, Spin, Flex, Upload, Divider, Switch, Collapse, theme } from "antd";
import { SettingOutlined, InboxOutlined, ExportOutlined, ImportOutlined, GlobalOutlined, ClearOutlined, SaveOutlined, FileTextOutlined, ControlOutlined } from "@ant-design/icons";
import { JSONPath } from "jsonpath-plus";
import { useTranslations } from "next-intl";
import type { JsonPathNode, JsonValue, KeyMapping, ValidMapping } from "@/app/types";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import useFileUpload from "@/app/hooks/useFileUpload";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useTextStats } from "@/app/hooks/useTextStats";
import { useExportFilename } from "@/app/hooks/useExportFilename";

import { pairingAncestors, filterObjectPropertyMatches, preprocessJson, hasPrecisionLossRisk, downloadFile, describeError, isAbortError, isCascadedAbort, isNetworkError, stripJsonWrapper, applyRemoveCharsToLines, getFileTypePresetConfig, splitTopLevelCommas } from "@/app/utils";
import KeyMappingInput from "@/app/components/KeyMappingInput";
import { useLanguageOptions } from "@/app/components/languages";
import LanguageSelector from "@/app/components/LanguageSelector";
import ApiStatusBlock from "@/app/components/ApiStatusBlock";
import { useTranslationContext } from "@/app/components/TranslationContext";
import ResultCard from "@/app/components/ResultCard";
import TranslationProgressStrip from "@/app/components/TranslationProgressStrip";
import AdvancedTranslationSettings from "@/app/components/AdvancedTranslationSettings";
import TranslateFailurePanel from "@/app/components/TranslateFailurePanel";

import MultiLanguageSettingsModal from "@/app/components/MultiLanguageSettingsModal";
import SourceArea from "@/app/components/SourceArea";
import { useLockExportFolder } from "@/app/components/ExportFolder";
import { describeExport } from "@/app/hooks/useFileExport";

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
    sourceLanguage,
    targetLanguage,
    targetLanguages,
    setTargetLanguages,
    useCache,
    setUseCache,
    removeChars,
    setRemoveChars,
    multiLanguageMode,
    setMultiLanguageMode,
    translateBatch,
    translatedText,
    setTranslatedText,
    failedCount,
    failedLines,
    failedLangs,
    setFailedLangs,
    failedReason,
    clearFailures,
    markRunHadFailures,
    runHadFailures,
    hadRunFailures,
    runRetry,
    isScopedRetry,
    getActiveTargetLangs,
    isDisposed,
    isTranslating,
    setIsTranslating,
    handleLanguageChange,
    handleSwapLanguages,
    validate,
    requestCancel,
    isCancelRequested,
    progressPercent,
    setProgressPercent,
    progressInfo,
    resetProgress,
    retryCount,
    setRetryCount,
    requestTimeoutSec,
    setRequestTimeoutSec,
  } = useTranslationContext();

  // 运行中锁住页面级「导出目录」入口:写入是每个文件现读句柄,跑到一半改目录
  // 会把同一批产物劈进两个文件夹。控件在 ToolPage 里,prop 传不上去,故用环境锁。
  useLockExportFolder(isTranslating);

  const [directExport, setDirectExport] = useState(false);
  const [translationResults, setTranslationResults] = useState<Record<string, string>>({}); // Store results by language

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

  // removeChars must clean ONLY translated TEXT — never keys or JSON structure.
  // The old code applied it to the whole JSON.stringify output, so a removeChars
  // containing a structural char (`"`, `,`, `:`, `{`…) or a character that also
  // appears in keys destroyed the document — invalid/renamed-key JSON shipped
  // under a green success toast. Scoping it to each translation result matches
  // the MD (applyRemoveChars) and Subtitle (pre-restore line cleaning) tools.
  // 实现与字幕工具/CLI 共用同一份(textUtils.applyRemoveCharsToLines)。
  const applyRemoveChars = (text: string): string => applyRemoveCharsToLines([text], removeChars)[0];

  // ─── 收集 → 一次引擎调用 → 回写 ────────────────────────────────────────────
  // 五个模式 = 五个【收集器】,不是五个翻译循环。模式差异全是格式知识(遍历哪些
  // 节点、写回哪个字段),编排(并发/节流/重试/429 冷却/缓存/进度/失败面板)只有
  // 引擎一份 —— 与 CLI 的 json handler 同构(收集 values+setters → ctx.translate
  // → 逐槽位回写)。这里曾经是四个手写 pLimit 循环,delayTime 漂移(字幕/MD 每行
  // 间隔 200ms、JSON 满速打)就是那个结构的必然产物,别把循环加回来。
  type CollectedNode = { value: string; write: (v: string) => void };


  // 收集完成后的执行半段,五个模式共用。
  const translateCollected = async (nodes: CollectedNode[], currentTargetLang: string, langIndex: number, langCount: number) => {
    if (nodes.length === 0) return;
    const softFilled = new Set<number>();
    // documentType=undefined + independent=true:JSON 值必须逐值往返,两条批
    // 处理路径都要压住。与 CLI json handler 逐位一致(cliFormat.ts 的
    // ctx.translate(values, undefined, …, { independent: true }),它的类型里
    // 压根没有第三种 documentType)。
    // ⚠ 别给这里传 documentType —— 上下文批会把 20 个值拼进一个 marker 请求,
    // 回显守卫会把「合法译成自身」的值判成回显而清空,一次编号错位丢一整批。
    const lines = await translateBatch(
      nodes.map((n) => n.value),
      translationMethod,
      currentTargetLang,
      langIndex,
      langCount,
      undefined,
      { collectSoftFilled: softFilled },
      true,
    );
    // 软填槽位【不写回】:引擎对失败行回填原文,但本工具的输出字段 ≠ 输入字段
    // (i18n 写 record[lang]、keyMapping 写 outputKey)——把原文写进目标字段,
    // i18n 的增量语义就失效了(字段已存在 → 重跑永远跳过失败节点)。跳过写回
    // 与旧行为逐位一致:失败节点保持原状,失败面板由引擎经 translateBatch 记录。
    // removeChars 只打真译出的值(软填的是原文,再删字符会产出既非原文也非译文
    // 的东西)。
    lines.forEach((v, i) => {
      if (!softFilled.has(i)) nodes[i].write(applyRemoveChars(v));
    });
  };

  const collectI18n = (jsonObject: JsonValue, currentTargetLang: string): CollectedNode[] => {
    // 使用选择的源语言作为 i18n 源字段
    const sourceField = sourceLanguage === "auto" ? "en" : sourceLanguage;
    const nodes: CollectedNode[] = [];

    const processObject = (obj: JsonValue) => {
      if (typeof obj !== "object" || obj === null) return;

      // 数组：遍历元素
      if (Array.isArray(obj)) {
        obj.forEach(processObject);
        return;
      }

      const record = obj as Record<string, JsonValue>;

      // 只收目标语言字段不存在的节点 —— 收集时判断与旧版任务内判断等价:
      // 语言循环是串行的,收集发生在上一语言全部写回之后。
      const sourceValue = record[sourceField];
      if (typeof sourceValue === "string" && record[currentTargetLang] == null) {
        nodes.push({ value: sourceValue, write: (v) => (record[currentTargetLang] = v) });
      }

      // 递归处理子对象
      Object.values(record).forEach((value) => processObject(value));
    };

    processObject(jsonObject);
    return nodes;
  };

  // 树内的字符串叶子(经父节点回写)。不含【根节点本身】—— JSONPath `$..*`
  // 只枚举后代,根不在其中,见 collectAllKeys。
  const collectStringLeaves = (jsonObject: JsonValue): CollectedNode[] => {
    const allNodes = JSONPath({ path: "$..*", json: jsonObject, resultType: "all" }) as JsonPathNode[];
    return allNodes.filter((node) => typeof node.value === "string").map((node) => ({ value: node.value as string, write: (v) => (node.parent[node.parentProperty] = v) }));
  };

  // 全局键值翻译:收下所有字符串叶子。
  // 取 holder 而不是裸值,只为一件事:根节点【本身】就是字符串叶子时
  // (`"Hello world"` 是合法 JSON,preprocessJson 照收),它没有父节点可回写。
  // 不单独收的话 `$..*` 一个节点都拿不到 → 整轮零翻译、原样写回、打绿色成功,
  // 与真正的成功【无法区分】。CLI 的 collectStrings 早就单独收了这一条
  // (cliFormat.ts:「根节点本身就是字符串叶子…单独收一下」),两边保持一致。
  const collectAllKeys = (holder: { v: JsonValue }): CollectedNode[] => {
    if (typeof holder.v === "string") {
      const rootText = holder.v;
      return [{ value: rootText, write: (t) => (holder.v = t) }];
    }
    return collectStringLeaves(holder.v);
  };

  // 指定节点的键值对翻译:路径圈定范围,范围内同 allKeys
  const collectNodeKeys = (jsonObject: JsonValue, jsonPath: string): CollectedNode[] => {
    // UI 的 multiValueHint/placeholder 承诺逗号分隔多路径("content,data.title")
    // —— 原样整串喂给 JSONPath 会被解析成畸形 union:只命中最后一个路径,
    // 其余静默丢弃且照常报成功。splitTopLevelCommas(@/app/utils)只按顶层
    // 逗号拆,方括号内的 bracket union 逗号保持原样。
    const paths = splitTopLevelCommas(jsonPath)
      .map((p) => p.trim())
      .filter(Boolean);
    const pathNodes = paths.flatMap((p) => JSONPath({ path: p, json: jsonObject, resultType: "all" }) as JsonPathNode[]);

    if (pathNodes.length === 0) {
      throw new Error(`${tJson("invalidPathKey")}: ${jsonPath}`);
    }

    const nodes: CollectedNode[] = [];
    for (const node of pathNodes) {
      // 路径解析到字符串叶节点(工具自带示例 $.store.book[*].title 即是)——
      // 直接收叶子。旧逻辑静默跳过非对象节点,整次运行零翻译却报成功;更早
      // 的版本靠装箱借道 allKeys,收集器形态下 setter 天然指向叶子,箱子不用装。
      if (typeof node.value === "string") {
        nodes.push({ value: node.value, write: (v) => ((node.parent as Record<string, JsonValue>)[node.parentProperty] = v) });
        continue;
      }
      if (typeof node.value !== "object" || node.value == null) continue;
      // 子树的根不会是字符串(上面那个分支已经把字符串叶子收走),用树内版本。
      nodes.push(...collectStringLeaves(node.value as JsonValue));
    }
    return nodes;
  };

  // 指定键名的映射翻译:配对校验后,inputKey 的值 → outputKey 的槽位
  const collectKeyMapping = (jsonObject: JsonValue): CollectedNode[] => {
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

      // 结构化配对:input/output 节点必须是【同一父记录】的兄弟键。两个独立
      // $..key 查询的遍历顺序互不对应,按数组下标配对在计数恰好相等时会把
      // 译文写进错误的对象(静默错位)。祖先路径剥【两 key 公共前缀后的
      // 差异后缀段】(pairingAncestors):只剥一段会让点分 key
      // ("en.title"→"ar.title")永不配对(整轮抛 invalidPathKey),按 key
      // 全段剥又会把 "items[*].en" 的通配段(记录身份)剥掉导致跨记录错配。
      const ancestor = pairingAncestors(inputKey, outputKey);
      const outputByParent = new Map(outputNodes.map((n) => [ancestor.output(n.path), n]));
      // 祖先坍缩(跨数组映射如 items[*].en → records[*].ar:公共前缀为空,
      // 记录身份段全被剥掉,所有 output 节点挤进同一个 Map 键):继续跑会让
      // N 条译文并发竞写同一槽位、其余记录永远收不到翻译 —— 整条映射跳过。
      if (outputByParent.size !== outputNodes.length) {
        console.warn(`Ambiguous pairing (ancestor collision) for ${inputKey}:${outputKey}, skipping`);
        // 整条映射被跳过却不上报 = 零翻译还弹绿色"完成"(transformer 同款守卫
        // 走的是 nodeCountMismatch warning)。翻失败 ref 压掉成功 toast,
        // shared key 防多语言循环叠 N 层。
        markRunHadFailures();
        message.warning({ content: tJson("nodeCountMismatch"), key: "keymapping-ambiguous", duration: 10 });
        continue;
      }
      const pairedInputs: JsonPathNode[] = [];
      const pairedOutputs: JsonPathNode[] = [];
      for (const inNode of inputNodes) {
        // 与 allKeys/selectiveKey/nodeEdit 同约定:只翻字符串值。数字/null/
        // 对象值 JSON.stringify 后送翻、再把返回的【字符串】原样覆写,会把
        // 123 变 "123"、对象值压扁成 JSON 文本 —— 类型与结构永久损坏。
        if (typeof inNode.value !== "string") continue;
        const outNode = outputByParent.get(ancestor.input(inNode.path));
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
      // 输入侧身份段被剥光时多个输入也会配到同一 output(pairedOutputs 出现
      // 重复节点)—— 并发译文竞写同一槽位,同样按歧义跳过。
      if (new Set(pairedOutputs).size !== pairedOutputs.length) {
        console.warn(`Ambiguous pairing (multiple inputs share one output) for ${inputKey}:${outputKey}, skipping`);
        // 同上:静默跳过会让部分映射零翻译还报成功。
        markRunHadFailures();
        message.warning({ content: tJson("nodeCountMismatch"), key: "keymapping-ambiguous", duration: 10 });
        continue;
      }

      validMappings.push({ id, inputKey, outputKey, inputNodes: pairedInputs, outputNodes: pairedOutputs });
    }

    // 如果没有有效的映射，抛出错误
    if (validMappings.length === 0) {
      console.warn("No valid key mappings found");
      throw new Error(tJson("invalidPathKey"));
    }

    // 收集所有有效映射:pairedInputs 已在上面过滤为纯字符串值(见"只翻字符串值"),
    // 与 pairedOutputs 按下标一一对应。
    const nodes: CollectedNode[] = [];
    for (const { inputNodes, outputNodes } of validMappings) {
      inputNodes.forEach((node, index) => {
        const out = outputNodes[index];
        nodes.push({ value: node.value as string, write: (v) => (out.parent[out.parentProperty] = v) });
      });
    }
    return nodes;
  };

  // 扁平 json，单一键名，可选择起始翻译节点
  const collectSelectiveKey = (jsonObject: JsonValue): CollectedNode[] => {
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
    // 字段串只含逗号/空白(",")时 keys 为空,下方循环零次执行:零工作却报
    // 绿色成功 —— 与空字段同样按错误处理(兄弟模式 keyMapping/nodeKeys 均如此)。
    if (keys.length === 0) {
      throw new Error(`${t("enter")} ${tJson("fieldToTranslate")}`);
    }
    const mappings = keys.map((key) => ({ inputKey: key.trim(), outputKey: key.trim() }));

    const nodes: CollectedNode[] = [];
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

      // 多个 inputKey 的节点并进同一次引擎调用(旧版逐 key 串行分段 ——
      // 同一批请求,人为多了段间空档,没有语义差别)。
      for (const node of nodesToTranslate) {
        nodes.push({ value: node.value, write: (v) => (rootRecord[node.key][outputKey] = v) });
      }
    }
    return nodes;
  };

  const handleExportFile = async (currentTargetLang: string | null = null) => {
    const fileName = multipleFiles[0]?.name || (translateMode === "i18nMode" ? "translated_i18n.json" : "translated.json");

    if (currentTargetLang && multiLanguageMode) {
      const content = translationResults[currentTargetLang];
      const downloadFileName = generateFileName(fileName, currentTargetLang, "json", multiLanguageMode);
      // 回传【实际写入名】:导出目录下同名会让路成 `x (1).json`,聚合 toast 报的
      // 就是这个返回值,复述请求名会让用户去找不存在的文件
      return (await downloadFile(content, downloadFileName, "application/json;charset=utf-8")).fileName;
    } else {
      // Export single language result - use generateFileName with targetLanguage
      const downloadFileName = generateFileName(fileName, targetLanguage, "json", multiLanguageMode);
      return (await downloadFile(translatedText, downloadFileName, "application/json;charset=utf-8")).fileName;
    }
  };

  // 作废上一轮翻译产物:Clear All 与换/删上传文件时调用,使单语/多语言译文结果、
  // 失败面板回到"未翻译"初始态。与 runTranslation 开头的复位保持同一清单。
  const clearResults = () => {
    setTranslatedText("");
    setTranslationResults({});
    clearFailures();
  };

  const runTranslation = async () => {
    // 常规跑:复用 clearResults() 复位产物(译文 / 多语言结果 / 失败面板)——与
    // Clear All、换删文件同一份清单(本地 runTranslation 不走 hook 的复位)。
    // scoped 重试:只清失败面板 —— 成功语言的结果/预览要保留,本轮 allResults
    // 在末尾 merge 进 translationResults,Export All 才不丢已成功的语言。
    if (isScopedRetry()) clearFailures();
    else clearResults();

    // Reset progress(hook 的进度状态 —— 引擎经 translateBatch 驱动它)
    resetProgress();

    if (!sourceText.trim()) {
      message.warning(t("noSourceText"));
      return;
    }

    // validate 不再自管 isTranslating, 这里统一用 try/finally 兜底,
    // progress modal 在 test ping → JSON 预处理 → 翻译循环之间保持连续可见。
    setIsTranslating(true);

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
      // 下一行就会用 parse 结果覆写源文本 —— 超长整数(雪花 ID)在这一步已被
      // 静默改值,翻译产物全部继承损坏值。保不了真,至少转为知情。
      if (hasPrecisionLossRisk(sourceText)) message.warning(tJson("bigIntPrecision"));

      setSourceText(JSON.stringify(originalJsonObject, null, 2));

      // 失败面板重试(runRetry)下只跑还需要处理的语言:本轮 allResults 在末尾
      // merge 进 translationResults,成功语言的 Export-All 条目/已下载文件都保
      // 留,directExport 也不再重复下载。i18nMode + 多语言除外 —— 它把所有语言
      // 写进【同一份】combined 产物,scoped 重跑会产出缺语言的 combined,所以
      // 直接取全量 targetLanguages,靠缓存让重跑便宜。
      const targetLangs = translateMode === "i18nMode" && multiLanguageMode ? targetLanguages : getActiveTargetLangs();

      if (multiLanguageMode && targetLangs.length === 0) {
        message.error(t("noTargetLanguage"));
        return;
      }

      // 这里【不】手动推非零进度。引擎在真正开跑时自己会推(runTranslateLines
      // 的 `ctx.onProgress?.(0.5, …)`),而本地先推一脚会让末尾 `p > 0 ? 100 : p`
      // 的守卫永远为真 —— 那句守卫的全部意义就是"零请求的运行别钉 100%":
      // 坏 nodeKeysPath 让每个语言都在收集器里抛错、一个请求没发,照样钉成
      // 100% 的琥珀色 INCOMPLETE,声称有行保留了原文而失败面板是空的。
      // (上一轮把这一脚往下挪了几行,但它仍在语言循环之上,守卫照样恒真。)
      // 字幕/Markdown 走 hook 的 runTranslation,那边本来就没有这一脚。
      if (translateMode === "i18nMode" && multiLanguageMode) {
        // For i18nMode + multiLanguageMode, process all languages in the same JSON object
        const jsonObject = JSON.parse(JSON.stringify(originalJsonObject));

        // 逐语言隔离失败(与下方非 i18n 分支一致):此前一个语言抛错会把
        // 已完成语言的全部翻译一起丢弃 —— 现在失败语言记入面板,完成的
        // 语言照常落入合并结果。
        for (const [langIndex, currentTargetLang] of targetLangs.entries()) {
          // 取消刹车:在飞请求已被 abort 掐断(translateBatch 的 controller),
          // 这里挡住的是【下一个语言】重新开跑。
          if (isCancelRequested()) break;
          try {
            await translateCollected(collectI18n(jsonObject, currentTargetLang), currentTargetLang, langIndex, targetLangs.length);
          } catch (error: unknown) {
            console.error(`Error translating to ${currentTargetLang}:`, error);
            if (isCascadedAbort(error)) continue;
            setFailedLangs((prev) => (prev.includes(currentTargetLang) ? prev : [...prev, currentTargetLang]));
            markRunHadFailures();
            const friendly = isNetworkError(error) ? t("networkUnavailable") : isAbortError(error) ? t("translationTimeout") : null;
            const langLabel = sourceOptions.find((option) => option.value === currentTargetLang)?.label || currentTargetLang;
            const content = friendly ? `${friendly} (${langLabel})` : `${describeError(error, t)} ${langLabel} ${t("translationError")}`;
            message.error({ content, key: "translate-lang-fail", duration: 10 });
          }
        }

        // removeChars is applied per-translation (applyRemoveChars at each
        // write-back), NOT to this serialized string — see applyRemoveChars.
        const resultText = JSON.stringify(jsonObject, null, 2);

        // Store the combined result for all languages
        setTranslatedText(resultText);
        // 写进 allResults 而非直接 setTranslationResults:本分支结束后下方还有
        // 无条件的 setTranslationResults(allResults) —— 直接 set 会被空对象立刻
        // 覆盖(state 批处理取末次写),Export All 按钮永远不出现。
        allResults.combined = resultText;

        // Handle direct export if enabled
        if (directExport) {
          // generateFileName 与其它导出路径一致,尊重用户在高级设置里配置的
          // 导出文件名模板(此前这条路径手拼文件名,模板被无声忽略)。
          const fileName = multipleFiles[0]?.name || `translated.json`;
          // i18n mode merges ALL languages into ONE file → no collision, so no
          // lang disambiguation (would produce a stray "_i18n" suffix).
          const downloadFileName = generateFileName(fileName, "i18n", "json", false);
          const written = await downloadFile(resultText, downloadFileName, "application/json;charset=utf-8");

          message.success(describeExport(t, written));
        }
      } else {
        for (const [langIndex, currentTargetLang] of targetLangs.entries()) {
          // 取消刹车:在飞请求已被 abort 掐断(translateBatch 的 controller),
          // 这里挡住的是【下一个语言】重新开跑。
          if (isCancelRequested()) break;
          try {
            // holder 而非裸值:根节点本身是字符串时没有父节点可回写(见 collectAllKeys)。
            const root: { v: JsonValue } = { v: JSON.parse(JSON.stringify(originalJsonObject)) };

            // 收集器只做遍历与回写定位;编排全在 translateCollected → translateBatch。
            let nodes: CollectedNode[];
            if (translateMode === "allKeys") nodes = collectAllKeys(root);
            else if (translateMode === "nodeKeys") nodes = collectNodeKeys(root.v, nodeKeysPath);
            else if (translateMode === "keyMapping") nodes = collectKeyMapping(root.v);
            else if (translateMode === "selectiveKey") nodes = collectSelectiveKey(root.v);
            else nodes = collectI18n(root.v, currentTargetLang);
            await translateCollected(nodes, currentTargetLang, langIndex, targetLangs.length);

            // removeChars is applied per-translation (applyRemoveChars at each
            // write-back), NOT to this serialized string — see applyRemoveChars.
            const resultText = JSON.stringify(root.v, null, 2);

            // Store result for this language
            allResults[currentTargetLang] = resultText;

            // If direct export is enabled, download the file immediately
            if (directExport) {
              const langLabel = sourceOptions.find((option) => option.value === currentTargetLang)?.label || currentTargetLang;
              const fileName = multipleFiles[0]?.name || `translated.json`;
              const downloadFileName = generateFileName(fileName, currentTargetLang, "json", multiLanguageMode);
              const written = await downloadFile(resultText, downloadFileName, "application/json;charset=utf-8");

              message.success(`${langLabel} ${describeExport(t, written)}`);
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
            const content = friendly ? `${friendly} (${langLabel})` : `${describeError(error, t)} ${langLabel} ${t("translationError")}`;
            // Shared key: N failed languages roll into one toast instead of stacking
            // N high — the TranslateFailurePanel below keeps the full per-lang list.
            message.error({ content, key: "translate-lang-fail", duration: 10 });
          }
        }
      }

      // Update state with all translation results. Merge, don't replace: a scoped
      // retry only rebuilds the failed langs — successful langs' entries must
      // survive for Export All / per-lang cards. Fresh runs went through
      // clearResults above (prev = {}), so merge degenerates to replace there.
      setTranslationResults((prev) => ({ ...prev, ...allResults }));

      // Keep backward compatibility for single language mode
      if (!multiLanguageMode && allResults[targetLanguage]) {
        setTranslatedText(allResults[targetLanguage]);
      }

      // Show success message — but only when the run had NO line- or lang-level failures.
      // Line failures set the ref inside translateSingle; lang failures via markRunHadFailures
      // above. Without this gate a partially/fully failed run shows green "完成" on top of the
      // red error toasts + TranslateFailurePanel.
      // 取消的 run 不钉 100%:内联进度条的 DONE 态派生自 percent >= 100 &&
      // !isTranslating,钉上去等于替一次主动喊停亮绿灯。停在 100 以下,
      // isTranslating 一落条带整个消失。
      // `p > 0 ? 100 : p` 与 runTranslation 的单文件钉【同一条规则】:批量里
      // 每个文件都在发请求前就失败时(格式不支持 / 解码失败),makeUpdateProgress
      // 从未跑过、percent 恒为 0,无条件钉会显示 100% 的琥珀色「INCOMPLETE」——
      // 声称有行保留了原文,而失败面板是空的。进度动过才钉。
      if (!isCancelRequested()) setProgressPercent((p) => (p > 0 ? 100 : p));
      // isDisposed / isCancelRequested:中途导航离开或取消时各 lang 按级联静默
      // continue,失败 ref 没翻 —— 不挡会弹绿色"完成"假成功。
      if (!directExport && !hadRunFailures() && !isDisposed() && !isCancelRequested()) {
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
        message.error(`${describeError(error, t)} ${t("translationError")}`, 10);
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const exportAllFiles = async () => {
    if (multiLanguageMode && Object.keys(translationResults).length > 0) {
      const exportedFiles = [];
      const failedLabels: string[] = [];
      // Mirror the per-lang cards (which filter by targetLanguages): a scoped retry
      // keeps prior successful langs in translationResults via merge, so a lang the
      // user deselected between runs must not resurface as an exported file. Keep
      // "combined" — i18nMode's single merged artifact, not a lang code.
      const languageCodes = Object.keys(translationResults).filter((c) => c === "combined" || targetLanguages.includes(c));
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
    <Spin spinning={isFileProcessing} description={t("pleaseWait")} size="large">
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
                    clearResults();
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
              disabled={isTranslating}
              customRequest={({ file }) => {
                clearResults();
                handleFileUpload(file as File);
              }}
              accept={uploadFileTypes.accept}
              showUploadList
              beforeUpload={resetUpload}
              onRemove={(file) => {
                clearResults();
                return handleUploadRemove(file);
              }}
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
                locked={isTranslating}
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

            <TranslationProgressStrip
              isTranslating={isTranslating}
              percent={progressPercent}
              onCancel={requestCancel}
              resumable={useCache}
              onDismiss={resetProgress}
              multiLanguageMode={multiLanguageMode}
              targetLanguageCount={targetLanguages.length}
              failed={failedCount > 0 || failedLangs.length > 0 || runHadFailures}
              lineFailures={failedCount > 0}
              currentCount={progressInfo.current}
              totalCount={progressInfo.total}
            />
          </Card>
        </Col>

        {/* Right Column: Settings and Configuration */}
        <Col xs={24} lg={10} xl={9}>
          <Card
            title={<Space><SettingOutlined /> {t("configuration")}</Space>}
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
                disabled={isTranslating}
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
                    // 一点锁全:模式 Select 与各模式的专属输入(nodeKeysPath /
                    // KeyMappingInput / selectiveField…)都消费 DisabledContext。
                    // 运行中的循环按点击时的闭包分发,中途换模式只会"看起来生效"。
                    <ConfigProvider componentDisabled={isTranslating}>
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
                    </ConfigProvider>
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
                      disabled={isTranslating}
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
      <TranslateFailurePanel count={failedCount} lines={failedLines} failedLangs={failedLangs} reason={failedReason} disabled={isTranslating} onRetry={() => runRetry(runTranslation)} />

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
