const VK_API_BASE_URL = "https://api.vk.com/method";

export function createVkClient(env) {
  if (!env.VK_GROUP_TOKEN) {
    throw new Error("VK_GROUP_TOKEN is missing");
  }

  const apiVersion = env.VK_API_VERSION ?? "5.199";

  return {
    call(method, params = {}) {
      return callVkApi({
        method,
        params,
        token: env.VK_GROUP_TOKEN,
        version: apiVersion,
      });
    },

    async getUserDisplayName(vkUserId) {
      const users = await callVkApi({
        method: "users.get",
        params: {
          user_ids: vkUserId,
        },
        token: env.VK_GROUP_TOKEN,
        version: apiVersion,
      });

      return formatVkUserDisplayName(users?.[0], vkUserId);
    },

    sendText(peerId, message, params = {}) {
      return callVkApi({
        method: "messages.send",
        params: {
          peer_id: peerId,
          random_id: createRandomId(),
          message,
          ...params,
        },
        token: env.VK_GROUP_TOKEN,
        version: apiVersion,
      });
    },

    async uploadMessageDocument(peerId, fileName, fileContents, contentType = "application/json") {
      const uploadServer = await callVkApi({
        method: "docs.getMessagesUploadServer",
        params: {
          peer_id: peerId,
        },
        token: env.VK_GROUP_TOKEN,
        version: apiVersion,
      });

      const formData = new FormData();
      const fileBlob = new Blob([fileContents], { type: contentType });

      formData.set("file", fileBlob, fileName);

      const uploadResponse = await fetch(uploadServer.upload_url, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || uploadData?.error) {
        throw new Error("Не удалось загрузить файл экспорта в VK.");
      }

      const savedDocs = await callVkApi({
        method: "docs.save",
        params: {
          file: uploadData.file,
          title: fileName,
        },
        token: env.VK_GROUP_TOKEN,
        version: apiVersion,
      });
      const savedDoc = Array.isArray(savedDocs) ? savedDocs[0] : null;

      if (!savedDoc?.owner_id || !savedDoc?.id) {
        throw new Error("VK не вернул данные сохраненного документа.");
      }

      return buildVkAttachmentString("doc", savedDoc.owner_id, savedDoc.id, savedDoc.access_key);
    },
  };
}

function formatVkUserDisplayName(user, vkUserId) {
  const fullName = [user?.first_name, user?.last_name]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  if (typeof user?.screen_name === "string" && user.screen_name.trim()) {
    return user.screen_name.trim();
  }

  return `VK ${vkUserId}`;
}

async function callVkApi({ method, params, token, version }) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    body.set(key, serializeVkValue(value));
  }

  body.set("access_token", token);
  body.set("v", version);

  const response = await fetch(`${VK_API_BASE_URL}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(formatVkApiError(method, response.status, data.error));
  }

  return data.response;
}

function serializeVkValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function createRandomId() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0];
}

function buildVkAttachmentString(type, ownerId, itemId, accessKey) {
  const suffix = accessKey ? `_${accessKey}` : "";
  return `${type}${ownerId}_${itemId}${suffix}`;
}

function formatVkApiError(method, status, error) {
  if (!error) {
    return `VK API ${method} request failed with status ${status}`;
  }

  return `VK API ${method} failed: ${error.error_code} ${error.error_msg}`;
}
