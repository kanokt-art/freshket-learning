// Sends one test DM from the Slack app to one person, to check the bot token works
// before relying on it. Reads SLACK_BOT_TOKEN from .env.local (never pass it on the
// command line or paste it into chat).
//
//   node --env-file=.env.local scripts/slack-test.mjs <slack member id or profile link>
//
// Member id looks like U01ABCDEF2; the profile link is "Copy link" on their Slack profile.
const token = process.env.SLACK_BOT_TOKEN?.trim()
if (!token) { console.error('SLACK_BOT_TOKEN is not set in .env.local'); process.exit(1) }

const input = (process.argv[2] ?? '').trim()
const id = (input.match(/\b([UW][A-Z0-9]{8,14})\b/i) ?? [])[1]?.toUpperCase()
if (!id) { console.error('Give a Slack member id (U…) or a profile link: node --env-file=.env.local scripts/slack-test.mjs <id>'); process.exit(1) }

const res = await fetch('https://slack.com/api/chat.postMessage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ channel: id, text: '✅ ทดสอบ: Freshket Sale Tracking ส่งข้อความหาคุณได้แล้ว' }),
})
const json = await res.json()
if (json.ok) console.log(`Sent to ${id}. Check Slack.`)
else {
  console.error(`Slack refused: ${json.error}`)
  if (json.error === 'invalid_auth' || json.error === 'not_authed') console.error('→ the token is wrong or from another app')
  if (json.error === 'missing_scope') console.error('→ reinstall the app after adding scopes chat:write and im:write')
  if (json.error === 'channel_not_found' || json.error === 'user_not_found') console.error('→ the member id is wrong, or belongs to another workspace')
  process.exit(1)
}
