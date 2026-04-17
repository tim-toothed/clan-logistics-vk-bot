import { createStationsTeamsKeyboard } from "./keyboards.js";
import { createBackKeyboard } from "../../ui/core-keyboards.js";

export async function sendStationsTeamsMenuScreen(vk, peerId) {
  await vk.sendText(peerId, "Какой раздел вы хотите редактировать?", {
    keyboard: createStationsTeamsKeyboard(),
  });
}

export async function sendTeamsEditPromptScreen(vk, peerId, currentTeams) {
  await vk.sendText(
    peerId,
    `Впишите новый список команд. Текущий список команд:\n${currentTeams}\n\nФормат:\n1. text\n2. text\n3. ...`,
    {
      keyboard: createBackKeyboard(),
    },
  );
}

export async function sendStationsEditPromptScreen(vk, peerId, currentStations) {
  await vk.sendText(
    peerId,
    `Впишите новый список станций. Текущий список станций:\n${currentStations}\n\nФормат:\n1. text\n2. text\n3. ...`,
    {
      keyboard: createBackKeyboard(),
    },
  );
}

export async function sendInvalidListFormatScreen(vk, peerId) {
  await vk.sendText(peerId, "Некорректный формат списка. Попробуйте ещё раз", {
    keyboard: createBackKeyboard(),
  });
}

export async function sendTeamsUpdatedScreen(vk, peerId, listText) {
  await vk.sendText(peerId, `Список команд обновлён.\n\nТекущий список команд:\n${listText}`, {
    keyboard: createStationsTeamsKeyboard(),
  });
}

export async function sendStationsUpdatedScreen(vk, peerId, listText) {
  await vk.sendText(peerId, `Список станций обновлён.\n\nТекущий список станций:\n${listText}`, {
    keyboard: createStationsTeamsKeyboard(),
  });
}
