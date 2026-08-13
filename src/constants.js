export const APP_NAME = "NullPointer Exception Handler";
export const APP_VERSION = "1.0.0";

export const InteractionType = Object.freeze({
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
});

export const InteractionResponseType = Object.freeze({
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  UPDATE_MESSAGE: 7,
});

export const MessageFlags = Object.freeze({
  EPHEMERAL: 64,
});

export const Permissions = Object.freeze({
  ADMINISTRATOR: 1n << 3n,
  MANAGE_GUILD: 1n << 5n,
});

export const BOT_PERMISSIONS = Object.freeze({
  VIEW_CHANNELS: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
});

export const BOT_PERMISSION_INTEGER = Object.values(BOT_PERMISSIONS)
  .reduce((total, permission) => total | permission, 0n)
  .toString();

export const COMMANDS = Object.freeze([
  {
    name: "quiz-start",
    description: "Start a quiz now (Manage Server required)",
    type: 1,
    contexts: [0],
    integration_types: [0],
    default_member_permissions: Permissions.MANAGE_GUILD.toString(),
  },
  {
    name: "quiz-close",
    description: "Close the active quiz now (Manage Server required)",
    type: 1,
    contexts: [0],
    integration_types: [0],
    default_member_permissions: Permissions.MANAGE_GUILD.toString(),
  },
  {
    name: "quiz-status",
    description: "Show the active quiz and next scheduled quiz",
    type: 1,
    contexts: [0],
    integration_types: [0],
  },
  {
    name: "leaderboard",
    description: "Show Hack Theory's top quiz competitors",
    type: 1,
    contexts: [0],
    integration_types: [0],
  },
  {
    name: "profile",
    description: "Show your private quiz statistics",
    type: 1,
    contexts: [0],
    integration_types: [0],
  },
  {
    name: "help",
    description: "Learn how NullPointer Exception Handler works",
    type: 1,
    contexts: [0],
    integration_types: [0],
  },
  {
    name: "delete-my-data",
    description: "Permanently delete your quiz answers and statistics",
    type: 1,
    contexts: [0],
    integration_types: [0],
  },
]);

