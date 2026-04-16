import { handleDefaultMessage } from "./commands/default.js";
import { handleHelpCommand } from "./commands/help.js";
import { handleStartCommand } from "./commands/start.js";

const commandMap = {
  start: {
    handleCommand: handleStartCommand,
  },
  help: {
    handleCommand: handleHelpCommand,
  },
  default: {
    handleTextMessage: handleDefaultMessage,
  },
};

export default commandMap;
