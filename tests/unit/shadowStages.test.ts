import { describe, it, expect } from 'vitest'
import { memberStages, stageState } from '@/lib/shadow/stages'

describe('memberStages', () => {
  it('counts the visits each role has reviewed', () => {
    const reviews = new Map([
      ['a', [{ reviewerRole: 'team_lead' }, { reviewerRole: 'manager' }]],
      ['b', [{ reviewerRole: 'team_lead' }]],
      ['c', []],
    ])
    expect(memberStages(['a', 'b', 'c'], reviews)).toEqual({ visits: 3, teamLead: 2, manager: 1 })
  })

  it('counts a visit once however many people of a role reviewed it, and reads super_admin as manager', () => {
    const reviews = new Map([['a', [{ reviewerRole: 'manager' }, { reviewerRole: 'super_admin' }]]])
    expect(memberStages(['a'], reviews)).toEqual({ visits: 1, teamLead: 0, manager: 1 })
  })

  it('has nothing for a member without visits', () => {
    expect(memberStages([], new Map())).toEqual({ visits: 0, teamLead: 0, manager: 0 })
  })
})

describe('stageState', () => {
  it('is none, some or all', () => {
    expect(stageState(0, 3)).toBe('none')
    expect(stageState(2, 3)).toBe('some')
    expect(stageState(3, 3)).toBe('all')
    expect(stageState(0, 0)).toBe('none')
  })
})
