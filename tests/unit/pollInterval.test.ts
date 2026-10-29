import { describe, it, expect } from 'vitest'
import { pollIntervalFor, POLL_NOTIFICATIONS_MS, POLL_DEFAULT_MS, POLL_SLOW_MS } from '@/lib/data/pollInterval'

describe('pollIntervalFor', () => {
  it('checks notifications most often: someone is waiting for them', () => {
    expect(pollIntervalFor('notifications/csv-E1/items')).toBe(POLL_NOTIFICATIONS_MS)
    expect(POLL_NOTIFICATIONS_MS).toBe(30_000)
  })

  it.each(['courses', 'trainingRecords', 'assessments', 'tools', 'mandatoryItems', 'userBucketResults'])(
    'checks %s every minute', (path) => {
      expect(pollIntervalFor(path)).toBe(POLL_DEFAULT_MS)
      expect(POLL_DEFAULT_MS).toBe(60_000)
    })

  it.each(['users', 'teams', 'departments', 'appConfig'])(
    'checks %s every five minutes — the employee list is large and rarely changes', (path) => {
      expect(pollIntervalFor(path)).toBe(POLL_SLOW_MS)
      expect(POLL_SLOW_MS).toBe(300_000)
    })

  it('is ordered: notifications faster than the default, the default faster than slow data', () => {
    expect(POLL_NOTIFICATIONS_MS).toBeLessThan(POLL_DEFAULT_MS)
    expect(POLL_DEFAULT_MS).toBeLessThan(POLL_SLOW_MS)
  })

  it('does not treat a collection that merely starts with a slow name as slow', () => {
    expect(pollIntervalFor('usersExtra')).toBe(POLL_DEFAULT_MS)
    expect(pollIntervalFor('teamsArchive')).toBe(POLL_DEFAULT_MS)
  })
})
