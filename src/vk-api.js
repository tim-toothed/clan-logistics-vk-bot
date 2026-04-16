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
  };
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

function formatVkApiError(method, status, error) {
  if (!error) {
    return `VK API ${method} request failed with status ${status}`;
  }

  return `VK API ${method} failed: ${error.error_code} ${error.error_msg}`;
}
