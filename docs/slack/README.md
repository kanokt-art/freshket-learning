# Slack app — private notifications

The app posts in three places and never reads anything.

**Trainer × team-lead group** (`SLACK_TRAINER_CHANNEL_ID`) — what trainers and team leads act on. Team leads and
managers are NOT messaged one by one; this group is how they hear:
- a learner finishes a quiz (with score and a link to their history)
- a new Shadow Visit is waiting for review
- a Shadow Visit was reviewed

**Course channel** (`SLACK_COURSE_CHANNEL_ID`, e.g. `C08MCUBS8G1`) — one post when a course is published
(it tags the whole channel with @channel) and one when people are added to a live course (no tag). Learners
are not messaged one by one for courses.

**Private messages (DM)** — only to learners, and only when their Slack link is on their profile:

| Event | Who is messaged |
|---|---|
| A learner passes a quiz (post-test or lesson quiz; not the pre-test, not a fail) | the learner |
| A team lead / manager reviews a Shadow Visit (stars + feedback) | the person whose visit it was |
| A new Mandatory Reading goes live | each person in the targeted departments (everyone if none) |

The bot must be a member of each channel: in the channel, type `/invite @Freshket Sale Tracking`.
With `SLACK_BOT_TOKEN` and the channel id set, the posts go through the bot. Without them they use the old webhook
(`SLACK_WEBHOOK_URL`) exactly as before, so nothing is posted twice. Take-away and anything else not listed here
still go to the webhook's channel.

Mandatory DMs are sent only when a super_admin publishes; the server re-reads the item and its departments itself,
so the browser cannot message anyone it should not. At most 500 people per publish.

## Create the app (once)

1. https://api.slack.com/apps → **Create New App** → **From a manifest** → pick the Freshket workspace.
2. Paste `docs/slack/manifest.json` (JSON tab) → Next → Create.
3. **Install to Workspace** (needs a workspace admin to approve).
4. **OAuth & Permissions** → copy the **Bot User OAuth Token** (`xoxb-…`).
5. Vercel → Project → Settings → Environment Variables: add `SLACK_BOT_TOKEN`, `SLACK_TRAINER_CHANNEL_ID` and `SLACK_COURSE_CHANNEL_ID` (Production), then redeploy.
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
