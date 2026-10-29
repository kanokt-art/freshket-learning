import { describe, it, expect } from 'vitest'
import { parseSheetTimestamp, toShadowRecord, type ShadowSheetRow } from '@/lib/shadow/sheetImport'

// The Shadow sheet writes "04/03/2569 21:15:57": day/month, Buddhist year, Thai time.
// Google Sheets reads the ones with a day of 12 or less as month/day in the Gregorian
// year 2569, and leaves the rest as text — so the first sync filed 17 visits in the
// year 2569 with day and month swapped, and silently dropped the others. These use the
// real values from the exported sheet.

const NOW = new Date('2026-10-29T12:00:00+07:00')
const iso = (raw: string) => parseSheetTimestamp(raw)?.toISOString()

describe('parseSheetTimestamp — the values the sheet really holds', () => {
  it.each([
    // day/month ambiguous: the day comes FIRST
    ['11/02/2569 20:48:27', '2026-02-11T13:48:27.000Z'],
    ['04/03/2569 21:15:57', '2026-03-04T14:15:57.000Z'],
    ['09/03/2569 10:21:24', '2026-03-09T03:21:24.000Z'],
    ['05/08/2569 14:29:07', '2026-08-05T07:29:07.000Z'],
    // a day above 12 cannot be month/day — this is the text the first sync dropped
    ['17/3/2569 17:19:15', '2026-03-17T10:19:15.000Z'],
    ['19/8/2569 15:25:41', '2026-08-19T08:25:41.000Z'],
    ['21/10/2569 20:39:38', '2026-10-21T13:39:38.000Z'],
    ['3/9/2569 11:24:48', '2026-09-03T04:24:48.000Z'],
  ])('%s → %s (Thai time)', (raw, want) => expect(iso(raw)).toBe(want))

  it('treats the year as Buddhist only above 2400, so a Gregorian year is left alone', () => {
    expect(iso('16/02/2026 07:37:57')).toBe('2026-02-16T00:37:57.000Z')
  })

  it('reads a date with no time as midnight Thai time', () => {
    expect(iso('04/03/2569')).toBe('2026-03-03T17:00:00.000Z')
  })

  it('reads a time with no seconds', () => {
    expect(iso('04/03/2569 21:15')).toBe('2026-03-04T14:15:00.000Z')
  })

  it('still reads an ISO timestamp, which is what the app and the other tests send', () => {
    expect(iso('2026-02-16T00:37:57.000Z')).toBe('2026-02-16T00:37:57.000Z')
  })

  it.each(['', '   ', 'yesterday', '31/02/2569 10:00:00', '00/03/2569', '12/13/2569', '04/03/2569 25:00:00', '2569-03-04'])(
    'does not guess for %j', (raw) => expect(parseSheetTimestamp(raw)).toBeNull())

  it('accepts a leap day only in a leap year', () => {
    expect(iso('29/02/2567 10:00:00')).toBeTruthy()    // 2024
    expect(parseSheetTimestamp('29/02/2569 10:00:00')).toBeNull()   // 2026
  })
})

describe('toShadowRecord — what a wrongly read date does now', () => {
  const observer = { uid: 'csv-1', name: 'Rin' }
  const row = (timestamp: string): ShadowSheetRow => ({ timestamp, observerEmail: 'rin@freshket.co', storeName: 'Ban Pasta' })

  it('dates the record by the visit, day first', () => {
    const r = toShadowRecord(row('04/03/2569 21:15:57'), observer, NOW)
    expect(r.ok && (r.data.createdAt as Date).toISOString()).toBe('2026-03-04T14:15:57.000Z')
  })

  it('refuses a date in the future, which is how the year 2569 got in', () => {
    // The old behaviour: an ISO date in the year 2569 went straight through.
    const r = toShadowRecord(row('2569-03-04T14:15:57.000Z'), observer, NOW)
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('อนาคต') })
  })

  it('allows a visit logged today', () => {
    expect(toShadowRecord(row('29/10/2569 09:00:00'), observer, NOW)).toMatchObject({ ok: true })
  })

  it('says what it could not read, so the row can be found in the sheet', () => {
    const r = toShadowRecord(row('31/02/2569 10:00:00'), observer, NOW)
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('31/02/2569') })
  })

  it('gives the same id however many times the same text is read', () => {
    const a = toShadowRecord(row('04/03/2569 21:15:57'), observer, NOW)
    const b = toShadowRecord(row('04/03/2569 21:15:57'), observer, NOW)
    expect(a.ok && b.ok && a.id === b.id).toBe(true)
  })

  it('keeps the day-12-or-less and day-over-12 rows of one sheet in the right order', () => {
    const early = toShadowRecord(row('04/03/2569 21:15:57'), observer, NOW)
    const later = toShadowRecord(row('17/3/2569 17:19:15'), observer, NOW)
    expect(early.ok && later.ok && (early.data.createdAt as Date) < (later.data.createdAt as Date)).toBe(true)
  })
})
