<h1 align="center">⚡️ JSON Translate</h1>
<p align="center">English | <a href="./README-zh.md">中文</a></p>
<p align="center"><em>Precise JSON translation — values only, structure intact, i18n made simple</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://tools.newzone.top/en/json-translate"><img src="https://img.shields.io/badge/Live%20Demo-json--translate-blue" alt="Live Demo"></a>
</p>

**JSON Translate** translates JSON safely and fast—it only touches string values and never breaks your schema. It works with popular translation APIs (Google/Azure/DeepL) and modern LLMs (DeepSeek, OpenAI, Gemini, Azure OpenAI, Siliconflow, Groq, OpenRouter, Perplexity, or Custom LLM). Use it to localize apps, sites, and datasets with **global**, **JSONPath-targeted**, **key-based**, or **i18n aggregation** modes.

👉 **Try it online**: <https://tools.newzone.top/en/json-translate>

## Key Features

- **Preserve JSON Schema**: Translate only string values; keep structure and order intact.
- **High-Performance Caching (IndexedDB)**: Stores translation results with **unlimited capacity**—no browser storage limits.
- **Multiple Translation Providers**: Google, Azure, DeepL(X), plus 9 LLM models.
- **Flexible Scopes**: Global, JSONPath-targeted, specific keys, selective start node, and i18n mode.
- **Mapped Translation**: Write results to different output keys without overwriting originals.
- **Multi-language Output**: Translate into multiple target languages in one pass.
- **Dark Mode & Multi-locale UI**: Full internationalization support.

## Translation Modes

### Global Translation

Recursively translates all string values in the entire JSON while preserving hierarchy.

### Targeted Nodes (JSONPath)

Use JSONPath expressions to precisely locate and translate specific nodes. Multiple paths can be comma-separated.

### Specific Keys

Translate only specified key names:

- **Simple Mode**: Comma-separated key names.
- **Advanced Mode**: Define input-output key mappings; translations written to new keys.

### Selective Translation

Specify a starting node and target field names for flat JSON structures.

### i18n Mode

Aggregates translations under the same structure—perfect for multilingual apps. Adds new language fields alongside the source field.

```json
{
  "title": {
    "en": "Settings",
    "zh": "设置",
    "fr": "Paramètres"
  }
}
```

## Translation APIs

### Traditional APIs

| API                  | Quality | Stability | Free Tier                        |
| -------------------- | ------- | --------- | -------------------------------- |
| **DeepL (X)**        | ★★★★★   | ★★★★☆     | 500K chars/month                 |
| **Google Translate** | ★★★★☆   | ★★★★★     | 500K chars/month                 |
| **Azure Translate**  | ★★★★☆   | ★★★★★     | 2M chars/month (first 12 months) |
| **GTX API (Free)**   | ★★★☆☆   | ★★★☆☆     | Free (rate-limited)              |
| **GTX Web (Free)**   | ★★★☆☆   | ★★☆☆☆     | Free                             |

### LLM Models

Supports **DeepSeek**, **OpenAI**, **Gemini**, **Azure OpenAI**, **Siliconflow**, **Groq**, **OpenRouter**, **Perplexity**, and **Custom LLM**.

## Performance Tuning

Two key parameters for optimizing translation speed:

- **Concurrent Lines**: Maximum lines translated simultaneously (default: 20). Too high may trigger rate limits.
- **Context Lines**: Lines included per batch for context-aware translation (default: 50).

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
