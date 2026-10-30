import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendSlackDm, dmPeople, leadsOf, findSlackIdByEmail } from '@/lib/notifications/slackDm'
import type { Store } from '@/lib/server/store'

const docs: Record<string, Record<string, unknown>> = {
  'users/lead': { slackUserId: 'U0LEAD0001' },
  'users/lead2': {},                                  // no Slack id on file
  'users/mgr': { slackUserId: 'U0MGR00002' },
  'teams/t1': { teamLeadIds: ['lead', 'lead2'], managerIds: ['mgr'] },
}
const store = {
  get: async (path: string, id: string) => docs[`${path}/${id}`] ?? null,
  getMany: async (path: string, ids: string[]) => ids.map((id) => docs[`${path}/${id}`]).filter(Boolean),
} as unknown as Store

let calls: Array<{ url: string; body: Record<string, unknown>; auth: string | null }>
beforeEach(() => {
  calls = []
  vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization })
    return new Response(JSON.stringify({ ok: true }))
  }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('sendSlackDm', () => {
  it('posts to the member id with the bot token', async () => {
    expect(await sendSlackDm('U0LEAD0001', { text: 'hi' })).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage')
    expect(calls[0].body.channel).toBe('U0LEAD0001')
    expect(calls[0].auth).toBe('Bearer xoxb-test')
  })

  it('does nothing without a token, and reports Slack refusing', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    expect(await sendSlackDm('U0LEAD0001', { text: 'hi' })).toBe(false)
    expect(calls).toHaveLength(0)

    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }))))
    expect(await sendSlackDm('U0LEAD0001', { text: 'hi' })).toBe(false)
  })
})

describe('dmPeople', () => {
  it('messages only people with a Slack id, once each', async () => {
    const n = await dmPeople(store, ['lead', 'lead', 'lead2', 'mgr', 'nobody'], { text: 'x' })
    expect(n).toBe(2)
    expect(calls.map((c) => c.body.channel).sort()).toEqual(['U0LEAD0001', 'U0MGR00002'])
  })
})

describe('leadsOf', () => {
  it('is the line manager plus the team’s leads and managers, without repeats', async () => {
    const got = await leadsOf(store, { managerId: 'mgr', teamId: 't1' })
    expect(got.sort()).toEqual(['lead', 'lead2', 'mgr'])
  })

  it('has no everyone-fallback for someone unassigned', async () => {
    expect(await leadsOf(store, {})).toEqual([])
  })
})

describe('findSlackIdByEmail', () => {
  const reply = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

  it('returns the member id Slack gives for the email', async () => {
    reply({ ok: true, user: { id: 'U0FOUND001' } })
    expect(await findSlackIdByEmail('a@freshket.co')).toEqual({ id: 'U0FOUND001' })
  })

  it('says why there is none', async () => {
    reply({ ok: false, error: 'users_not_found' })
    expect(await findSlackIdByEmail('a@freshket.co')).toEqual({ reason: 'not_found' })
    reply({ ok: false, error: 'missing_scope' })
    expect(await findSlackIdByEmail('a@freshket.co')).toEqual({ reason: 'missing_scope' })
    reply({}, 429)
    expect(await findSlackIdByEmail('a@freshket.co')).toEqual({ reason: 'rate_limited' })
  })

  it('does not call Slack without a token', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    expect(await findSlackIdByEmail('a@freshket.co')).toEqual({ reason: 'no_token' })
    expect(calls).toHaveLength(0)
  })
})

describe('dmPeople finds a missing Slack id by email, once', () => {
  it('looks the person up, saves the id, and messages them', async () => {
    const saved: Array<[string, string, Record<string, unknown>]> = []
    const lookupStore = {
      getMany: async () => [{ id: 'new1', email: 'new1@freshket.co' }],
      update: async (p: string, id: string, d: Record<string, unknown>) => { saved.push([p, id, d]) },
    } as unknown as Store
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {}, auth: null })
      return new Response(JSON.stringify(url.includes('lookupByEmail') ? { ok: true, user: { id: 'U0NEWONE01' } } : { ok: true }))
    }))
    expect(await dmPeople(lookupStore, ['new1'], { text: 'x' })).toBe(1)
    expect(saved).toEqual([['users', 'new1', { slackUserId: 'U0NEWONE01' }]])
    expect(calls.find((c) => c.url.includes('chat.postMessage'))?.body.channel).toBe('U0NEWONE01')
  })

  it('stops asking Slack once the scope is missing', async () => {
    const people = [{ id: 'a', email: 'a@freshket.co' }, { id: 'b', email: 'b@freshket.co' }, { id: 'c', email: 'c@freshket.co' }]
    const s = { getMany: async () => people, update: async () => {} } as unknown as Store
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'missing_scope' })))
    vi.stubGlobal('fetch', fetchMock)
    // sequential batches of 10: all three go in the first batch, so they are all asked once; a later batch is not
    expect(await dmPeople(s, ['a', 'b', 'c'], { text: 'x' })).toBe(0)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3)
  })
})
