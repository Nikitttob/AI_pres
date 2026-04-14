const crypto = require("crypto");
const LLMProvider = require("./LLMProvider");

/**
 * Провайдер Sber GigaChat.
 *
 * Использует OAuth2-эндпойнт SberCloud для получения access-токена
 * и REST-эндпойнт /chat/completions для генерации ответов.
 *
 * Конфигурируется переменными окружения:
 *   GIGACHAT_CREDENTIALS  — base64(CLIENT_ID:CLIENT_SECRET)
 *     (или раздельно GIGACHAT_CLIENT_ID + GIGACHAT_CLIENT_SECRET)
 *   GIGACHAT_SCOPE        (default: "GIGACHAT_API_PERS")
 *   GIGACHAT_MODEL        (default: "GigaChat")
 *   GIGACHAT_AUTH_URL     (default: "https://ngw.devices.sberbank.ru:9443/api/v2/oauth")
 *   GIGACHAT_API_URL      (default: "https://gigachat.devices.sberbank.ru/api/v1")
 *   GIGACHAT_INSECURE_TLS (если "1" — отключить проверку TLS на время запросов;
 *                          по умолчанию выключено, корректно — установить корневой
 *                          сертификат "Russian Trusted Root CA" на сервере).
 */
class GigaChatProvider extends LLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = "gigachat";

    // Credentials: либо готовый base64, либо пара id/secret.
    let creds = config.credentials || process.env.GIGACHAT_CREDENTIALS || "";
    if (!creds) {
      const id = config.clientId || process.env.GIGACHAT_CLIENT_ID || "";
      const secret = config.clientSecret || process.env.GIGACHAT_CLIENT_SECRET || "";
      if (id && secret) {
        creds = Buffer.from(`${id}:${secret}`).toString("base64");
      }
    }
    this.credentials = creds;

    this.scope = config.scope || process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
    this.defaultModel = config.model || process.env.GIGACHAT_MODEL || "GigaChat";
    this.authUrl =
      config.authUrl ||
      process.env.GIGACHAT_AUTH_URL ||
      "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
    this.apiUrl =
      config.apiUrl ||
      process.env.GIGACHAT_API_URL ||
      "https://gigachat.devices.sberbank.ru/api/v1";
    this.insecureTls =
      config.insecureTls ?? process.env.GIGACHAT_INSECURE_TLS === "1";
    this.timeoutMs = config.timeoutMs ?? 60_000;

    // Кеш токена.
    this._token = null;
    this._tokenExpiresAt = 0; // ms epoch
  }

  isAvailable() {
    return Boolean(this.credentials);
  }

  /**
   * Локально оборачивает fetch с временным отключением проверки TLS,
   * если включён insecureTls (Сбер использует свой Root CA).
   */
  async _fetch(url, init = {}) {
    if (!this.insecureTls) return fetch(url, init);
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      return await fetch(url, init);
    } finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  }

  /**
   * Получает access-токен (с кешированием). Refresh за 60 с до истечения.
   */
  async _getAccessToken() {
    if (!this.credentials) return null;
    const now = Date.now();
    if (this._token && now < this._tokenExpiresAt - 60_000) {
      return this._token;
    }

    const body = new URLSearchParams({ scope: this.scope }).toString();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await this._fetch(this.authUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          RqUID: crypto.randomUUID(),
          Authorization: `Basic ${this.credentials}`,
        },
        body,
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        console.error("[GigaChatProvider] Auth error:", data);
        return null;
      }
      this._token = data.access_token;
      // expires_at у Сбера приходит в ms (UNIX epoch).
      this._tokenExpiresAt = Number(data.expires_at) || now + 25 * 60 * 1000;
      return this._token;
    } catch (err) {
      console.error("[GigaChatProvider] Auth fetch error:", err.message);
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async checkAvailability() {
    if (!this.credentials) return false;
    const token = await this._getAccessToken();
    return Boolean(token);
  }

  async generateResponse(prompt, options = {}) {
    if (!this.credentials) {
      console.error("[GigaChatProvider] GIGACHAT_CREDENTIALS не задан");
      return null;
    }
    const token = await this._getAccessToken();
    if (!token) return null;

    const messages = this._normalizeMessages(prompt);
    if (options.systemPrompt) {
      messages.unshift({ role: "system", content: options.systemPrompt });
    }

    const body = {
      model: options.model || this.defaultModel,
      messages,
      max_tokens: options.maxTokens ?? 2000,
    };
    if (typeof options.temperature === "number") body.temperature = options.temperature;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this._fetch(`${this.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[GigaChatProvider] API Error:", data);
        // Если 401 — возможно, токен протух раньше времени. Сбросим кеш.
        if (res.status === 401) {
          this._token = null;
          this._tokenExpiresAt = 0;
        }
        return null;
      }
      return data.choices?.[0]?.message?.content || null;
    } catch (err) {
      console.error("[GigaChatProvider] Fetch error:", err.message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = GigaChatProvider;
