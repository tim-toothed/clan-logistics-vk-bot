export const ENTER_STATION_ONLY_WHEN_READY_TEXT =
  "Не входите на станцию, пока организатор не сообщит вам, что готов вас принять.";

export const STATION_READY_TEXT = "Организатор готов вас принять!";

export function appendStationPreparationNotice(contentItems) {
  const items = Array.isArray(contentItems) ? [...contentItems] : [];

  items.push({
    text: ENTER_STATION_ONLY_WHEN_READY_TEXT,
    attachments: [],
  });

  return items;
}
