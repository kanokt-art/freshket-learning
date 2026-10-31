import { describe, it, expect } from 'vitest'
import { formatTenure, tenureLabel } from '@/lib/users/tenure'
import { isExcludedPosition } from '@/lib/users/excludedPositions'

const now = new Date(2026, 9, 31) // 31 Oct 2026

describe('formatTenure', () => {
  it('reads years, months and days', () => {
    expect(formatTenure(new Date(2024, 6, 26), now)).toBe('2 ปี 3 เดือน 5 วัน')
    expect(formatTenure(new Date(2026, 9, 24), now)).toBe('7 วัน')
    expect(formatTenure(new Date(2025, 9, 31), now)).toBe('1 ปี')
  })

  it('borrows the right month length when the day is earlier', () => {
    // 31 Jan -> 28 Feb 2026 is 28 days, not a month
    expect(formatTenure(new Date(2026, 0, 31), new Date(2026, 1, 28))).toBe('28 วัน')
  })

  it('says today on the first day and a dash for no date', () => {
    expect(formatTenure(now, now)).toBe('วันนี้')
    expect(formatTenure(undefined, now)).toBe('—')
    expect(formatTenure('not a date', now)).toBe('—')
  })
})

describe('tenureLabel', () => {
  it('is null for a missing or future start date, so no badge is shown', () => {
    expect(tenureLabel(undefined, now)).toBeNull()
    expect(tenureLabel(new Date(2026, 10, 2), now)).toBeNull()
    expect(tenureLabel(new Date(2026, 5, 1), now)).toBe('4 เดือน 30 วัน')
  })
})

describe('isExcludedPosition', () => {
  it('leaves out maids and masseuses', () => {
    expect(isExcludedPosition('Maid')).toBe(true)
    expect(isExcludedPosition('Masseuse')).toBe(true)
    expect(isExcludedPosition('masseur')).toBe(true)
  })

  it('keeps everyone else', () => {
    expect(isExcludedPosition('People Admin')).toBe(false)
    expect(isExcludedPosition('Mermaid Designer')).toBe(false)
    expect(isExcludedPosition(undefined)).toBe(false)
  })
})
