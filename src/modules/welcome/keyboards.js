import { ACTIONS } from "../../app/action-types.js";
import { createButtonsKeyboard, createKeyboard } from "../../ui/core-keyboards.js";

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
  const buttons = teams.map((team) => ({
    label: team.team_name,
    color: "primary",
    payload: {
      action: ACTIONS.PARTICIPANT_TEAM_SELECT,
      teamId: team.id,
    },
  }));

  buttons.push({ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_WHO_ARE_YOU } });

  return createButtonsKeyboard(buttons);
}

export function createAdminStationKeyboard(stations = []) {
  const buttons = [
    { label: "Войти как админ", color: "positive" },
    ...stations.map((stationName) => ({
      label: stationName,
      color: "primary",
    })),
  ];

  return createButtonsKeyboard(buttons);
}
