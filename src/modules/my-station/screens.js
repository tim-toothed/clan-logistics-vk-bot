import { createAdminMenuKeyboard } from "../admin-home/keyboards.js";
import { createActiveStationKeyboard, createMyStationBackKeyboard, createMyStationTeamsKeyboard } from "./keyboards.js";

export async function sendMyStationUnavailableScreen(vk, peerId) {
  await vk.sendText(
    peerId,
    'Этот раздел доступен только организатору, привязанному к станции. Если станции ещё не назначены, используйте "Станции и команды" или войдите заново.',
    {
      keyboard: createAdminMenuKeyboard(),
    },
  );
}

export async function sendMyStationMenuScreen(vk, peerId, teams) {
  if (!teams.length) {
    await vk.sendText(peerId, "Готовы начать станцию? Сейчас нет доступных команд для этой станции.", {
      keyboard: createMyStationBackKeyboard(),
    });
    return;
  }

  await vk.sendText(peerId, "Готовы начать станцию? Какая команда к вам пришла?", {
    keyboard: createMyStationTeamsKeyboard(teams),
  });
}

export async function sendActiveStationScreen(vk, peerId, teamName, teamId) {
  await vk.sendText(
    peerId,
    `Вы ведете станцию для команды ${teamName}. Не забудьте нажать "Завершить станцию", когда закончите - иначе участники заблудятся.`,
    {
      keyboard: createActiveStationKeyboard(teamId),
    },
  );
}
