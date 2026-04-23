import { getMessageByTrigger, MESSAGE_TRIGGER_TYPES } from "../db/messages-repository.js";

export const ENTER_STATION_ONLY_WHEN_READY_TEXT =
  "Не входите на станцию, пока организатор не сообщит вам, что готов вас принять.";

export const STATION_READY_TEXT = "Организатор готов вас принять!";

export async function appendStationPreparationNotice(env, contentItems) {
  const items = Array.isArray(contentItems) ? [...contentItems] : [];
  const noticeItems = await getStationPreparationNoticeItems(env);
  return [...items, ...noticeItems];
}

export async function getStationPreparationNoticeItems(env) {
  const template = await getMessageByTrigger(env, MESSAGE_TRIGGER_TYPES.WAIT_FOR_STATION_ENTRY, null);
  return template?.content_items?.length
    ? template.content_items
    : [
        {
          text: ENTER_STATION_ONLY_WHEN_READY_TEXT,
          attachments: [],
        },
      ];
}

export async function getStationReadyItems(env) {
  const template = await getMessageByTrigger(env, MESSAGE_TRIGGER_TYPES.STATION_READY, null);
  return template?.content_items?.length
    ? template.content_items
    : [
        {
          text: STATION_READY_TEXT,
          attachments: [],
        },
      ];
}
