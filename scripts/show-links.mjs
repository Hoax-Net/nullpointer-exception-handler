import { BOT_PERMISSION_INTEGER } from "../src/constants.js";

const applicationId = "1306605317676859392";
const guildId = "1138548626491199519";
const params = new URLSearchParams({
  client_id: applicationId,
  permissions: BOT_PERMISSION_INTEGER,
  scope: "bot applications.commands",
  guild_id: guildId,
  disable_guild_select: "true",
  integration_type: "0",
});

process.stdout.write(
  `${JSON.stringify(
    {
      permissions: BOT_PERMISSION_INTEGER,
      invite: `https://discord.com/oauth2/authorize?${params}`,
      oauthRedirect: "https://hoax-net.github.io/nullpointer-exception-handler/oauth/callback.html",
      privacy: "https://hoax-net.github.io/nullpointer-exception-handler/privacy.html",
      terms: "https://hoax-net.github.io/nullpointer-exception-handler/terms.html",
    },
    null,
    2,
  )}\n`,
);

