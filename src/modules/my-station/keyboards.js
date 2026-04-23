import { ACTIONS } from "../../app/action-types.js";
import { createButtonsKeyboard, createKeyboard } from "../../ui/core-keyboards.js";

const LABEL_BACK = "Назад";
const LABEL_READY = "Готов принимать";
const LABEL_FINISH_STATION = "Завершить станцию";
const LABEL_CONFIRM_FINISH = "Да, команда прошла";
const LABEL_FORCE_FINISH = "Принудительно завершить";

export function createMyStationBackKeyboard() {
  return createButtonsKeyboard([{ label: LABEL_BACK, color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }]);
}

export function createIdleStationKeyboard() {
  return createMyStationBackKeyboard();
}

export function createPreparingStationKeyboard(teamId) {
  return createKeyboard([
    [
      {
        label: LABEL_READY,
        color: "primary",
        payload: { action: ACTIONS.STATION_READY, teamId },
      },
    ],
    [
      {
        label: LABEL_BACK,
        color: "secondary",
        payload: { action: ACTIONS.BACK_TO_ADMIN_MENU },
      },
    ],
  ]);
}

export function createActiveStationKeyboard(teamId) {
  return createKeyboard([
    [
      {
        label: LABEL_FINISH_STATION,
        color: "negative",
        payload: { action: ACTIONS.STATION_FINISH, teamId },
      },
    ],
    [
      {
        label: LABEL_BACK,
        color: "secondary",
        payload: { action: ACTIONS.BACK_TO_ADMIN_MENU },
      },
    ],
  ]);
}

export function createFinishConfirmationKeyboard(teamId) {
  return createKeyboard([
    [
      {
        label: LABEL_CONFIRM_FINISH,
        color: "negative",
        payload: { action: ACTIONS.STATION_FINISH_CONFIRM, teamId },
      },
    ],
    [
      {
        label: LABEL_BACK,
        color: "secondary",
        payload: { action: ACTIONS.STATION_FINISH_CANCEL, teamId },
      },
    ],
  ]);
}

export function createStationDeliveryFailedKeyboard(teamId) {
  return createKeyboard([
    [
      {
        label: LABEL_FINISH_STATION,
        color: "negative",
        payload: { action: ACTIONS.STATION_FINISH, teamId },
      },
    ],
    [
      {
        label: LABEL_FORCE_FINISH,
        color: "primary",
        payload: { action: ACTIONS.STATION_FORCE_FINISH, teamId },
      },
    ],
    [
      {
        label: LABEL_BACK,
        color: "secondary",
        payload: { action: ACTIONS.BACK_TO_ADMIN_MENU },
      },
    ],
  ]);
}
