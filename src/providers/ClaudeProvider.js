const BaseProvider = require("./BaseProvider");

// ═══════════════════════════════════════════════
// Провайдер Claude API (Anthropic)
// ═══════════════════════════════════════════════
class ClaudeProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = "claude";
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = config.model || process.env.MODEL || "claude-sonnet-4-20250514";
    this.maxTokens = config.maxTokens || 2000;
    this.endpoint = "https://api.anthropic.com/v1/messages";
  }

  async isAvailable() {
    return !!this.apiKey;
  }

  async generate(systemPrompt, messages) {
    if (!this.apiKey) return null;

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages,
        }),
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
