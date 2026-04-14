// Хендлер режима «ЖКХ и Право»
const { MODES } = require("../modes");
const { createRagHandler } = require("./_base");

const config = MODES.zhkh;

module.exports = {
  id: config.id,
  config,
  build: (deps) => createRagHandler(config, deps),
};
