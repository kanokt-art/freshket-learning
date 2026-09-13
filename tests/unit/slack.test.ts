import { describe, it, expect, afterEach } from 'vitest'
import { isSalesDepartment, excerpt } from '@/lib/notifications/slack'

// The department string comes from the HR export and is not stable: live data
// says "Sales Management", the demo fixtures say "Sale". Getting this predicate
// wrong means either silence in the channel or notifying the whole company, and
// neither shows up in a type check.

const ORIGINAL = process.env.SLACK_SALES_DEPARTMENTS

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SLACK_SALES_DEPARTMENTS
  else process.env.SLACK_SALES_DEPARTMENTS = ORIGINAL
})

describe('isSalesDepartment — default configuration', () => {
  it('matches the live HR value', () => {
    expect(isSalesDepartment('Sales Management')).toBe(true)
  })

  it('matches the demo fixture value', () => {
    expect(isSalesDepartment('Sale')).toBe(true)
  })

  it('matches a renamed sales team', () => {
    expect(isSalesDepartment('Sales Management (BKK)')).toBe(true)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(isSalesDepartment('  sales management  ')).toBe(true)
    expect(isSalesDepartment('SALES')).toBe(true)
  })

  it('does not match other departments', () => {
    expect(isSalesDepartment('Key Account')).toBe(false)
    expect(isSalesDepartment('People & Engagement')).toBe(false)
    expect(isSalesDepartment('Tech&Product')).toBe(false)
  })

  it('does not match a department that merely contains "sale"', () => {
    // Prefix, not substring — "Wholesale Ops" is not the sales team.
    expect(isSalesDepartment('Wholesale Ops')).toBe(false)
  })

  it('treats a missing or blank department as not sales', () => {
    expect(isSalesDepartment(undefined)).toBe(false)
    expect(isSalesDepartment('')).toBe(false)
    expect(isSalesDepartment('   ')).toBe(false)
  })
})

describe('isSalesDepartment — configured via env', () => {
  it('honours an explicit list', () => {
    process.env.SLACK_SALES_DEPARTMENTS = 'Key Account, Commercial'
    expect(isSalesDepartment('Key Account')).toBe(true)
    expect(isSalesDepartment('Commercial Operations')).toBe(true)
    // The default no longer applies once overridden.
    expect(isSalesDepartment('Sales Management')).toBe(false)
  })

  it('supports a wildcard for notifying every department', () => {
    process.env.SLACK_SALES_DEPARTMENTS = '*'
    expect(isSalesDepartment('Tech&Product')).toBe(true)
    // Still false with no department at all — there is nothing to report.
    expect(isSalesDepartment(undefined)).toBe(true)
  })

  it('falls back to the default when set to an empty string', () => {
    process.env.SLACK_SALES_DEPARTMENTS = '   '
    expect(isSalesDepartment('Sales Management')).toBe(true)
  })
})

describe('excerpt', () => {
  it('leaves short text untouched', () => {
    expect(excerpt('สรุปสั้นๆ')).toBe('สรุปสั้นๆ')
  })

  it('collapses whitespace and newlines', () => {
    expect(excerpt('บรรทัดแรก\n\n  บรรทัดสอง')).toBe('บรรทัดแรก บรรทัดสอง')
  })

  it('truncates past the limit and marks it', () => {
    const out = excerpt('ก'.repeat(200))
    expect(out.endsWith('…')).toBe(true)
    // 100 characters plus the ellipsis.
    expect(out.length).toBe(101)
  })

  it('cuts on a word boundary when one is near the limit', () => {
    const text = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
    const out = excerpt(text, 50)
    expect(out.endsWith('…')).toBe(true)
    // The cut lands between words, so the last kept token is whole.
    expect(out.slice(0, -1).trim().split(' ').pop()).toMatch(/^word\d+$/)
  })

  it('takes a hard cut when there is no space to break on', () => {
    // Thai does not space between words — a boundary-only rule would return
    // almost nothing here.
    const out = excerpt('ก'.repeat(60) + ' ท้าย', 50)
    expect(out.length).toBeGreaterThan(40)
  })

  it('respects a custom limit', () => {
    expect(excerpt('ก'.repeat(50), 10)).toHaveLength(11)
  })
})
