# Security Policy

## Supported version

The latest deployment from `main` is supported.

## Reporting a vulnerability

Report suspected vulnerabilities privately to Hack Theory server staff. Do not post exploit details, bot tokens, interaction payloads containing member data, or other secrets in a public channel or issue.

Include the affected component, reproduction steps, impact, and the least-sensitive evidence needed to validate the report. Do not access data belonging to other members, disrupt quizzes, or move beyond the minimum proof required.

## Token exposure response

If a Discord bot token appears in chat, logs, a commit, an artifact, or a screenshot:

1. Reset it immediately in Discord Developer Portal → **Bot** → **Reset Token**.
2. Replace the `DISCORD_TOKEN` Cloudflare Worker secret.
3. Redeploy the Worker and re-register commands if needed.
4. Remove the exposed value from files and repository history.
5. Review Discord and Cloudflare activity for misuse.

The application ID, public key, guild ID, and channel IDs are identifiers, not authentication secrets. The bot token and any OAuth client secret are secrets.

