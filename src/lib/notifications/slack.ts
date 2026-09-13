// Slack fan-out for training events.
//
// The in-app bell only reaches someone who already has the LMS open, which is
// the wrong assumption for a sales team that lives in Slack. This posts the
// same event to a channel via an Incoming Webhook.
//
// SERVER ONLY — the webhook URL is a bearer credential: anyone holding it can
// post into the channel as this app. It must never reach the browser, so this
// module reads a non-NEXT_PUBLIC_ env var and is only imported from route
// handlers.

/**
 * Which departments count as "sales" for Slack purposes.
 *
 * Live HR data uses `Sales Management`; the demo fixtures use plain `Sale`.
 * Matching on a prefix covers both, and survives HR renaming the team to
 * something like `Sales Management (BKK)` without a code change. Configurable
 * because that guess will eventually be wrong.
 *
 * Set SLACK_SALES_DEPARTMENTS to a comma-separated list to override, or to `*`
 * to notify for every department.
 */
function salesPrefixes(): string[] {
  const raw = process.env.SLACK_SALES_DEPARTMENTS?.trim()
  if (!raw) return ['sale'] // matches Sale, Sales, Sales Management, ...
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

export function isSalesDepartment(department: string | undefined): boolean {
  const prefixes = salesPrefixes()
  if (prefixes.includes('*')) return true
  const d = (department ?? '').trim().toLowerCase()
  if (!d) return false
  return prefixes.some((p) => d.startsWith(p))
}

export interface SlackCompletionEvent {
  learnerName: string
  position?: string
  department?: string
  courseTitle: string
  score: number
  passed: boolean
  /** No auto-gradeable questions — the score isn't a verdict. */
  awaitingReview: boolean
  courseUrl?: string
}

/**
 * Post a course-completion card to Slack. Best-effort by contract: a Slack
 * outage must never fail a submission that was already graded and recorded, so
 * every error is swallowed after logging.
 *
 * Returns true only when Slack accepted the message — used by tests and for
 * log-reading, not for control flow at the call site.
 */
export async function postCompletionToSlack(ev: SlackCompletionEvent): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL?.trim()
  if (!webhook) return false // integration simply not configured

  const meta = [ev.position, ev.department].filter(Boolean).join(' · ')
  const verdict = ev.awaitingReview
    ? '📝 ส่งคำตอบแบบเขียนแล้ว รอตรวจ'
    : ev.passed
      ? `✅ ผ่าน — ${ev.score} คะแนน`
      : `❌ ยังไม่ผ่านเกณฑ์ — ${ev.score} คะแนน`

  // Block Kit rather than a bare `text`, so the message renders as a card in
  // the channel. `text` is still set because Slack uses it for the notification
  // preview and for clients that can't render blocks.
  const payload = {
    text: `${ev.learnerName} เรียนจบ "${ev.courseTitle}" — ${ev.passed ? 'ผ่าน' : 'ยังไม่ผ่าน'}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${ev.learnerName}* เรียนจบหลักสูตร\n*${ev.courseTitle}*`,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: verdict },
          ...(meta ? [{ type: 'mrkdwn' as const, text: meta }] : []),
        ],
      },
      ...(ev.courseUrl
        ? [{
            type: 'actions',
            elements: [{
              type: 'button',
              text: { type: 'plain_text', text: 'ดูหลักสูตร' },
              url: ev.courseUrl,
            }],
          }]
        : []),
    ],
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // A hanging Slack must not hold the serverless function open.
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      console.error('Slack webhook rejected', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('Slack webhook failed', err)
    return false
  }
}
