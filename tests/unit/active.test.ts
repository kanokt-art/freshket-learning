import { describe, it, expect } from 'vitest'
import { isActiveEmployee, onlyActiveEmployees } from '@/lib/users/active'

// The course-assignment pickers were counting resigned staff: the
// "ยังไม่มีทีม" bucket for Sales Management showed 74 people when only 2 of
// them still worked here — the other 72 were Resigned or No show. These tests
// pin the whitelist rule so a new HR status can't quietly slip back in.

describe('isActiveEmployee', () => {
  it('counts the literal "Active"', () => {
    expect(isActiveEmployee({ employmentStatus: 'Active' })).toBe(true)
  })

  it('counts a missing status — those records predate the HR sync', () => {
    expect(isActiveEmployee({})).toBe(true)
    expect(isActiveEmployee({ employmentStatus: undefined })).toBe(true)
  })

  it('excludes the statuses seen in live data', () => {
    expect(isActiveEmployee({ employmentStatus: 'Resigned' })).toBe(false)
    expect(isActiveEmployee({ employmentStatus: 'No show' })).toBe(false)
  })

  it('excludes an unrecognised status rather than assuming it is active', () => {
    // The whole point of the whitelist: a status HR adds later must not
    // default into the assignable roster.
    expect(isActiveEmployee({ employmentStatus: 'Terminated' })).toBe(false)
    expect(isActiveEmployee({ employmentStatus: 'On Leave' })).toBe(false)
  })

  it('is case- and whitespace-sensitive, matching the Employees list', () => {
    expect(isActiveEmployee({ employmentStatus: 'active' })).toBe(false)
    expect(isActiveEmployee({ employmentStatus: ' Active' })).toBe(false)
  })
})

describe('onlyActiveEmployees', () => {
  it('keeps active and status-less people, drops the rest', () => {
    const users = [
      { uid: 'a', employmentStatus: 'Active' },
      { uid: 'b', employmentStatus: 'Resigned' },
      { uid: 'c' },
      { uid: 'd', employmentStatus: 'No show' },
    ]
    expect(onlyActiveEmployees(users).map((u) => u.uid)).toEqual(['a', 'c'])
  })

  it('returns an empty list when everyone has left', () => {
    expect(onlyActiveEmployees([{ employmentStatus: 'Resigned' }])).toEqual([])
  })
})
