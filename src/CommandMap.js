import { handleDefaultMessage } from "./commands/default.js";
import { handleHelpCommand } from "./commands/help.js";
import { handleStartCommand } from "./commands/start.js";

const commandMap = {
  help: handleHelpCommand,
  start: handleStartCommand,
};

export async function dispatchVkCommand({ event, vk, env }) {
  const commandHandler = commandMap[event.rawCommand] ?? handleDefaultMessage;

  await commandHandler({ event, vk, env });
}

export { commandMap };
