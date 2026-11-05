import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  postCompletionToSlack, postShadowSubmittedToSlack, postShadowAckedToSlack, postCoursePublishedToSlack, postMandatoryPublishedToSlack,
} from '@/lib/notifications/slack'
import { dmPeople } from '@/lib/notifications/slackDm'
import type { Store } from '@/lib/server/store'

// Which Slack channel an event lands in: the trainer × team-lead group (through the bot)
// when it is configured, the webhook's channel otherwise.

let calls: Array<{ url: string; body: Record<string, unknown> }>
beforeEach(() => {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify({ ok: true }))
  }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const completion = { learnerName: 'A', courseTitle: 'C', score: 90, passed: true, awaitingReview: false }
const submitted = { observerName: 'A', visitSummary: 'ร้าน X' }
const acked = { reviewerName: 'TL', observerName: 'A', rating: 4 }

describe('events for trainers and team leads', () => {
  it.each([
    ['quiz completed', () => postCompletionToSlack(completion)],
    ['shadow visit submitted', () => postShadowSubmittedToSlack(submitted)],
    ['shadow visit reviewed', () => postShadowAckedToSlack(acked)],
  ])('%s goes to the group through the bot when it is configured', async (_n, send) => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_TRAINER_CHANNEL_ID', 'C0C1C9GS7N1')
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T/B/X')
    expect(await send()).toBe(true)
    expect(calls).toHaveLength(1)                       // once — not also to the webhook
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage')
    expect(calls[0].body.channel).toBe('C0C1C9GS7N1')
  })

  it.each([
    ['quiz completed', () => postCompletionToSlack(completion)],
    ['shadow visit submitted', () => postShadowSubmittedToSlack(submitted)],
    ['shadow visit reviewed', () => postShadowAckedToSlack(acked)],
  ])('%s still uses the webhook when the group is not configured', async (_n, send) => {
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    vi.stubEnv('SLACK_TRAINER_CHANNEL_ID', '')
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T/B/X')
    expect(await send()).toBe(true)
    expect(calls[0].url).toBe('https://hooks.slack.com/services/T/B/X')
  })

  it('posts nowhere, quietly, when nothing is configured', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    vi.stubEnv('SLACK_TRAINER_CHANNEL_ID', '')
    vi.stubEnv('SLACK_WEBHOOK_URL', '')
    expect(await postShadowSubmittedToSlack(submitted)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('a course notice does not go to the trainer group', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_TRAINER_CHANNEL_ID', 'C0C1C9GS7N1')
    vi.stubEnv('SLACK_COURSE_CHANNEL_ID', '')
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T/B/X')
    await postCoursePublishedToSlack({ courseTitle: 'C', recipientCount: 3, isAddition: false })
    expect(calls[0].url).toBe('https://hooks.slack.com/services/T/B/X')
  })
})

describe('course notices', () => {
  it('a new course goes to the course channel through the bot, tagging the channel', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_COURSE_CHANNEL_ID', 'C08MCUBS8G1')
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T/B/X')
    expect(await postCoursePublishedToSlack({ courseTitle: 'PVP', recipientCount: 5, isAddition: false })).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage')
    expect(calls[0].body.channel).toBe('C08MCUBS8G1')
    expect(String(calls[0].body.text)).toContain('<!channel>')
    expect(JSON.stringify(calls[0].body.blocks)).toContain('<!channel>')
  })

  it('people added to a live course are posted there without tagging the channel', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_COURSE_CHANNEL_ID', 'C08MCUBS8G1')
    await postCoursePublishedToSlack({ courseTitle: 'PVP', recipientCount: 2, isAddition: true })
    expect(calls[0].body.channel).toBe('C08MCUBS8G1')
    expect(String(calls[0].body.text)).not.toContain('<!channel>')
    expect(JSON.stringify(calls[0].body.blocks)).not.toContain('<!channel>')
  })

  it('uses the webhook as before when the course channel is not configured', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_COURSE_CHANNEL_ID', '')
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T/B/X')
    await postCoursePublishedToSlack({ courseTitle: 'PVP', recipientCount: 5, isAddition: false })
    expect(calls[0].url).toBe('https://hooks.slack.com/services/T/B/X')
  })
})

// A Mandatory Reading used to need the webhook alone: with the bot set up and no (or a revoked) webhook it
// posted nothing, quietly. It now goes where a course notice goes.
describe('Mandatory Reading notices', () => {
  const mandatory = { title: 'ราคาผัก', departments: [], recipientCount: 4, url: 'https://app.example/courses/mandatory' }

  it('go to the course channel through the bot even with no webhook', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_COURSE_CHANNEL_ID', 'C08MCUBS8G1')
    vi.stubEnv('SLACK_WEBHOOK_URL', '')
    expect(await postMandatoryPublishedToSlack(mandatory)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage')
    expect(calls[0].body.channel).toBe('C08MCUBS8G1')
    expect(String(calls[0].body.text)).toContain('ราคาผัก')
  })

  it('use the webhook as before when the course channel is not configured', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    vi.stubEnv('SLACK_COURSE_CHANNEL_ID', '')
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T/B/X')
    expect(await postMandatoryPublishedToSlack(mandatory)).toBe(true)
    expect(calls[0].url).toBe('https://hooks.slack.com/services/T/B/X')
  })

  it('post nowhere, and say so, when nothing is configured', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    vi.stubEnv('SLACK_COURSE_CHANNEL_ID', '')
    vi.stubEnv('SLACK_WEBHOOK_URL', '')
    expect(await postMandatoryPublishedToSlack(mandatory)).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('dmPeople', () => {
  const users = Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, slackUserId: i % 3 === 0 ? undefined : `U0000000${String(i).padStart(2, '0')}`, department: i < 10 ? 'Sale' : 'Ops' }))
  const store = { getMany: async (_p: string, ids: string[]) => users.filter((u) => ids.includes(u.id)) } as unknown as Store

  it('messages only people with a Slack link, and only those the filter keeps', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    const all = users.map((u) => u.id)
    const withLink = users.filter((u) => u.slackUserId).length
    expect(await dmPeople(store, all, { text: 'x' })).toBe(withLink)

    calls.length = 0
    const sale = users.filter((u) => u.slackUserId && u.department === 'Sale').length
    expect(await dmPeople(store, all, { text: 'x' }, (u) => (u as { department?: string }).department === 'Sale')).toBe(sale)
    expect(calls).toHaveLength(sale)
  })

  it('does nothing for an empty list', async () => {
    expect(await dmPeople(store, [], { text: 'x' })).toBe(0)
  })
})

describe('a Shadow visit and its reviews in the group', () => {
  const bot = () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_TRAINER_CHANNEL_ID', 'C0C1C9GS7N1')
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ ok: true, ts: '1700000000.000100', channel: 'C0C1C9GS7N1' }))
    }))
  }

  it('tags the team lead, the manager and the trainer, and hands back where it posted', async () => {
    bot()
    let ref: unknown
    await postShadowSubmittedToSlack({
      ...submitted,
      teamLeads: [{ name: 'Lead', slackUserId: 'U0LEAD0001' }],
      managers: [{ name: 'Mgr', slackUserId: 'U0MGR00002' }],
      trainers: [{ name: 'Trainer', slackUserId: 'U0TRN00003' }],
      onPosted: (r) => { ref = r },
    })
    const text = JSON.stringify(calls[0].body.blocks)
    expect(text).toContain('Team Lead: <@U0LEAD0001>')
    expect(text).toContain('Manager: <@U0MGR00002>')
    expect(text).toContain('Sale Trainer: <@U0TRN00003>')
    expect(ref).toEqual({ channel: 'C0C1C9GS7N1', ts: '1700000000.000100' })
  })

  it('replies under the visit post and tags the trainer', async () => {
    bot()
    await postShadowAckedToSlack({
      ...acked,
      trainers: [{ name: 'Trainer', slackUserId: 'U0TRN00003' }],
      replyTo: { channel: 'C0C1C9GS7N1', ts: '1700000000.000100' },
    })
    expect(calls[0].body.thread_ts).toBe('1700000000.000100')
    expect(JSON.stringify(calls[0].body.blocks)).toContain('Sale Trainer: <@U0TRN00003>')
  })

  it('posts a review on its own when the visit post cannot be replied to', async () => {
    bot()
    await postShadowAckedToSlack(acked)
    expect(calls[0].body.thread_ts).toBeUndefined()
  })
})
