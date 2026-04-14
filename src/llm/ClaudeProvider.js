const LLMProvider = require("./LLMProvider");

/**
 * Провайдер Anthropic Claude API.
 * Использует эндпоинт https://api.anthropic.com/v1/messages.
 */
class ClaudeProvider extends LLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = "claude";
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.defaultModel =
      config.model || process.env.MODEL || "claude-sonnet-4-20250514";
    this.endpoint =
      config.endpoint || "https://api.anthropic.com/v1/messages";
    this.apiVersion = config.apiVersion || "2023-06-01";
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  async generateResponse(prompt, options = {}) {
    if (!this.apiKey) {
      console.error("[ClaudeProvider] ANTHROPIC_API_KEY не задан");
      return null;
    }

    const messages = this._normalizeMessages(prompt);
    const body = {
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens ?? 2000,
      messages,
    };
    if (options.systemPrompt) body.system = options.systemPrompt;
    if (typeof options.temperature === "number") body.temperature = options.temperature;

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": this.apiVersion,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        console.error("[ClaudeProvider] API Error:", data.error);
        return null;
      }
      return data.content?.map((i) => i.text || "").join("\n") || null;
    } catch (err) {
      console.error("[ClaudeProvider] Fetch error:", err.message);
      return null;
    }
  }
}

module.exports = ClaudeProvider;
