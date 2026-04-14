// ═══════════════════════════════════════════════
// Inline-клавиатуры для Telegram-бота
// ═══════════════════════════════════════════════
const { MODES } = require("./modes");

function modeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "⚖️ ЖКХ и Право", callback_data: "mode:zhkh" },
        { text: "📊 Экономика", callback_data: "mode:economics" }
      ],
      [
        { text: "✈️ Путешествия", callback_data: "mode:travel" },
        { text: "📈 Анализ рынка", callback_data: "mode:market" }
      ],
      [
        { text: "🎯 Презентации", callback_data: "mode:presentation" }
      ]
    ]
  };
}

function afterAnswerKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🔄 Сменить режим", callback_data: "action:modes" },
        { text: "🧹 Очистить историю", callback_data: "action:clear" }
      ],
      [
        { text: "💡 Примеры вопросов", callback_data: "action:examples" },
        { text: "🧠 Память", callback_data: "action:memory" }
      ]
    ]
  };
}

function examplesKeyboard(modeId) {
  const mode = MODES[modeId] || MODES.zhkh;
  return {
    inline_keyboard: mode.examples.map(ex => [
      { text: ex, callback_data: "ask:" + ex.slice(0, 60) }
    ])
  };
}

module.exports = { modeKeyboard, afterAnswerKeyboard, examplesKeyboard };
