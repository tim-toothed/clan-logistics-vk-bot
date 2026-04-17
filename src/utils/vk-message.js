export function parseVkButtonPayload(payload) {
  const rawPayload = payload?.object?.message?.payload;

  if (!rawPayload) {
    return null;
  }

  if (typeof rawPayload === "object") {
    return rawPayload;
  }

  try {
    return JSON.parse(rawPayload);
  } catch {
    return null;
  }
}

export function buildTemplateChunkFromPayload(payload) {
  const message = payload?.object?.message;
  const text = typeof message?.text === "string" ? message.text : "";
  const attachments = normalizeVkAttachments(message?.attachments ?? []);

  if (!text.trim() && attachments.length === 0) {
    return null;
  }

  return {
    text,
    attachments,
  };
}

export async function sendTemplateSequence(vk, peerId, contentItems, options = {}) {
  const items = Array.isArray(contentItems) ? contentItems : [];

  if (!items.length) {
    return;
  }

  for (const [index, item] of items.entries()) {
    const isLastItem = index === items.length - 1;
    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    const params = {
      attachment: attachments.map((attachment) => attachment.vk_attachment).filter(Boolean).join(",") || undefined,
      keyboard: isLastItem ? options.keyboard : undefined,
    };

    await vk.sendText(peerId, item.text ?? "", params);
  }
}

function normalizeVkAttachments(rawAttachments) {
  return rawAttachments
    .map((attachment) => {
      const type = attachment?.type;

      if (!type) {
        return null;
      }

      const source = attachment[type];

      if (!source?.owner_id || !source?.id) {
        return null;
      }

      return {
        type,
        vk_attachment: buildVkAttachmentString(type, source.owner_id, source.id, source.access_key),
      };
    })
    .filter(Boolean);
}

function buildVkAttachmentString(type, ownerId, itemId, accessKey) {
  const suffix = accessKey ? `_${accessKey}` : "";
  return `${type}${ownerId}_${itemId}${suffix}`;
}
