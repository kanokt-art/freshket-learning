# Slack app — private notifications

The app sends **direct messages** (it never reads anything):

| Event | Who is messaged |
|---|---|
| A learner submits a quiz | the learner's line manager, and the leads/managers of their team |
| A learner submits a Shadow Visit | same people |
| A team lead / manager reviews a Shadow Visit (stars + feedback) | the person whose visit it was |

The existing channel webhook (`SLACK_WEBHOOK_URL`) is unchanged and keeps posting to the channel.

## Create the app (once)

1. https://api.slack.com/apps → **Create New App** → **From a manifest** → pick the Freshket workspace.
2. Paste `docs/slack/manifest.json` (JSON tab) → Next → Create.
3. **Install to Workspace** (needs a workspace admin to approve).
4. **OAuth & Permissions** → copy the **Bot User OAuth Token** (`xoxb-…`).
5. Vercel → Project → Settings → Environment Variables: add `SLACK_BOT_TOKEN` (Production), then redeploy.
   Never put the token in git, chat or the browser; it is read only on the server.

Scopes are the minimum: `chat:write` (send) and `im:write` (open the direct conversation).

## Tell the app who is who

Admin → Employees → open a person → **Slack** row → paste their Slack profile link
(in Slack: click the person → ⋮ → **Copy link**; looks like `https://freshket.slack.com/team/U01ABCDEF2`)
→ Save. Only the member id (`U01ABCDEF2`) is stored. Do this for every team lead / manager (to receive)
and every learner (to be told about their review). Only a super_admin can set it.

Someone with no Slack link is simply skipped; nothing fails.

## Before the first deploy of this feature

Run `supabase/migrations/008_slack_user_id.sql` in the Supabase SQL Editor (adds `users.slack_user_id`).
