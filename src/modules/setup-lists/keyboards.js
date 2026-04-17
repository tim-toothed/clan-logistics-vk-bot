import { createBackKeyboard, createKeyboard } from "../../ui/core-keyboards.js";

export function createStationsTeamsKeyboard() {
  return createKeyboard([
    [{ label: "Команды", color: "primary" }],
    [{ label: "Станции", color: "primary" }],
    [{ label: "Назад", color: "secondary" }],
  ]);
}
