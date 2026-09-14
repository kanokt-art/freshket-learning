import { describe, it, expect } from 'vitest'
import { parseCsvDate } from '@/lib/users/parseCsvDate'

// A real HR export spells September as "Sept" (4 letters) while every other
// month uses the standard 3-letter form. The original regex required exactly
// 3 letters, so every "Sept" row fell through to the JS engine's native
// `Date(string)` parser — non-ISO string parsing is implementation-defined,
// so the same string can parse differently, or fail outright, across
// browsers. A row that failed there lost its startDate silently: nothing
// erred, the field just became undefined, and every date-dependent view (the
// Employees list sort included) treated that person as having no start date
// at all rather than the real one from over a decade ago.

function ymd(d: Date | undefined): string {
  if (!d) return '(undefined)'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('parseCsvDate — DD-Mon-YYYY, 3-letter months', () => {
  it('parses every standard 3-letter month abbreviation', () => {
    const cases: [string, string][] = [
      ['1-Jan-2020', '2020-01-01'],
      ['1-Feb-2020', '2020-02-01'],
      ['18-Mar-2019', '2019-03-18'],
      ['1-Apr-2020', '2020-04-01'],
      ['1-May-2019', '2019-05-01'],
      ['1-Jun-2016', '2016-06-01'],
      ['1-Jul-2020', '2020-07-01'],
      ['27-Aug-2018', '2018-08-27'],
      ['1-Oct-2020', '2020-10-01'],
      ['16-Oct-2017', '2017-10-16'],
      ['1-Nov-2020', '2020-11-01'],
      ['1-Dec-2020', '2020-12-01'],
    ]
    for (const [input, expected] of cases) {
      expect(ymd(parseCsvDate(input))).toBe(expected)
    }
  })
})

describe('parseCsvDate — the "Sept" regression', () => {
  it('parses the real export\'s 4-letter September abbreviation', () => {
    expect(ymd(parseCsvDate('19-Sept-2016'))).toBe('2016-09-19')
  })

  it('parses a single-digit day with "Sept"', () => {
    expect(ymd(parseCsvDate('9-Sept-2019'))).toBe('2019-09-09')
  })

  it('still parses the standard 3-letter "Sep" the same way', () => {
    expect(ymd(parseCsvDate('19-Sep-2016'))).toBe('2016-09-19')
  })

  it('agrees on the same date regardless of which spelling was used', () => {
    expect(parseCsvDate('19-Sep-2016')?.getTime()).toBe(parseCsvDate('19-Sept-2016')?.getTime())
  })
})

describe('parseCsvDate — other supported formats', () => {
  it('parses DD/MM/YYYY', () => {
    expect(ymd(parseCsvDate('05/03/2021'))).toBe('2021-03-05')
  })

  it('is case-insensitive on the month token', () => {
    expect(ymd(parseCsvDate('1-JUN-2016'))).toBe('2016-06-01')
    expect(ymd(parseCsvDate('1-jun-2016'))).toBe('2016-06-01')
  })
})

describe('parseCsvDate — rejects what it cannot read confidently', () => {
  it('returns undefined for an empty string', () => {
    expect(parseCsvDate('')).toBeUndefined()
  })

  it('returns undefined for an unrecognised month name rather than guessing', () => {
    expect(parseCsvDate('1-Xyz-2020')).toBeUndefined()
  })
})
