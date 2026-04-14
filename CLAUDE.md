# AI-ассистент для департамента ЖКХ

## Стек
- Node.js + Express
- Telegram Bot API
- RAG (retrieval-augmented generation) на JSON-базах
- Деплой: Railway

## Структура
- /src — основной код сервера (llm/, rag/, middleware/)
- /data — RAG-базы знаний (JSON, ~171 Q&A запись)
- /bot — логика Telegram-бота (inline keyboards, история диалогов, переключение режимов)
- /tests — Jest-тесты

## Режимы бота
1. ЖКХ и Право
2. Экономика
3. Путешествия
4. Анализ рынка
5. Презентации

## Ограничения
- НЕ загружать внутренние банковские данные в API
- Код должен поддерживать переключение между Claude API / Ollama / GigaChat (через ProviderManager)
