import { ACTIONS } from "../../app/action-types.js";
import { createButtonsKeyboard, createKeyboard } from "../../ui/core-keyboards.js";

const LABEL_BACK = "\u041d\u0430\u0437\u0430\u0434";
const LABEL_FINISH_STATION = "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0441\u0442\u0430\u043d\u0446\u0438\u044e";
const LABEL_FORCE_FINISH = "\u041f\u0440\u0438\u043d\u0443\u0434\u0438\u0442\u0435\u043b\u044c\u043d\u043e \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c";

export function createMyStationBackKeyboard() {
  return createButtonsKeyboard([{ label: LABEL_BACK, color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }]);
}

export function createMyStationTeamsKeyboard(teams, options = {}) {
  const buttons = teams.map((team) => ({
    label: team.team_name,
    color: "primary",
    payload: {
      action: ACTIONS.STATION_TEAM_SELECT,
      teamId: team.id,
    },
  }));

  if (options.includeBack !== false) {
    buttons.push({
      label: LABEL_BACK,
      color: "secondary",
      payload: { action: ACTIONS.BACK_TO_ADMIN_MENU },
    });
  }

  return createButtonsKeyboard(buttons);
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
