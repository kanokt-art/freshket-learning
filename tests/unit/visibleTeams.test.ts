import { describe, it, expect } from 'vitest'
import { cleanVisibleTeamIds, MAX_VISIBLE_TEAMS } from '@/lib/users/visibleTeams'

// /api/users/save-assignments runs on the Firebase Admin SDK, which bypasses
// firestore.rules completely. That makes this function the only validation
// between a manager's request body and the stored field that decides which
// teams they can see — so the malformed cases are tested explicitly, not
// assumed from the type signature (the route receives `unknown` at runtime
// regardless of what the TypeScript type claims).

describe('cleanVisibleTeamIds — accepted input', () => {
  it('passes through a clean list of ids', () => {
    expect(cleanVisibleTeamIds(['team-a', 'team_b', 'T3'])).toEqual(['team-a', 'team_b', 'T3'])
  })

  it('treats null as an explicit "clear the override"', () => {
    expect(cleanVisibleTeamIds(null)).toBeNull()
  })

  it('accepts an empty list — a manager who sees no teams is a real state', () => {
    expect(cleanVisibleTeamIds([])).toEqual([])
  })

  it('de-duplicates repeated ids', () => {
    expect(cleanVisibleTeamIds(['a', 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('accepts exactly the maximum length', () => {
    const ids = Array.from({ length: MAX_VISIBLE_TEAMS }, (_, i) => `t${i}`)
    expect(cleanVisibleTeamIds(ids)).toHaveLength(MAX_VISIBLE_TEAMS)
  })
})

describe('cleanVisibleTeamIds — rejected input', () => {
  // undefined is the caller's signal to skip the assignment entirely.
  it('rejects a non-array', () => {
    expect(cleanVisibleTeamIds('team-a')).toBeUndefined()
    expect(cleanVisibleTeamIds(42)).toBeUndefined()
    expect(cleanVisibleTeamIds({ 0: 'team-a' })).toBeUndefined()
  })

  it('rejects non-string members', () => {
    expect(cleanVisibleTeamIds(['ok', 7])).toBeUndefined()
    expect(cleanVisibleTeamIds(['ok', null])).toBeUndefined()
    expect(cleanVisibleTeamIds([{ id: 'nested' }])).toBeUndefined()
  })

  it('rejects ids with path separators, which could address another document', () => {
    expect(cleanVisibleTeamIds(['../users/admin'])).toBeUndefined()
    expect(cleanVisibleTeamIds(['teams/a'])).toBeUndefined()
  })

  it('rejects an empty-string id', () => {
    expect(cleanVisibleTeamIds([''])).toBeUndefined()
  })

  it('rejects an array longer than the cap', () => {
    const ids = Array.from({ length: MAX_VISIBLE_TEAMS + 1 }, (_, i) => `t${i}`)
    expect(cleanVisibleTeamIds(ids)).toBeUndefined()
  })

  it('rejects an over-long id rather than truncating it', () => {
    expect(cleanVisibleTeamIds(['x'.repeat(129)])).toBeUndefined()
  })

  it('rejects undefined — a caller must not reach here with a missing field', () => {
    expect(cleanVisibleTeamIds(undefined)).toBeUndefined()
  })
})
