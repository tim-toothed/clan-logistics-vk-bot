function createRichTextButton(button) {
  const normalizedLabel = normalizeVkButtonLabel(button.label);

  return {
    action: {
      type: "text",
      label: normalizedLabel,
      payload: JSON.stringify(button.payload ?? { label: normalizedLabel }),
    },
    color: button.color ?? "secondary",
  };
}

export function createKeyboard(rows, options = {}) {
  const { oneTime = false, inline = false } = options;

  return {
    one_time: oneTime,
    inline,
    buttons: rows.map((row) => row.map((button) => createRichTextButton(button))),
  };
}

export function createSingleButtonKeyboard(label, color = "secondary", payload = null) {
  return createKeyboard([[{ label, color, payload }]]);
}

export function createButtonsKeyboard(buttons, options = {}) {
  const rows = buttons.map((button) => [button]);
  return createKeyboard(rows, options);
}

export function createBackKeyboard() {
  return createKeyboard([[{ label: "Назад", color: "secondary" }]], { oneTime: true });
}

function normalizeVkButtonLabel(label) {
  const normalizedLabel = String(label ?? "").trim() || "Кнопка";
  const characters = Array.from(normalizedLabel);

  if (characters.length <= 40) {
    return normalizedLabel;
  }

  return `${characters.slice(0, 37).join("").trimEnd()}...`;
}
