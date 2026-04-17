import { ACTIONS } from "../../app/action-types.js";
import { createBackKeyboard, createKeyboard } from "../../ui/core-keyboards.js";

export function createWhoAreYouKeyboard() {
  return createKeyboard([
    [{ label: "Участник", color: "primary" }],
    [{ label: "Организатор", color: "primary" }],
  ]);
}

export function createParticipantKeyboard() {
  return createKeyboard([[{ label: "Перепутал, я организатор", color: "secondary" }]]);
}

export function createParticipantTeamKeyboard(teams = []) {
  const rows = teams.map((team) => [
    {
      label: team.team_name,
      color: "primary",
      payload: {
        action: ACTIONS.PARTICIPANT_TEAM_SELECT,
        teamId: team.id,
      },
    },
  ]);

  rows.push([{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_WHO_ARE_YOU } }]);
  return createKeyboard(rows);
}

export function createAdminStationKeyboard(stations = []) {
  const rows = [[{ label: "Войти как админ", color: "positive" }]];

  for (const stationName of stations) {
    rows.push([{ label: stationName, color: "primary" }]);
  }

  return createKeyboard(rows);
}
