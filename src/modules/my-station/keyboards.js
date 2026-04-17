import { ACTIONS } from "../../app/action-types.js";
import { createButtonsKeyboard, createKeyboard } from "../../ui/core-keyboards.js";

export function createMyStationBackKeyboard() {
  return createButtonsKeyboard([{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }]);
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
      label: "Назад",
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
        label: "Завершить станцию",
        color: "negative",
        payload: { action: ACTIONS.STATION_FINISH, teamId },
      },
    ],
  ]);
}
