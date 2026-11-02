import { describe, it, expect, vi, beforeEach } from 'vitest'
import { teamLeadsOf, resetTeamLeadLookups } from '@/lib/server/teamLeads'

type Doc = Record<string, unknown>
let docs: Record<string, Doc[]>
const store = {
  get: async (path: string, id: string) => (docs[path] ?? []).find((d) => d.id === id) ?? null,
  getMany: async (path: string, ids: string[]) => (docs[path] ?? []).filter((d) => ids.includes(d.id as string)),
}

beforeEach(() => {
  resetTeamLeadLookups()
  docs = {
    teams: [{ id: 't1', name: 'A', teamLeadIds: ['l1', 'l2', 'l3', 'gone', 'me'] }],
    users: [
      { id: 'l1', displayNameEN: 'Malee Sriwong', nickname: 'Mali', email: 'malee.s@freshket.co', slackUserId: 'U01ABCDEF2' },
      { id: 'l2', displayNameEN: 'Somsak Prasert', nickname: 'Sak', email: 'somsak.p@freshket.co' },
      { id: 'l3', email: 'nobody@freshket.co' },
      { id: 'gone', displayNameEN: 'Gone Lead', email: 'gone@freshket.co', employmentStatus: 'Resigned' },
      { id: 'me', displayNameEN: 'The Learner', email: 'me@freshket.co' },
    ],
  }
})

describe('teamLeadsOf', () => {
  it('names a lead as First (Nickname) Surname, and by email when there is no name', async () => {
    const lookup = vi.fn(async () => ({ reason: 'not_found' as const }))
    const leads = await teamLeadsOf(store, { teamId: 't1', uid: 'me' }, lookup)
    expect(leads.map((l) => l.name)).toEqual(['Malee (Mali) Sriwong', 'Somsak (Sak) Prasert', 'nobody@freshket.co'])
  })

  it('uses the Slack id on file, and finds the rest by company email', async () => {
    const lookup = vi.fn(async (email: string) => (email === 'somsak.p@freshket.co' ? { id: 'U02ZZZZZZ9' } : { reason: 'not_found' as const }))
    const leads = await teamLeadsOf(store, { teamId: 't1', uid: 'me' }, lookup)
    expect(leads[0].slackUserId).toBe('U01ABCDEF2')          // on file: no lookup
    expect(leads[1].slackUserId).toBe('U02ZZZZZZ9')          // found by email
    expect(leads[2].slackUserId).toBeUndefined()             // Slack does not know them: plain name
    expect(lookup).not.toHaveBeenCalledWith('malee.s@freshket.co')
  })

  it('does not ask Slack again for someone it could not find, within the cache window', async () => {
    const lookup = vi.fn(async () => ({ reason: 'not_found' as const }))
    await teamLeadsOf(store, { teamId: 't1', uid: 'me' }, lookup)
    const calls = lookup.mock.calls.length
    await teamLeadsOf(store, { teamId: 't1', uid: 'me' }, lookup)
    expect(lookup.mock.calls.length).toBe(calls)
  })

  it('leaves out the learner themself and anyone who has left', async () => {
    const leads = await teamLeadsOf(store, { teamId: 't1', uid: 'me' }, async () => ({ reason: 'not_found' as const }))
    expect(leads.map((l) => l.name).join(' ')).not.toContain('Learner')
    expect(leads.map((l) => l.name).join(' ')).not.toContain('Gone')
  })

  it('is empty without a team, and never throws', async () => {
    expect(await teamLeadsOf(store, {}, async () => ({}))).toEqual([])
    expect(await teamLeadsOf({ get: async () => { throw new Error('down') }, getMany: async () => [] }, { teamId: 't1' }, async () => ({}))).toEqual([])
  })
})
