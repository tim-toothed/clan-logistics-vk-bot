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

export async function prepareTemplateChunkForStorage(vk, peerId, chunk) {
  const attachments = Array.isArray(chunk?.attachments) ? chunk.attachments : [];
  const preparedAttachments = [];

  for (const attachment of attachments) {
    preparedAttachments.push(await prepareTemplateAttachmentForStorage(vk, peerId, attachment));
  }

  return {
    text: chunk?.text ?? "",
    attachments: preparedAttachments,
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
        source_url: getTemplateAttachmentSourceUrl(type, source),
      };
    })
    .filter(Boolean);
}

async function prepareTemplateAttachmentForStorage(vk, peerId, attachment) {
  if (attachment?.type !== "audio_message") {
    return trimTemplateAttachment(attachment);
  }

  const sourceUrl = typeof attachment?.source_url === "string" ? attachment.source_url.trim() : "";

  if (!sourceUrl) {
    throw new Error("У голосового сообщения VK не удалось получить ссылку на OGG-файл.");
  }

  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error("Не удалось скачать голосовое сообщение из VK для сохранения в шаблон.");
  }

  const fileContents = new Uint8Array(await response.arrayBuffer());
  const vkAttachment = await vk.uploadAudioMessage(peerId, buildAudioMessageFileName(), fileContents);

  return {
    type: "audio_message",
    vk_attachment: vkAttachment,
  };
}

function trimTemplateAttachment(attachment) {
  return {
    type: attachment?.type ?? "",
    vk_attachment: attachment?.vk_attachment ?? "",
  };
}

function getTemplateAttachmentSourceUrl(type, source) {
  if (type === "audio_message") {
    if (typeof source?.link_ogg === "string" && source.link_ogg.trim()) {
      return source.link_ogg.trim();
    }

    if (typeof source?.link_mp3 === "string" && source.link_mp3.trim()) {
      return source.link_mp3.trim();
    }
  }

  return null;
}

function buildAudioMessageFileName() {
  return `voice-message-${Date.now()}.ogg`;
}

function buildVkAttachmentString(type, ownerId, itemId, accessKey) {
  const suffix = accessKey ? `_${accessKey}` : "";
  return `${type}${ownerId}_${itemId}${suffix}`;
}
