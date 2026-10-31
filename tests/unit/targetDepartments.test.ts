import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DEFAULT_TARGET_DEPARTMENTS, PHASE1_DEPARTMENTS, isTargetDepartment, parseTargetDepartments, setTargetDepartments,
} from '@/lib/modules'
import { refreshTargetDepartments, resetTargetDepartmentsCache } from '@/lib/server/targetDepartments'

beforeEach(() => {
  setTargetDepartments(DEFAULT_TARGET_DEPARTMENTS)
  resetTargetDepartmentsCache()
})

describe('parseTargetDepartments', () => {
  it('uses the defaults when there is no setting', () => {
    expect(parseTargetDepartments(null)).toEqual(DEFAULT_TARGET_DEPARTMENTS)
    expect(parseTargetDepartments({})).toEqual(DEFAULT_TARGET_DEPARTMENTS)
    expect(parseTargetDepartments({ departments: 'nope' })).toEqual(DEFAULT_TARGET_DEPARTMENTS)
  })

  it('takes the names in the setting, trimmed, once each, ignoring anything that is not a name', () => {
    expect(parseTargetDepartments({ departments: ['Logistics ', 'Logistics', '', 7, 'Marketing'] })).toEqual(['Logistics', 'Marketing'])
  })

  it('an empty list switches every department off', () => {
    expect(parseTargetDepartments({ departments: [] })).toEqual([])
  })
})

describe('the live target list', () => {
  it('starts with the defaults', () => {
    expect(isTargetDepartment('Commercial')).toBe(true)
    expect(isTargetDepartment('Logistics')).toBe(false)
    expect(isTargetDepartment(undefined)).toBe(false)
  })

  it('follows the setting in place, so every holder of PHASE1_DEPARTMENTS sees it', () => {
    const held = PHASE1_DEPARTMENTS
    setTargetDepartments(['Logistics'])
    expect(held.has('Logistics')).toBe(true)
    expect(held.has('Commercial')).toBe(false)
    expect(isTargetDepartment('Logistics')).toBe(true)
  })
})

describe('refreshTargetDepartments (server)', () => {
  it('loads the setting', async () => {
    const store = { get: vi.fn(async () => ({ departments: ['Logistics'] })) }
    await refreshTargetDepartments(store)
    expect(isTargetDepartment('Logistics')).toBe(true)
    expect(isTargetDepartment('Commercial')).toBe(false)
  })

  it('reads at most once in the cache window', async () => {
    const store = { get: vi.fn(async () => ({ departments: ['Logistics'] })) }
    await refreshTargetDepartments(store, 100_000)
    await refreshTargetDepartments(store, 101_000)
    expect(store.get).toHaveBeenCalledTimes(1)
    await refreshTargetDepartments(store, 140_000)
    expect(store.get).toHaveBeenCalledTimes(2)
  })

  it('keeps the current list when the read fails: a database blip must not switch a department off', async () => {
    setTargetDepartments(['Logistics'])
    await refreshTargetDepartments({ get: async () => { throw new Error('down') } })
    expect(isTargetDepartment('Logistics')).toBe(true)
  })

  it('uses the defaults when no setting is saved yet', async () => {
    setTargetDepartments(['Logistics'])
    await refreshTargetDepartments({ get: async () => null })
    expect(isTargetDepartment('Commercial')).toBe(true)
  })
})
