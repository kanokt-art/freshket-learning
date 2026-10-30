import { describe, it, expect } from 'vitest'
import { departmentAccessFromLast } from '@/lib/mandatory'

const ROLLOUT = new Set(['Sales Management', 'Commercial', 'Key Account Management', 'Portfolio Management'])

describe('departmentAccessFromLast', () => {
  it('starts a new item from the last one, keeping each "แสดงผลทั้งหมด" tick', () => {
    const got = departmentAccessFromLast(
      { departments: ['Sales Management', 'Commercial', 'Portfolio Management'], historyDepartments: ['Sales Management', 'Portfolio Management'] },
      ROLLOUT,
    )
    expect(got).toEqual([
      { department: 'Sales Management', showHistory: true },
      { department: 'Commercial', showHistory: false },
      { department: 'Portfolio Management', showHistory: true },
    ])
  })

  it('drops a department that is no longer in the rollout, and its tick with it', () => {
    const got = departmentAccessFromLast(
      { departments: ['Sales Management', 'Tech&Product'], historyDepartments: ['Tech&Product'] },
      ROLLOUT,
    )
    expect(got).toEqual([{ department: 'Sales Management', showHistory: false }])
  })

  it('is empty (everyone in the rollout) when nothing was remembered', () => {
    expect(departmentAccessFromLast({ departments: [], historyDepartments: [] }, ROLLOUT)).toEqual([])
  })

  it('ignores a tick for a department that was not selected', () => {
    const got = departmentAccessFromLast({ departments: ['Commercial'], historyDepartments: ['Sales Management'] }, ROLLOUT)
    expect(got).toEqual([{ department: 'Commercial', showHistory: false }])
  })
})
