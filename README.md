# NullPointer Exception Handler

NullPointer Exception Handler is Hack Theory's privacy-conscious Discord quiz bot. It posts unpredictable, timed challenges across cybersecurity, networking, backend and frontend engineering, programming, AI, operating systems, Linux/Bash, blue team, red team, and mitigation. Members answer with buttons; correctness remains private until close; staff receive the correct participants; and the community gets profiles, accuracy, streaks, and a leaderboard.

> [!CAUTION]
> The bot token pasted into chat must be considered compromised. Reset it now in Discord Developer Portal → **Bot** → **Reset Token**. Never put the replacement in this repository, a GitHub Pages file, a command-line argument, a screenshot, or another chat message. This repository contains no bot token.

## Important hosting distinction

GitHub Pages serves only static files. It cannot accept and verify Discord's signed `POST` requests, return a PONG, run a scheduler, or safely hold a bot token. Discord also sends interactions either through the Gateway or an outgoing HTTP webhook—not both.

This project uses the correct split:

| Surface | Host | Purpose |
|---|---|---|
| Public website | GitHub Pages | Description, invite, OAuth redirect, privacy policy, and terms |
| Interactions endpoint | Cloudflare Worker | Ed25519 verification, slash commands, buttons, and Discord PING |
| Scheduler | Cloudflare Cron Trigger | Checks every five minutes and launches at randomized four-to-eight-hour intervals |
| Persistent state | SQLite-backed Durable Object | Active quiz, answers, retention, profiles, streaks, and leaderboard |

Cloudflare's Workers Free plan supports SQLite-backed Durable Objects. No database ID, server VM, open port, or privileged Gateway intent is required.

## Application-specific values

| Setting | Value |
|---|---|
| Application ID | `1306605317676859392` |
| Public key | `8d73db035b5e4536ac649148ff88891e0c82de52a4143ee8fdf6f91bb3db7112` |
| Hack Theory server | `1138548626491199519` |
| General channel | `1138548628282150995` |
| Staff logs channel | `1173184485039276052` |
| Bot permission integer | `2147568640` |
| OAuth redirect URI | `https://hoax-net.github.io/nullpointer-exception-handler/oauth/callback.html` |
| Public website | `https://hoax-net.github.io/nullpointer-exception-handler/` |
| Privacy policy | `https://hoax-net.github.io/nullpointer-exception-handler/privacy.html` |
| Terms | `https://hoax-net.github.io/nullpointer-exception-handler/terms.html` |

The identifiers and public key above are safe to commit. `DISCORD_TOKEN`, an OAuth client secret, and Cloudflare credentials are not.

## Invite link

[Install NullPointer Exception Handler in Hack Theory](https://discord.com/oauth2/authorize?client_id=1306605317676859392&permissions=2147568640&scope=bot%20applications.commands&guild_id=1138548626491199519&disable_guild_select=true&integration_type=0)

The link is preselected and locked to Hack Theory. It requests only `bot` and `applications.commands` with these permissions:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Use Application Commands (shown as **Use Slash Commands** in some portal views)

It does **not** request Administrator, Manage Server, Manage Roles, Manage Channels, Manage Messages, member moderation, webhooks, threads, voice, or mention-everyone permissions.

## Features

- Approximately four quizzes per 24 hours through randomized four-to-eight-hour spacing.
- An initial five-to-thirty-minute randomized delay after first deployment.
- Ten-minute answer window by default.
- More than forty reviewed questions plus randomized subnetting, permissions, bitmask, and incident-triage generators.
- Shuffled choices, one immutable answer, no correctness spoiler before close, and scenario-specific prompts.
- Staff log listing correct participants, plus correct/incorrect totals and question ID.
- Public leaderboard; private personal accuracy and streak profile.
- `/quiz-start` and `/quiz-close` protected by Discord's Manage Server permission and a runtime permission check.
- `/delete-my-data` with explicit confirmation.
- Thirty-day quiz-answer retention and automatic cleanup.
- Ed25519 verification on every interaction and rejection of stale or invalid requests.
- No ordinary chat reading and no privileged Gateway intents.
- Least-privilege OAuth scopes and bot permissions.

“AI-resistant” means the design raises the cost of trivial lookup through timing, randomized values, shuffled choices, and scenario reasoning. No online quiz can honestly guarantee that a question is completely AI-proof.

## Commands

| Command | Access | Result |
|---|---|---|
| `/quiz-start` | Manage Server | Posts a quiz immediately |
| `/quiz-close` | Manage Server | Closes and scores the active quiz |
| `/quiz-status` | Everyone | Shows active and next scheduled quiz |
| `/leaderboard` | Everyone | Shows the top ten competitors |
| `/profile` | Member | Privately shows accuracy and streaks |
| `/help` | Everyone | Explains behavior and links policies |
| `/delete-my-data` | Member | Confirms and deletes retained answers and stats |

## Deploy the interaction endpoint

### Prerequisites

- Node.js 22 or newer; Node.js 24 is used in CI.
- A Cloudflare account with Workers enabled.
- Access to the Discord application.
- A freshly reset Discord bot token.

### 1. Reset the exposed token

1. Open Discord Developer Portal.
2. Select application `1306605317676859392`.
3. Open **Bot**.
4. Click **Reset Token** and confirm.
5. Copy it directly into a secure password manager.
6. Do not reuse the token from the conversation; Discord tokens cannot be made safe again after disclosure.

### 2. Install Wrangler and authenticate

```bash
npm install
npx wrangler login
```

The only npm development dependency is Wrangler. The Worker itself has no runtime package dependencies.

### 3. Store the token as a Worker secret

```bash
npx wrangler secret put DISCORD_TOKEN
```

Paste the newly reset token only into Wrangler's hidden prompt. `wrangler.jsonc` deliberately contains only non-secret values.

For local development, copy `.dev.vars.example` to `.dev.vars`, set the fresh token there, and never commit that file.

### 4. Deploy

```bash
npm run deploy
```

Wrangler creates the Worker, the SQLite-backed Durable Object namespace, and the five-minute Cron Trigger. Record the exact URL Wrangler prints. It will resemble:

```text
https://nullpointer-exception-handler.<your-workers-subdomain>.workers.dev
```

The live Discord endpoint is that exact URL plus `/interactions`. Do not guess the account subdomain.

### 5. Verify the Worker

```bash
curl -fsS https://nullpointer-exception-handler.<your-workers-subdomain>.workers.dev/
curl -fsS https://nullpointer-exception-handler.<your-workers-subdomain>.workers.dev/health
```

The first response should identify the bot. Health should return `"status":"ok"` or a clear degraded state. A browser `GET` to `/interactions` returning 404 is normal—the Discord endpoint accepts signed `POST` requests only.

## Register slash commands

Guild command registration is used so changes appear in Hack Theory immediately.

On Bash/zsh, keep the secret out of shell history:

```bash
read -rsp "Fresh Discord bot token: " DISCORD_TOKEN
echo
export DISCORD_TOKEN
npm run commands:register
unset DISCORD_TOKEN
```

On PowerShell, use a hidden prompt and remove the environment variable afterward:

```powershell
$secureToken = Read-Host "Fresh Discord bot token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $env:DISCORD_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  npm run commands:register
} finally {
  Remove-Item Env:DISCORD_TOKEN -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}
```

Use `npm run commands:register -- --dry-run` to inspect the payload without a token. Set `REGISTER_GLOBAL=true` only if the application later expands beyond Hack Theory; global commands can take longer to propagate.

## Exact Discord Developer Portal settings

### General Information

Use this description:

> NullPointer Exception Handler is Hack Theory's privacy-conscious cybersecurity quiz bot. It posts randomized timed challenges across security, networking, programming, AI, operating systems, red team, and blue team topics; keeps answers private until close; tracks streaks; and sends correct-participant results to staff.

Set **Interactions Endpoint URL** to the exact deployed Worker URL:

```text
https://nullpointer-exception-handler.<your-workers-subdomain>.workers.dev/interactions
```

Discord validates the URL by sending a signed PING. The Worker returns PONG, validates `X-Signature-Ed25519` and `X-Signature-Timestamp`, rejects invalid signatures with 401, and rejects requests older than five minutes.

Do not place the GitHub Pages URL in this field. A static Pages site cannot pass Discord's endpoint validation.

### Installation

Set these values:

| Portal field | Setting |
|---|---|
| Installation Contexts | **Guild Install** on; **User Install** off |
| Install Link | **Discord Provided Link** |
| Default Install Scopes | `bot`, `applications.commands` |
| Default Install Permissions | View Channels, Send Messages, Embed Links, Read Message History, Use Slash Commands |

Guild Install is the correct context because the Bot posts scheduled messages to server channels and writes a private server staff log. User Install would not grant those server channel permissions.

### OAuth2 → Redirects

Add this exact URI, including lowercase host, repository path, and filename:

```text
https://hoax-net.github.io/nullpointer-exception-handler/oauth/callback.html
```

Discord requires an exact match whenever `redirect_uri` is present. The normal bot install flow is callback-less and this invite intentionally omits `redirect_uri`. The registered Pages URI exists for portal completeness and a future full authorization-code flow. The static callback removes query parameters from the address bar and never exchanges or stores a code.

### OAuth2 scopes

Enable only:

- `bot`
- `applications.commands`

Leave all of these off because the Bot does not need a user's OAuth access token: `identify`, `email`, `connections`, `guilds`, `guilds.join`, `guilds.members.read`, `gdm.join`, every `rpc.*` scope, `webhook.incoming`, `messages.read`, `applications.builds.read`, `applications.store.update`, `applications.entitlements`, `role_connections.write`, `openid`, and `applications.commands.permissions.update`.

Adding scopes outside `bot` and `applications.commands` changes the install into a full OAuth2 authorization-code flow and unnecessarily requests user data or elevated application access.

### Bot → Authorization Flow

| Setting | Recommended | Why |
|---|---:|---|
| Public Bot | **Off** | This deployment is locked to Hack Theory; only the application owner should install it. Turn on only if deliberately supporting other servers. |
| Requires OAuth2 Code Grant | **Off** | The install uses only the callback-less `bot` and `applications.commands` scopes. No user access token is required. |
| Private Channel Obfuscation | **On** | Privacy-friendly default. The Worker does not connect to the Gateway, so private-channel metadata is not required. |

### Bot → Privileged Gateway Intents

Turn all three **off**:

| Intent | Setting | Reason |
|---|---:|---|
| Presence Intent | **Off** | The Bot never reads member presence. |
| Server Members Intent | **Off** | Discord interactions already include the invoking member identity needed to score an answer. |
| Message Content Intent | **Off** | Answers use buttons; the Bot does not inspect ordinary messages. |

The 10,000-user review threshold is therefore irrelevant to the current design. Do not enable an intent merely because it is available.

### Bot → Permissions

Enable exactly these checkboxes:

| Category | Permission | Why |
|---|---|---|
| General | View Channels | Reach the configured general and staff-log channels |
| Text | Send Messages | Post quizzes and staff results |
| Text | Embed Links | Render professional quiz/result embeds |
| Text | Read Message History | Reliably reference and update the Bot's quiz message |
| Text | Use Slash Commands | Expose the registered application commands |

Permission integer: `2147568640`.

Leave every other listed General, Text, and Voice permission off. In particular, do not grant Administrator, Manage Server, Manage Roles, Manage Channels, Kick/Ban/Moderate Members, Manage Messages, Manage Webhooks, Mention Everyone, thread management, event management, voice access, or embedded activity permissions.

Channel overrides still apply. The Bot's role must be able to view/send/embed in general (`1138548628282150995`) and staff-logs (`1173184485039276052`). Members should not be able to view staff-logs unless that is already intended by server policy.

### Webhooks

The **Webhooks** page is for application event webhooks and is separate from the Interactions Endpoint URL.

- Leave Webhooks **Endpoint URL** blank.
- Leave every event unchecked: Application Authorized/Deauthorized, Entitlement Create/Update/Delete, Activity Invite Create, Relationship events, User Activity Action, Quest enrollment, Game Direct Message events, Lobby Message events, and Game Relationship events.

None of those events are required. Slash commands and answer buttons arrive through the Interactions Endpoint configured under General Information.

## GitHub Pages setup

The repository can remain private, but GitHub Pages for a private repository requires GitHub Pro, Team, or Enterprise. The published website itself is public even when the source repository is private.

1. Open the repository on GitHub.
2. Go to **Settings** → **Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Run or re-run the **Deploy public site** workflow.
5. Wait for the workflow's `github-pages` environment to report the deployed URL.
6. Verify `/`, `/privacy.html`, `/terms.html`, and `/oauth/callback.html` over HTTPS.

The Pages workflow publishes only `docs/`. Never put `.dev.vars`, environment files, logs, tokens, or private operational data under that folder.

## Optional GitHub-to-Cloudflare deployment

The `Deploy Discord interaction worker` workflow is manual by design. Add these GitHub Actions repository secrets before running it:

- `CLOUDFLARE_API_TOKEN` — scoped to deploy this Worker.
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account identifier.
- `DISCORD_TOKEN` — the freshly reset bot token.

The workflow passes `DISCORD_TOKEN` to Wrangler as a Worker secret. Never convert it into a normal `vars` entry.

## Runtime configuration

Non-secret settings live in `wrangler.jsonc`:

| Variable | Default | Meaning |
|---|---:|---|
| `QUIZ_DURATION_MINUTES` | 10 | Answer window, clamped to 2–60 minutes |
| `QUIZ_MIN_INTERVAL_MINUTES` | 240 | Minimum delay after a quiz |
| `QUIZ_MAX_INTERVAL_MINUTES` | 480 | Maximum delay after a quiz |
| `INITIAL_QUIZ_DELAY_MINUTES` | 30 | Maximum initial delay; minimum is five minutes |
| `ANSWER_RETENTION_DAYS` | 30 | Quiz/answer retention, clamped to 1–365 days |
| `ADMIN_USER_IDS` | empty | Optional comma-separated emergency admin IDs; Manage Server remains preferred |

The Cron Trigger runs every five minutes. That is only a due-time check; it does not post every five minutes. After a successful launch, the coordinator persists a new randomized four-to-eight-hour deadline.

## Testing

```bash
npm run check
npm test
npm run test:coverage
npm run commands:register -- --dry-run
node scripts/show-links.mjs
```

Tests cover question integrity and topic coverage, answer shuffling, recent-question avoidance, Ed25519 validation, signed Discord PING, invalid/stale request rejection, quiz lifecycle, duplicate-answer prevention, staff result delivery, randomized scheduling, profiles, and data deletion.

## Operations

### First production verification

1. Invite the Bot with the generated link.
2. Confirm its role has the five requested permissions in both configured channels.
3. Run `/help` and `/quiz-status`.
4. As a member with Manage Server, run `/quiz-start`.
5. Answer with one member account and verify that a second click is rejected.
6. Run `/quiz-close` or wait ten minutes.
7. Confirm the general message reveals the answer and disables buttons.
8. Confirm staff-logs names the correct member and shows totals.
9. Run `/profile` and `/leaderboard`.
10. Test `/delete-my-data` with a non-production test member if available.

### Token rotation

After resetting a token:

```bash
npx wrangler secret put DISCORD_TOKEN
npm run deploy
```

Update the GitHub `DISCORD_TOKEN` Actions secret too if the deployment workflow is used. Command definitions do not need re-registration unless they changed.

## Troubleshooting

### Discord says the Interactions Endpoint URL could not be verified

- Confirm the URL ends in `/interactions` and points to Workers, not GitHub Pages.
- Confirm the deployed `DISCORD_PUBLIC_KEY` matches the application public key exactly.
- Verify `GET /health` works, then inspect `npx wrangler tail` while saving the endpoint.
- A 401 means the signature or timestamp was missing, invalid, stale, or verified against the wrong public key.
- Do not disable signature verification; Discord deliberately sends invalid signatures during routine security checks.

### Discord returns Missing Access or Missing Permissions

- Confirm the Bot is installed in server `1138548626491199519`.
- Check channel-level role overrides for both channel IDs.
- Enable View Channels, Send Messages, Embed Links, and Read Message History only where needed.
- Do not solve a channel override by granting Administrator.

### Commands do not appear

- Run `npm run commands:register` with the newly reset token.
- Confirm guild ID `1138548626491199519` is correct.
- Confirm the install includes `applications.commands`.
- Restart the Discord client if its command cache is stale.

### Scheduled quizzes do not post

- Check `/health` for `nextQuizAt` and status.
- Confirm the `*/5 * * * *` trigger exists in Cloudflare.
- Inspect `npx wrangler tail` for Discord API failures.
- Remember the initial delay is randomized and normal spacing is four to eight hours.

### A quiz closes but staff logging fails

- Check View Channels, Send Messages, and Embed Links in staff-logs.
- Confirm `STAFF_LOG_CHANNEL_ID` is `1173184485039276052`.
- The coordinator still closes the quiz safely and exposes a degraded health state if one delivery fails.

## Security design

- Raw request bodies are verified against Discord's Ed25519 signature before JSON parsing or processing.
- Requests older than five minutes are rejected to reduce replay risk.
- Invalid signatures return HTTP 401, including Discord's routine negative security probes.
- One Durable Object serializes state changes, preventing double-answer and double-launch races.
- Discord rate limits receive bounded retries.
- API errors never include the token.
- Allowed mentions are disabled, so logged names cannot trigger surprise pings.
- The staff log escapes Discord markdown and includes immutable user IDs for disambiguation.
- The Worker has no third-party runtime dependencies.
- The Pages site uses a restrictive Content Security Policy and does not exchange OAuth codes.

## Official references

- [Discord: Receiving and Responding to Interactions](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Discord: Interactions security and endpoint setup](https://docs.discord.com/developers/interactions/overview)
- [Discord: OAuth2 and bot authorization](https://docs.discord.com/developers/topics/oauth2)
- [Discord: Privileged intents](https://docs.discord.com/developers/events/gateway#privileged-intents)
- [Discord: Hosting an app on Cloudflare Workers](https://docs.discord.com/developers/tutorials/hosting-on-cloudflare-workers)
- [GitHub: What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Cloudflare: Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare: Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare: Workers pricing and Durable Objects](https://developers.cloudflare.com/workers/platform/pricing/)

