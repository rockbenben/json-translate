<h1 align="center">⚡️ JSON Translate</h1>
<p align="center">English | <a href="./README-zh.md">中文</a></p>
<p align="center"><em>Precise JSON translation — values only, structure intact, i18n made simple</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://tools.newzone.top/en/json-translate"><img src="https://img.shields.io/badge/Live%20Demo-json--translate-blue" alt="Live Demo"></a>
</p>

**JSON Translate** translates JSON safely and fast — it only touches string values and never breaks your schema. It works with 7 traditional translation APIs (DeepL, Google, Azure, DeepLX, Qwen-MT, TranslateGemma, GTX) and 17+ LLM providers (DeepSeek, OpenAI, Claude, Gemini, plus the catch-all Custom OpenAI-compatible endpoint). Use it to localize apps, sites, and datasets with **global**, **JSONPath-targeted**, **key-based**, **selective**, or **i18n aggregation** modes.

👉 **Try it online**: <https://tools.newzone.top/en/json-translate>

![JSON Translate workflow demo](https://img.newzone.top/2023-12-18-16-09-04.gif?imageMogr2/format/webp "JSON Translate workflow")

## Key Features

- **Schema-Preserving**: Translate only string values; structure, key order, and types stay intact.
- **5 Translation Modes**: Global, JSONPath-targeted, specific keys, selective start node, and i18n aggregation.
- **Mapped Translation**: Write results to different output keys (e.g. `name` → `name_zh`) without overwriting originals.
- **Multi-Language Output**: Translate into multiple target languages in one pass; each language exports as its own file or aggregates inline.
- **Unlimited Caching** (IndexedDB): All results cached locally with no browser-storage size limit.
- **Context-Aware Translation** (LLM only): Surrounding lines included in each request for better coherence and terminology consistency.
- **Multi-Locale UI**: Powered by next-intl, with full UI translation across 18 languages.
- **Dark Mode**: Built-in theme switching.

## Translation Modes

### Global Translation

Recursively translates every string value in the JSON while preserving hierarchy. Best for translating an entire file in one go.

### Targeted Nodes (JSONPath)

Use JSONPath expressions to pinpoint specific nodes; multiple paths can be comma-separated. Best for large files where only a subset needs translation.

### Specific Keys

Translate only specified key names:

- **Simple Mode**: comma-separated key names
- **Advanced Mode**: define input → output key mappings; translations are written to new keys, originals preserved

Keys are case-sensitive. Avoid dot-containing keys — they conflict with JSONPath nesting syntax.

### Selective Translation

For flat structures: specify a starting key (optional) and the field names to translate. The tool walks every object from the start key onward and translates the named fields.

### i18n Mode

Aggregates per-language translations under the same structure — perfect for multilingual i18n message files.

```json
// Source: 'en' is the source language
{ "title": { "en": "Settings" } }
```

Translating to `zh` and `fr`:

```json
{
  "title": {
    "en": "Settings",
    "zh": "设置",
    "fr": "Paramètres"
  }
}
```

Existing target-language fields are skipped (won't overwrite). When combined with Multi-Language Output, the result is a unified JSON containing the source and every target language.

## Translation APIs

### Traditional APIs

| API                  | Quality | Stability | Free Tier                             |
| -------------------- | ------- | --------- | ------------------------------------- |
| **DeepL**            | ★★★★★   | ★★★★☆     | 500K chars/month                      |
| **Google Translate** | ★★★★☆   | ★★★★★     | 500K chars/month                      |
| **Azure Translate**  | ★★★★☆   | ★★★★★     | 2M chars/month (first 12 months)      |
| **DeepLX (Free)**    | ★★★★☆   | ★★★☆☆     | Self-host or free public endpoints    |
| **Qwen-MT**          | ★★★★☆   | ★★★★☆     | Alibaba DashScope quota               |
| **TranslateGemma**   | ★★★★☆   | ★★★★☆     | Self-host (LM Studio / Ollama / etc.) |
| **GTX API (Free)**   | ★★★☆☆   | ★★★☆☆     | Free (rate-limited)                   |

### LLM Providers

Supports **DeepSeek**, **OpenAI**, **Claude**, **Gemini**, **Qwen**, **Moonshot**, **Doubao**, **Zhipu GLM**, **MiniMax**, **Mistral**, **Perplexity**, **Cohere**, **OpenRouter**, **Groq**, **SiliconFlow**, **Nvidia NIM**, **Azure OpenAI**, plus any **Custom (OpenAI-compatible)** endpoint (Ollama / LM Studio / vLLM / Together AI / Fireworks AI etc.). Each provider has a configurable model list, temperature, system / user prompts, and per-request thinking-mode toggle.

## Context-Aware Translation (LLM only)

LLM modes can send surrounding lines as context for each batch, improving paragraph-level coherence and terminology consistency.

- **Concurrent Lines**: max lines translated in parallel (default 20). Too high triggers rate limits.
- **Context Lines**: lines included per batch as context (default 50). Higher = better coherence but more tokens.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router) + React 19 with the React Compiler
- **UI**: [Ant Design 6](https://ant.design/) + [Tailwind CSS 4](https://tailwindcss.com/)
- **i18n**: [next-intl](https://next-intl-docs.vercel.app/)
- **Caching**: [idb](https://github.com/jakearchibald/idb) (IndexedDB)
- **JSONPath**: [jsonpath-plus](https://github.com/JSONPath-Plus/JSONPath)

## Getting Started

### Requirements

- Node.js >= 20.9.0
- Yarn (recommended), npm, or pnpm

### Install & Run

```bash
git clone https://github.com/rockbenben/json-translate.git
cd json-translate

yarn install
yarn dev
```

Visit [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
yarn build
```

## Documentation & Deployment

For detailed configuration, API setup, and self-hosting instructions, see the **[Official Documentation](https://docs.newzone.top/en/guide/translation/json-translate/)**.

**Quick Deployment**: [Deploy Guide](https://docs.newzone.top/en/guide/translation/json-translate/deploy.html)

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

1. Fork the repo and create a feature branch
2. Run `yarn` and `yarn dev` locally
3. Add tests/docs when applicable
4. Submit a PR with a clear description

## License

MIT © 2025 [rockbenben](https://github.com/rockbenben). See [LICENSE](./LICENSE).
