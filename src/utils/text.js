export function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function toDisplayCase(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function parseNumberedList(rawText) {
  const lines = String(rawText ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const values = [];

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^(\d+)\.\s+(.+)$/u);

    if (!match) {
      return null;
    }

    const expectedNumber = index + 1;
    const actualNumber = Number(match[1]);

    if (actualNumber !== expectedNumber) {
      return null;
    }

    const value = match[2].trim();

    if (!value) {
      return null;
    }

    values.push(value);
  }

  return values;
}

export function formatStringList(values) {
  if (!values.length) {
    return "отсутствует";
  }

  return values.map((value, index) => `${index + 1}. ${value}`).join("\n");
}

export function formatNamedRows(rows, fieldName) {
  if (!rows.length) {
    return "отсутствует";
  }

  return rows.map((row, index) => `${index + 1}. ${row[fieldName]}`).join("\n");
}
