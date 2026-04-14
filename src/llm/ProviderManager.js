const ClaudeProvider = require("./ClaudeProvider");
const OllamaProvider = require("./OllamaProvider");
const GigaChatProvider = require("./GigaChatProvider");

/**
 * Менеджер LLM-провайдеров с автоматическим fallback.
 *
 * Выбор основного провайдера — через переменную LLM_PROVIDER
 * (или опцию opts.primary). Если основной недоступен / вернул null,
 * менеджер последовательно перебирает резервные.
 *
 * Использует контракт LLMProvider: generateResponse(messages, options)
 * + асинхронный checkAvailability() для реальной проверки живости.
 */
class ProviderManager {
  constructor(opts = {}) {
    this.primaryName = (
      opts.primary ||
      process.env.LLM_PROVIDER ||
      "claude"
    ).toLowerCase();

    this.providers = opts.providers || {
      claude: new ClaudeProvider(opts.claude || {}),
      ollama: new OllamaProvider(opts.ollama || {}),
      gigachat: new GigaChatProvider(opts.gigachat || {}),
    };

    this._cache = new Map(); // name → { ok, ts }
    this._cacheTtlMs = opts.cacheTtlMs ?? 30_000;
  }

  _order() {
    const names = Object.keys(this.providers);
    const order = [this.primaryName, ...names.filter((n) => n !== this.primaryName)];
    return order.filter((n) => this.providers[n]);
  }

  async _checkCached(name) {
    const cached = this._cache.get(name);
    if (cached && Date.now() - cached.ts < this._cacheTtlMs) return cached.ok;
    const ok = await this.providers[name].checkAvailability();
    this._cache.set(name, { ok, ts: Date.now() });
    return ok;
  }

  /**
   * Вызывает первый доступный провайдер. Возвращает { answer, provider }.
   * Если все недоступны — { answer: null, provider: null }.
   */
  async generateResponse(prompt, options = {}) {
    for (const name of this._order()) {
      const provider = this.providers[name];
      const ok = await this._checkCached(name);
      if (!ok) {
        console.warn(`[ProviderManager] ${name} недоступен, пробуем следующий...`);
        continue;
      }
      const answer = await provider.generateResponse(prompt, options);
      if (answer) {
        if (name !== this.primaryName) {
          console.log(`[ProviderManager] Fallback: ответ получен от ${name}`);
        }
        return { answer, provider: name };
      }
      // Провайдер был доступен, но генерация не удалась — сбрасываем кеш.
      this._cache.delete(name);
      console.warn(`[ProviderManager] ${name} не вернул ответ, fallback...`);
    }
    return { answer: null, provider: null };
  }

  /**
   * Динамически переключает primary-провайдера. Сбрасывает кеш живости,
   * чтобы новый primary был проверен немедленно. Бросает, если имя
   * неизвестно.
   * @param {string} name
   * @returns {string} нормализованное имя нового primary
   */
  setPrimary(name) {
    const key = String(name || "").toLowerCase();
    if (!this.providers[key]) {
      const known = Object.keys(this.providers).join(", ");
      throw new Error(`Неизвестный провайдер: "${name}". Доступные: ${known}`);
    }
    this.primaryName = key;
    this._cache.clear();
    return key;
  }

  /**
   * Текущий статус всех провайдеров + имя primary.
   * @returns {Promise<{[name:string]: boolean, primary: string}>}
   */
  async status() {
    const out = {};
    for (const name of Object.keys(this.providers)) {
      out[name] = await this.providers[name].checkAvailability();
    }
    out.primary = this.primaryName;
    return out;
  }
}

module.exports = ProviderManager;
