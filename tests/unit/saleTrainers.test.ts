import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { saleTrainers, resetTrainerLookups } from '@/lib/server/saleTrainers'
import { trainerLine, teamLeadLine } from '@/lib/notifications/slack'

beforeEach(() => resetTrainerLookups())
afterEach(() => vi.unstubAllEnvs())

describe('saleTrainers', () => {
  it('finds the trainer in Slack by company email and keeps the id', async () => {
    const lookup = vi.fn(async () => ({ id: 'U07ABCDEF12' }))
    const first = await saleTrainers(lookup)
    expect(first).toEqual([{ name: 'Kanok (Benz) Thongtaem', slackUserId: 'U07ABCDEF12' }])
    await saleTrainers(lookup)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith('kanok.t@freshket.co')
  })

  it('names the trainer in plain text when Slack cannot find them, and does not ask again at once', async () => {
    const lookup = vi.fn(async () => ({ reason: 'not_found' as const }))
    expect(await saleTrainers(lookup)).toEqual([{ name: 'Kanok (Benz) Thongtaem' }])
    await saleTrainers(lookup)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('SLACK_TRAINER_EMAILS changes who is tagged; junk entries are ignored', async () => {
    vi.stubEnv('SLACK_TRAINER_EMAILS', 'a@freshket.co, not-an-email ,b@freshket.co')
    const lookup = vi.fn(async (e: string) => ({ id: e.startsWith('a') ? 'U0AAAAAAAA1' : undefined }))
    const r = await saleTrainers(lookup)
    expect(r).toEqual([{ name: 'a@freshket.co', slackUserId: 'U0AAAAAAAA1' }, { name: 'b@freshket.co' }])
  })

  it('never throws', async () => {
    expect(await saleTrainers(async () => { throw new Error('down') })).toEqual([])
  })
})

describe('trainerLine', () => {
  it('mentions by id, labelled Sale Trainer, and cannot be made to mention anyone else', () => {
    expect(trainerLine([{ name: 'Kanok', slackUserId: 'U07ABCDEF12' }])).toBe('Sale Trainer: <@U07ABCDEF12>')
    expect(trainerLine([{ name: '<!channel> x' }])).toBe('Sale Trainer: &lt;!channel&gt; x')
    expect(trainerLine([])).toBe('')
    expect(teamLeadLine([{ name: 'Malee', slackUserId: 'U01ABCDEF2' }])).toBe('Team Lead: <@U01ABCDEF2>')
  })
})
