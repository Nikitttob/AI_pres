# AI-мультиассистент

Мультирежимный AI-ассистент (ЖКХ, Экономика, Путешествия, Анализ рынка,
Презентации) с поддержкой Telegram-бота, RAG по JSON-базам знаний и
переключаемыми LLM-провайдерами: **Claude API** и **Ollama**.

## Стек

- Node.js ≥ 18 + Express
- Telegram Bot API
- RAG на JSON-базах (`kb_*.json`)
- LLM-провайдеры: Anthropic Claude, Ollama (локальный)
- Деплой: Railway

## Режимы

1. ЖКХ и Право
2. Экономика
3. Путешествия
4. Анализ рынка
5. Презентации

## Установка

```bash
npm install
cp .env.example .env
# отредактируйте .env, заполнив ANTHROPIC_API_KEY и/или OLLAMA_*
npm start
```

Сервер поднимется на `http://localhost:3000`.

## LLM-провайдеры и fallback

Основной провайдер задаётся переменной `LLM_PROVIDER` (`claude` или
`ollama`). Если основной недоступен — менеджер автоматически
переключается на резервный.

Статус провайдеров можно посмотреть в `GET /health`:

```json
{
  "status": "ok",
  "providers": { "claude": true, "ollama": false, "primary": "claude" }
}
```

## Запуск с Ollama

[Ollama](https://ollama.com) — локальный сервер LLM. Работает
офлайн, не требует API-ключей и не отправляет данные в облако
(важно для работы с внутренними данными).

### 1. Установите Ollama

- **macOS / Windows:** скачайте установщик с <https://ollama.com/download>
- **Linux:** `curl -fsSL https://ollama.com/install.sh | sh`

### 2. Запустите сервер Ollama

```bash
ollama serve
```

По умолчанию слушает `http://127.0.0.1:11434`.

### 3. Скачайте модель

```bash
# Быстрая универсальная модель
ollama pull llama3

# Или более качественная (если хватает RAM/VRAM)
ollama pull llama3.1:8b
ollama pull qwen2.5:7b
```

### 4. Настройте `.env`

```env
LLM_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
# Claude можно оставить как fallback:
ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Запустите приложение

```bash
npm start
```

Если Ollama-сервер недоступен в момент запроса (не запущен, модель не
загружена, таймаут) — сервер автоматически переключится на Claude API
при наличии `ANTHROPIC_API_KEY`. Сценарий в логах:

```
[ProviderManager] ollama недоступен, пробуем следующий...
[ProviderManager] Fallback: ответ получен от claude
```

### Удалённый Ollama

Если Ollama развёрнута на отдельной машине:

```env
OLLAMA_HOST=http://192.168.1.10:11434
OLLAMA_MODEL=llama3.1:8b
```

Убедитесь, что Ollama слушает на внешнем интерфейсе
(`OLLAMA_HOST=0.0.0.0 ollama serve`).

## Структура

```
.
├── server.js                     # Express + Telegram-бот
├── src/
│   └── providers/
│       ├── BaseProvider.js       # абстрактный класс
│       ├── ClaudeProvider.js     # Anthropic Claude
│       ├── OllamaProvider.js     # локальный Ollama
│       └── index.js              # ProviderManager + fallback
├── kb_*.json                     # базы знаний для RAG
├── index.html                    # веб-интерфейс
└── .env.example
```

## Добавление нового провайдера

1. Создайте класс, наследующий `BaseProvider`, в `src/providers/`.
2. Реализуйте `isAvailable()` и `generate(systemPrompt, messages)`.
3. Зарегистрируйте его в `ProviderManager` (`src/providers/index.js`).

## Ограничения

- Не загружайте внутренние/конфиденциальные данные через Claude API.
  Для таких сценариев используйте локальный Ollama.
- Качество ответов в режиме Ollama напрямую зависит от выбранной модели.
