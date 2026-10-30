# Slack app — private notifications

The app posts in two places and never reads anything.

**Private messages (DM)** — need the person's Slack link on their profile:

| Event | Who is messaged |
|---|---|
| A learner submits a quiz | the learner's line manager, and the leads/managers of their team |
| A learner submits a Shadow Visit | same people |
| A learner passes a quiz (post-test or lesson quiz; not the pre-test, not a fail) | the learner |
| A team lead / manager reviews a Shadow Visit (stars + feedback) | the person whose visit it was |
| A course is published to them, or they are added to a live course | each learner |
| A new Mandatory Reading goes live | each person in the targeted departments (everyone if none) |

**Trainer × team-lead group** (`SLACK_TRAINER_CHANNEL_ID`, e.g. `C0C1C9GS7N1`) — what trainers and team leads act on:
- a learner finishes a quiz (with score and a link to their history)
- a new Shadow Visit is waiting for review
- a Shadow Visit was reviewed

The bot must be a member of that channel: in the channel, type `/invite @Freshket Sale Tracking`.
With `SLACK_BOT_TOKEN` + `SLACK_TRAINER_CHANNEL_ID` set, these three go to the group through the bot. Without
them they use the old webhook (`SLACK_WEBHOOK_URL`) exactly as before, so nothing is posted twice. New course,
Mandatory Reading and take-away posts for everyone still go to the webhook's channel.

Publishing DMs are sent only when a super_admin publishes; the server re-reads the course/item and its audience
itself, so the browser cannot message anyone it should not. At most 500 people are messaged per publish.

## Create the app (once)

1. https://api.slack.com/apps → **Create New App** → **From a manifest** → pick the Freshket workspace.
2. Paste `docs/slack/manifest.json` (JSON tab) → Next → Create.
3. **Install to Workspace** (needs a workspace admin to approve).
4. **OAuth & Permissions** → copy the **Bot User OAuth Token** (`xoxb-…`).
5. Vercel → Project → Settings → Environment Variables: add `SLACK_BOT_TOKEN` and `SLACK_TRAINER_CHANNEL_ID` (Production), then redeploy.
   Never put the token in git, chat or the browser; it is read only on the server.

Scopes: `chat:write` (send), `im:write` (open the direct conversation), `users:read` + `users:read.email` (find a person by email). After adding scopes, **Reinstall to Workspace**.

## Tell the app who is who

Admin → Employees → open a person → **Slack** row → paste their Slack profile link
(in Slack: click the person → ⋮ → **Copy link**; looks like `https://freshket.slack.com/team/U01ABCDEF2`)
→ Save. Only the member id (`U01ABCDEF2`) is stored. Do this for every team lead / manager (to receive)
and every learner (to be told about their review). Only a super_admin can set it.

**By email, automatically:** when the app is about to message someone with no Slack link, it asks Slack who has their email and saves the answer (so it asks once). It only works when the email in Slack matches the email here; anyone it cannot find is skipped. The Slack row also has a **ค้นหาจากอีเมล** button to do this for one person on the spot. Slack limits lookups to about 50 a minute, so a big first publish may only resolve part of the audience; the rest resolve on later events.

Someone with no Slack link and no match is simply skipped; nothing fails.

## Before the first deploy of this feature

Run `supabase/migrations/008_slack_user_id.sql` in the Supabase SQL Editor (adds `users.slack_user_id`).
