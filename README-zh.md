<h1 align="center">⚡️ JSON Translate</h1>
<p align="center"><a href="./README.md">English</a> | 中文</p>
<p align="center"><em>精准翻译 JSON 数据，同时保持原有结构</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://tools.newzone.top/zh/json-translate"><img src="https://img.shields.io/badge/%E5%9C%A8%E7%BA%BF%E4%BD%93%E9%AA%8C-json--translate-blue" alt="在线体验"></a>
</p>

JsonTranslate 让 JSON 翻译更安全、更高效——仅处理字符串，不破坏任何结构。既支持传统翻译 API（Google/Azure/DeepL），也支持多种 LLM（DeepSeek、OpenAI、Azure OpenAI、Siliconflow、Groq，以及可自定义的 Custom LLM）。适用于站点/应用/数据集本地化，支持全局、JSONPath 精准、键名选择与 i18n 聚合等模式。

<p align="center">
  <em>在线体验：</em> <a href="https://tools.newzone.top/zh/json-translate">https://tools.newzone.top/zh/json-translate</a>
</p>

## 目录

- 功能特性
- 翻译模式
- 快速开始
- 使用说明
- 注意与限制
- 部署
- 参与贡献
- 许可协议

---

## 功能特性

- 多引擎支持（传统翻译）：Google Translate、Azure、DeepL(X)
- LLM 支持：DeepSeek、OpenAI、Azure OpenAI、Siliconflow、Groq，以及可自定义的 Custom LLM
- 保持 JSON 结构与顺序，仅翻译字符串值
- 灵活的翻译范围：
  - 全局翻译整份 JSON
  - 基于 JSONPath 的精准节点
  - 指定键名（简单/映射模式）
  - 从起始节点的选择性翻译
  - 聚合多语言的 i18n 模式
- 映射翻译：将结果写入不同输出键，避免覆盖原字段
- 已存在的 i18n 目标字段自动跳过，防止误覆盖
- 一次支持多个目标语言
- 具备并发与重试机制，处理大文件更稳健
- 深色模式与多语言界面

## 翻译模式

### 全局翻译

全局翻译会递归遍历整个 JSON 数据结构，对所有字符串类型的值进行翻译，同时保持原始 JSON 的层级与结构不变。

适用场景：

- 需要对整份 JSON 文件中的文本内容进行全面翻译
- 无需复杂配置，一键翻译所有内容

### 指定节点

通过 JSONPath 表达式，精准定位一个或多个节点，仅翻译这些节点中的字符串内容。支持多个路径，用英文逗号分隔。

适用场景：

- JSON 数据具有清晰的层级结构，仅需翻译特定部分
- 针对大型 JSON 文件，缩小翻译范围提高效率

### 指定键名

在此模式下，你可以指定特定的键名进行翻译。支持两种输入方式：

- **简单模式**：直接在输入框中通过逗号（中英文均可）分隔需要翻译的键名，程序会将这些键的内容进行翻译。
- **高级模式**：通过键名映射组件设置输入键与输出键的对应关系，翻译结果将写入新字段中，保留原字段不变。

适用场景：

- 仅需翻译特定字段，例如 `title`、`description` 等
- 需要将翻译结果输出到不同字段，避免覆盖原数据

注意事项：

- 键名区分大小写
- 输入键与输出键数量须一致；不存在的键会被忽略。至少需有一个有效映射才会执行
- 纯数字键可能与数组索引冲突（已缓解，但仍不推荐）
- 含点（.）的键名会被解析为嵌套路径，建议避免使用

### 选择性翻译

此模式适用于扁平结构的 JSON 数据，可指定起始节点和需要翻译的字段名称。系统会从指定节点开始，查找所有对象中的目标字段并进行翻译。

配置项：

- 起始键（可选）：指定从哪个键开始查找，适用于键顺序有意义的场景
- 待翻译字段：要翻译的具体字段名称，多个字段用逗号分隔

适用场景：

- 只需翻译扁平化结构中指定字段，如日志或错误信息的 "message" 字段
- JSON 文件结构简单，字段重复出现但需部分处理

### i18n 模式

i18n 模式专为多语言场景设计，能在原有 JSON 结构中聚合多语言的字段内容。适合用于构建多语言网站或应用的翻译文件，或管理统一结构下的多语言配置。

工作原理

- 使用选择的源语言作为源字段，比如源语言为 `zh`，源字段就是 `zh`。当源语言为 `auto` 时，源字段默认视为 `en`
- 遍历 JSON 中所有包含源语言字段的对象，为每个对象新增目标语言字段（与源语言字段同级）
- 若目标语言字段已存在，则跳过翻译，避免覆盖已有内容
- 当同时启用 i18n 与多语言模式时，系统会创建包含源语言和所有目标语言的统一 JSON 结构，适合国际化项目

示例

```jsonc
{
  "title": {
    "en": "Settings"
  }
}
```

目标语言设定为 `zh`、`fr`，翻译结果：

```jsonc
{
  "title": {
    "en": "Settings",
    "zh": "设置",
    "fr": "Paramètres"
  }
}
```

## 使用说明

### 映射翻译

在“指定键名”模式下，你可以在结果区切换“单一键名/映射翻译”。单一键名表示输入输出为同一节点；映射翻译表示将结果写入不同节点（例如 A → B、C → D）。

![映射翻译示例](https://img.newzone.top/2023-12-19-11-42-37.png?imageMogr2/format/webp)

### 关于 JSON 键名

JSON 以键值对存储数据，键用于唯一标识元素，便于精准定位。

示例说明：

- `downvote.message`：嵌套键名。`downvote` 为顶层对象，`message` 为其内部键
- `提示词.message`：`提示词` 为对象，内部包含键 `message`
- `share.owner`：键名包含点，但它是一个“完整键名”而非嵌套路径；若 `share.owner` 为完整键名，`share.owner.name` 的写法是不正确的

```jsonc
{
  "downvote": {
    "message": "Downvote"
  },
  "提示词": {
    "message": "prompt"
  },
  "share.owner": {
    "name": "rabbit"
  },
  "data": {
    "title": {
      "id": "001",
      "name": "cabbages"
    }
  },
  "content": [
    {
      "id": "001",
      "value": "Hello, cabbage."
    },
    {
      "id": "002",
      "value": "Hello, Radish."
    }
  ]
}
```

注意：包含点（`.`）的键名目前不被支持，因为 JSONPath 使用点来区分层级，可能被误解为嵌套路径。建议使用不含点的键名。

## 快速开始

环境要求：

- Node.js >= 18.18
- Yarn 1.x

```bash
# 安装依赖
yarn

# 本地开发
yarn dev

# 构建并启动
yarn build && yarn start

# 单一语言构建
yarn build:lang en
yarn build:lang zh
yarn build:lang zh-hant
```

打开 http://localhost:3000 开始使用。你可以编辑 `src/app/[locale]/page.tsx`，开发模式下会自动热更新。

## 参与贡献

欢迎通过 Issue 或 Pull Request 参与贡献。

建议流程：

1. Fork 本仓库并创建功能分支
2. 本地执行 `yarn` 与 `yarn dev`
3. 适当补充测试/文档
4. 提交 PR 并清晰描述变更

## 许可协议

MIT © 2025 <a href="https://github.com/rockbenben">rockbenben</a>。详见 [LICENSE](./LICENSE)。
