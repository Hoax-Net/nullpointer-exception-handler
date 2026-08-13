import {
  APP_NAME,
  APP_VERSION,
  InteractionResponseType,
  InteractionType,
} from "./constants.js";
import { QuizCoordinator } from "./coordinator.js";
import { jsonResponse } from "./util.js";

export { QuizCoordinator };

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new TypeError("Invalid hexadecimal value");
  }
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

function toBytes(body) {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === "string") return new TextEncoder().encode(body);
  throw new TypeError("Unsupported request body type");
}

export async function verifyDiscordSignature({
  body,
  signature,
  timestamp,
  publicKey,
  now = Date.now(),
}) {
  try {
    if (!signature || !timestamp || !publicKey) return false;
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) return false;
    const ageSeconds = Math.abs(now / 1_000 - timestampSeconds);
    if (ageSeconds > 300) return false;

    const bodyBytes = toBytes(body);
    const timestampBytes = new TextEncoder().encode(timestamp);
    const signed = new Uint8Array(timestampBytes.length + bodyBytes.length);
    signed.set(timestampBytes);
    signed.set(bodyBytes, timestampBytes.length);

    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature),
      signed,
    );
  } catch {
    return false;
  }
}

function coordinatorStub(env) {
  const id = env.QUIZ_COORDINATOR.idFromName(env.GUILD_ID);
  return env.QUIZ_COORDINATOR.get(id);
}

async function handleInteractionRequest(request, env) {
  const body = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const verified = await verifyDiscordSignature({
    body,
    signature,
    timestamp,
    publicKey: env.DISCORD_PUBLIC_KEY,
  });

  if (!verified) return jsonResponse({ error: "invalid_request_signature" }, 401);

  let interaction;
  try {
    interaction = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (interaction.type === InteractionType.PING) {
    return jsonResponse({ type: InteractionResponseType.PONG });
  }

  return coordinatorStub(env).fetch("https://coordinator/interaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(interaction),
  });
}

export const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/interactions") {
      return handleInteractionRequest(request, env);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return coordinatorStub(env).fetch("https://coordinator/status");
    }

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse({
        name: APP_NAME,
        version: APP_VERSION,
        status: "online",
        interactions: "/interactions",
        health: "/health",
        website: env.SITE_URL,
      });
    }

    return jsonResponse({ error: "not_found" }, 404);
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil(
      coordinatorStub(env).fetch("https://coordinator/tick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ now: controller.scheduledTime || Date.now() }),
      }),
    );
  },
};

export default worker;

