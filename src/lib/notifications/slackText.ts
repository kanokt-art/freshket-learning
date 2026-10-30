// Text that came from a person or a database row, made safe to put in a Slack message.
//
// Slack's mrkdwn gives meaning to <...>: <!channel> pings everyone, <@U123> mentions a
// person, <https://x|label> is a link with any label. Slack asks senders to escape the
// three characters below, which turns all of those into plain text. Without it, a course
// title, a name or a visit summary containing "<!channel>" would ping the whole channel.
//
// Use it on every dynamic string; leave it off the fixed markup the code itself writes
// (the deliberate "<!channel>" on a new course is written literally, not escaped).

export function slackText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
