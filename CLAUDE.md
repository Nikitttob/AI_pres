# AI-ассистент для департамента ЖКХ

## Стек
- Node.js + Express
- Telegram Bot API (node-telegram-bot-api)
- RAG (retrieval-augmented generation) на JSON-базах
- LLM-провайдеры: Claude API / Ollama / GigaChat (с fallback)
- Деплой: Railway

## Структура
```
.
├── server.js                  # Express-сервер, точка входа
├── bot/                       # Telegram-бот (модульная архитектура)
│   ├── index.js               # Точка входа бота, регистрация команд
│   ├── modes.js               # Конфигурация 5 режимов (systemPrompt, examples, subModes)
│   ├── keyboards.js           # Inline-клавиатуры Telegram
│   ├── state.js               # In-memory состояние (режим + история по chatId)
│   ├── handlers/              # Per-mode хендлеры (фабрика createRagHandler)
│   │   ├── base.js            # Базовая фабрика RAG-хендлера
│   │   ├── index.js           # Реестр хендлеров
│   │   └── zhkh.js, economics.js, travel.js, market.js, presentation.js
│   └── middleware/
│       ├── logger.js          # Логирование входящих событий
│       └── errorHandler.js    # Глобальные обработчики ошибок бота
├── src/
│   ├── llm/                   # Абстракция LLM-провайдеров
│   │   ├── LLMProvider.js     # Базовый абстрактный класс
│   │   ├── ClaudeProvider.js  # Anthropic Claude API
│   │   ├── OllamaProvider.js  # Локальный Ollama
│   │   ├── GigaChatProvider.js# Sber GigaChat
│   │   ├── ProviderManager.js # Fallback-менеджер
│   │   └── index.js           # Фабрики и реестр
│   ├── rag/
│   │   └── search.js          # Лексический поиск по KB (tokenize + scoring)
│   ├── routes/
│   │   └── knowledge.js       # REST API админ-панели (/api/knowledge/*)
│   └── middleware/
│       └── rateLimit.js       # In-memory rate limiter
├── kb*.json                   # 5 баз знаний (RAG, ~171 Q&A запись)
├── index.html                 # Веб-интерфейс чата
├── admin.html                 # Админ-панель управления базами знаний
├── tests/                     # Jest-тесты (kb, llm, rag)
├── .env.example               # Шаблон переменных окружения
├── .claudeignore              # Исключения для Claude Code
└── railway.json               # Конфиг деплоя Railway
```

## Режимы бота
1. ЖКХ и Право
2. Экономика
3. Путешествия
4. Анализ рынка
5. Презентации

## Текущие задачи
- Валидация и ограничение history в /api/chat
- Персистентность состояния Telegram-бота
- Аналитический дашборд
- Улучшение RAG-поиска (fuse.js)
- Переход Telegram-бота на webhook

## Ограничения
- НЕ загружать внутренние банковские данные в API
- Код должен поддерживать переключение между Claude API / Ollama / GigaChat
