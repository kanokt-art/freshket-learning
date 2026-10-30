import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  postCompletionToSlack, postShadowSubmittedToSlack, postShadowAckedToSlack, postCoursePublishedToSlack,
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

  it('announcements to everyone (new course) keep using the webhook, not the group', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_TRAINER_CHANNEL_ID', 'C0C1C9GS7N1')
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T/B/X')
    await postCoursePublishedToSlack({ courseTitle: 'C', recipientCount: 3, isAddition: false })
    expect(calls[0].url).toBe('https://hooks.slack.com/services/T/B/X')
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
