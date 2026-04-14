const ClaudeProvider = require("./ClaudeProvider");
const OllamaProvider = require("./OllamaProvider");

// ═══════════════════════════════════════════════
// Менеджер LLM-провайдеров с fallback
// ═══════════════════════════════════════════════
// Выбирает основной провайдер по переменной LLM_PROVIDER
// (ollama | claude). Если основной недоступен — автоматически
// переключается на резервный.

class ProviderManager {
  constructor(config = {}) {
    this.primaryName = (config.primary || process.env.LLM_PROVIDER || "claude").toLowerCase();
    this.providers = {
      claude: new ClaudeProvider(config.claude || {}),
      ollama: new OllamaProvider(config.ollama || {}),
    };
    this._availabilityCache = new Map();
    this._cacheTtl = 30_000; // 30 секунд
  }

  _getOrder() {
    // Основной провайдер + остальные как fallback
    const order = [this.primaryName];
    for (const name of Object.keys(this.providers)) {
      if (!order.includes(name)) order.push(name);
    }
    return order.filter((n) => this.providers[n]);
  }

  async _checkAvailable(name) {
    const cached = this._availabilityCache.get(name);
    if (cached && Date.now() - cached.ts < this._cacheTtl) {
      return cached.ok;
    }
    const ok = await this.providers[name].isAvailable();
    this._availabilityCache.set(name, { ok, ts: Date.now() });
    return ok;
  }

  /**
   * Вызывает первый доступный провайдер из цепочки.
   * Если основной недоступен — fallback на следующий.
   */
  async generate(systemPrompt, messages) {
    const order = this._getOrder();
    let lastError = null;

    for (const name of order) {
      const provider = this.providers[name];
      const available = await this._checkAvailable(name);
      if (!available) {
        console.warn(`[ProviderManager] ${name} недоступен, пробуем следующий...`);
        continue;
      }

      const answer = await provider.generate(systemPrompt, messages);
      if (answer) {
        if (name !== this.primaryName) {
          console.log(`[ProviderManager] Fallback: ответ получен от ${name}`);
        }
        return { answer, provider: name };
      }

      // Провайдер был доступен, но генерация вернула null — сбросим кэш
      this._availabilityCache.delete(name);
      lastError = `${name} не вернул ответ`;
      console.warn(`[ProviderManager] ${name} не вернул ответ, fallback...`);
    }

    if (lastError) console.error(`[ProviderManager] Все провайдеры исчерпаны: ${lastError}`);
    return { answer: null, provider: null };
  }

  async status() {
    const out = {};
    for (const name of Object.keys(this.providers)) {
      out[name] = await this.providers[name].isAvailable();
    }
    out.primary = this.primaryName;
    return out;
  }
}

module.exports = { ProviderManager, ClaudeProvider, OllamaProvider };
