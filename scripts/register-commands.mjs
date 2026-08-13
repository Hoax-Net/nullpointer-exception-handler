import { COMMANDS } from "../src/constants.js";

const APPLICATION_ID = process.env.APPLICATION_ID || "1306605317676859392";
const GUILD_ID = process.env.GUILD_ID || "1138548626491199519";
const GLOBAL = process.env.REGISTER_GLOBAL === "true";
const DRY_RUN = process.argv.includes("--dry-run");
const token = process.env.DISCORD_TOKEN;

const route = GLOBAL
  ? `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`
  : `https://discord.com/api/v10/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`;

if (DRY_RUN) {
  process.stdout.write(`${JSON.stringify({ route, commands: COMMANDS }, null, 2)}\n`);
  process.exit(0);
}

if (!token) {
  process.stderr.write(
    "DISCORD_TOKEN is missing. Reset the exposed token, then set the fresh value only in your local environment.\n",
  );
  process.exit(1);
}

const response = await fetch(route, {
  method: "PUT",
  headers: {
    authorization: `Bot ${token}`,
    "content-type": "application/json",
    "user-agent": "DiscordBot (NullPointer Exception Handler command registrar, 1.0.0)",
  },
  body: JSON.stringify(COMMANDS),
  signal: AbortSignal.timeout(10_000),
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  process.stderr.write(
    `Discord rejected command registration (${response.status}): ${body.message || "unknown error"}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Registered ${body.length} ${GLOBAL ? "global" : "Hack Theory guild"} commands.\n`,
);

