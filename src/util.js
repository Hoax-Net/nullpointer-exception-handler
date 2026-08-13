import {
  InteractionResponseType,
  MessageFlags,
  Permissions,
} from "./constants.js";

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function interactionMessage(content, { ephemeral = true, embeds, components } = {}) {
  const data = {
    content,
    allowed_mentions: { parse: [] },
  };

  if (ephemeral) data.flags = MessageFlags.EPHEMERAL;
  if (embeds) data.embeds = embeds;
  if (components) data.components = components;

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data,
  };
}

export function secureRandom() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 2 ** 32;
}

export function randomInt(min, max, rng = secureRandom) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError("randomInt requires integer bounds where max >= min");
  }
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function shuffle(items, rng = secureRandom) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index, rng);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function shuffleQuestion(question, rng = secureRandom) {
  const tagged = question.choices.map((choice, index) => ({
    choice,
    correct: index === question.answer,
  }));
  const shuffled = shuffle(tagged, rng);
  return {
    ...question,
    choices: shuffled.map((item) => item.choice),
    answer: shuffled.findIndex((item) => item.correct),
  };
}

export function hasManageGuild(interaction, adminUserIds = "") {
  const userId = getInteractionUser(interaction)?.id;
  const configuredAdmins = new Set(
    String(adminUserIds)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (userId && configuredAdmins.has(userId)) return true;

  try {
    const memberPermissions = BigInt(interaction.member?.permissions ?? "0");
    return Boolean(
      memberPermissions & Permissions.ADMINISTRATOR ||
        memberPermissions & Permissions.MANAGE_GUILD,
    );
  } catch {
    return false;
  }
}

export function getInteractionUser(interaction) {
  return interaction.member?.user ?? interaction.user ?? null;
}

export function getIdentity(interaction) {
  const user = getInteractionUser(interaction);
  if (!user) return null;
  return {
    userId: user.id,
    username: user.username || "unknown",
    displayName:
      interaction.member?.nick || user.global_name || user.username || "Unknown member",
  };
}

export function escapeDiscordMarkdown(value) {
  return String(value).replace(/([\\`*_{}\[\]()<>#+\-.!|>])/g, "\\$1");
}

export function truncate(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function createId(prefix = "quiz") {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function unixTimestamp(epochMilliseconds) {
  return Math.floor(epochMilliseconds / 1000);
}

export function safeErrorMessage(error) {
  if (error instanceof Error) return truncate(error.message, 300);
  return truncate(String(error), 300);
}
