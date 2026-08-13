const API_BASE = "https://discord.com/api/v10";

export class DiscordApiError extends Error {
  constructor(status, code, message) {
    super(`Discord API ${status}${code ? ` (${code})` : ""}: ${message}`);
    this.name = "DiscordApiError";
    this.status = status;
    this.code = code;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function discordRequest(
  env,
  path,
  { method = "GET", body, authenticated = true, retries = 2 } = {},
  fetchImpl = fetch,
) {
  if (authenticated && !env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is not configured");
  }

  const headers = {
    "content-type": "application/json",
    "user-agent": "DiscordBot (NullPointer Exception Handler, 1.0.0)",
  };
  if (authenticated) headers.authorization = `Bot ${env.DISCORD_TOKEN}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });

    const raw = await response.text();
    let parsed = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { message: raw.slice(0, 300) };
      }
    }

    if (response.ok) return parsed;

    if (response.status === 429 && attempt < retries) {
      const retryAfterMs = Math.max(250, Number(parsed?.retry_after ?? 1) * 1_000);
      await delay(Math.min(retryAfterMs, 10_000));
      continue;
    }

    throw new DiscordApiError(
      response.status,
      parsed?.code,
      parsed?.message || response.statusText || "request failed",
    );
  }

  throw new Error("Discord API retry budget exhausted");
}

export function sendChannelMessage(env, channelId, payload, fetchImpl = fetch) {
  return discordRequest(
    env,
    `/channels/${channelId}/messages`,
    { method: "POST", body: payload },
    fetchImpl,
  );
}

export function editChannelMessage(env, channelId, messageId, payload, fetchImpl = fetch) {
  return discordRequest(
    env,
    `/channels/${channelId}/messages/${messageId}`,
    { method: "PATCH", body: payload },
    fetchImpl,
  );
}

export function editInteractionResponse(env, interactionToken, payload, fetchImpl = fetch) {
  return discordRequest(
    env,
    `/webhooks/${env.APPLICATION_ID}/${interactionToken}/messages/@original`,
    { method: "PATCH", body: payload, authenticated: false },
    fetchImpl,
  );
}

