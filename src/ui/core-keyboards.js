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
  const { columns, multiColumnThreshold, layoutCount, ...keyboardOptions } = options;
  const rows = layoutMenuButtons(buttons, { columns, multiColumnThreshold, layoutCount });
  return createKeyboard(rows, keyboardOptions);
}

export function createBackKeyboard() {
  return createKeyboard([[{ label: "Назад", color: "secondary" }]], { oneTime: true });
}

export function layoutMenuButtons(buttons, options = {}) {
  const {
    columns = 2,
    multiColumnThreshold = 6,
    layoutCount = Array.isArray(buttons) ? buttons.length : 0,
  } = options;
  const normalizedButtons = Array.isArray(buttons) ? buttons.filter(Boolean) : [];
  const backButtonIndex = normalizedButtons.findIndex((button) => isBackButton(button));
  const adminLoginButtonIndex = normalizedButtons.findIndex((button) => isAdminLoginButton(button));
  const backButton = backButtonIndex >= 0 ? normalizedButtons[backButtonIndex] : null;
  const adminLoginButton = adminLoginButtonIndex >= 0 ? normalizedButtons[adminLoginButtonIndex] : null;
  const regularButtons = normalizedButtons.filter(
    (_, index) => index !== backButtonIndex && index !== adminLoginButtonIndex,
  );
  const buttonsPerRow = layoutCount >= multiColumnThreshold ? columns : 1;
  const rows = [];

  if (adminLoginButton) {
    rows.push([adminLoginButton]);
  }

  rows.push(...chunkButtons(regularButtons, buttonsPerRow));

  if (backButton) {
    rows.push([backButton]);
  }

  return rows;
}

function normalizeVkButtonLabel(label) {
  const normalizedLabel = String(label ?? "").trim() || "Кнопка";
  const characters = Array.from(normalizedLabel);

  if (characters.length <= 40) {
    return normalizedLabel;
  }

  return `${characters.slice(0, 37).join("").trimEnd()}...`;
}

function chunkButtons(buttons, columns) {
  const rows = [];

  for (let index = 0; index < buttons.length; index += columns) {
    rows.push(buttons.slice(index, index + columns));
  }

  return rows;
}

function isBackButton(button) {
  return normalizeButtonLabel(button) === "Назад";
}

function isAdminLoginButton(button) {
  return normalizeButtonLabel(button) === "Войти как админ";
}

function normalizeButtonLabel(button) {
  return String(button?.label ?? "").trim();
}
