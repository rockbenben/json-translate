<h1 align="center">⚡️ JSON Translate</h1>
<p align="center"><a href="./README.md">English</a> | 中文</p>
<p align="center"><em>精准翻译 JSON — 只改值、不破坏结构、轻松完成 i18n</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://tools.newzone.top/zh/json-translate"><img src="https://img.shields.io/badge/%E5%9C%A8%E7%BA%BF%E4%BD%93%E9%AA%8C-json--translate-blue" alt="在线体验"></a>
</p>

**JSON Translate** 让 JSON 翻译更安全、更高效——仅处理字符串，不破坏任何结构。支持传统翻译 API（Google/Azure/DeepL）和多种 LLM（DeepSeek、OpenAI、Gemini、Azure OpenAI、Siliconflow、Groq、OpenRouter、Perplexity 以及自定义 LLM）。适用于站点/应用/数据集本地化，支持**全局**、**JSONPath 精准**、**键名选择**与 **i18n 聚合**等模式。

👉 **在线体验**：<https://tools.newzone.top/zh/json-translate>

## 核心特性

- **保持 JSON 结构**：仅翻译字符串值，保留结构和顺序不变。
- **高性能缓存 (IndexedDB)**：翻译结果存储在 **IndexedDB** 中，**无容量限制**，突破浏览器存储瓶颈。
- **多引擎支持**：Google、Azure、DeepL(X)，以及 9 种 AI 大模型。
- **灵活的翻译范围**：全局、JSONPath 精准节点、指定键名、选择性翻译、i18n 模式。
- **映射翻译**：将结果写入不同输出键，避免覆盖原字段。
- **多语言输出**：一次翻译多个目标语言。
- **深色模式与多语言界面**：完整的国际化支持。

## 翻译模式

### 全局翻译

递归遍历整个 JSON 结构，翻译所有字符串值，保持层级不变。

### 指定节点（JSONPath）

使用 JSONPath 表达式精准定位并翻译特定节点，多个路径用逗号分隔。

### 指定键名

仅翻译指定的键名：

- **简单模式**：逗号分隔的键名列表。
- **高级模式**：定义输入-输出键映射，译文写入新键。

### 选择性翻译

指定起始节点和目标字段名，适用于扁平 JSON 结构。

### i18n 模式

在原有结构中聚合多语言字段——非常适合多语言应用。在源字段旁添加目标语言字段。

```json
{
  "title": {
    "en": "Settings",
    "zh": "设置",
    "fr": "Paramètres"
  }
}
```

## 翻译接口

### 传统翻译 API

| API 类型             | 翻译质量 | 稳定性 | 免费额度                       |
| -------------------- | -------- | ------ | ------------------------------ |
| **DeepL(X)**         | ★★★★★    | ★★★★☆  | 每月 50 万字符                 |
| **Google Translate** | ★★★★☆    | ★★★★★  | 每月 50 万字符                 |
| **Azure Translate**  | ★★★★☆    | ★★★★★  | **前 12 个月** 每月 200 万字符 |
| **GTX API（免费）**  | ★★★☆☆    | ★★★☆☆  | 免费（有频率限制）             |
| **GTX Web（免费）**  | ★★★☆☆    | ★★☆☆☆  | 免费                           |

### AI 大模型

支持 **DeepSeek**、**OpenAI**、**Gemini**、**Azure OpenAI**、**Siliconflow**、**Groq**、**OpenRouter**、**Perplexity** 以及 **自定义 LLM**。

## 性能调优

两个关键参数用于优化翻译速度：

- **并发行数**：同时翻译的最大行数（默认：20）。过高可能触发速率限制。
- **上下文行数**：上下文关联翻译时每批包含的行数（默认：50）。

## 文档与部署

详细配置、API 设置和自托管说明，请参阅 **[官方文档](https://docs.newzone.top/guide/translation/json-translate/)**。

**快速部署**：[部署指南](https://docs.newzone.top/guide/translation/json-translate/deploy.html)

## 参与贡献

欢迎通过 Issue 或 Pull Request 参与贡献！

1. Fork 本仓库并创建功能分支
2. 本地执行 `yarn` 与 `yarn dev`
3. 适当补充测试/文档
4. 提交 PR 并清晰描述变更

## 许可协议

MIT © 2025 [rockbenben](https://github.com/rockbenben)。详见 [LICENSE](./LICENSE)。
