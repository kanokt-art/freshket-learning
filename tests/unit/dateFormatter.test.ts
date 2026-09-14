import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { toDate } from '@/lib/utils/dateFormatter'

// A user's startDate reaches the app three different shapes depending on
// where it came from: a Firestore Timestamp (the normal case, via
// convertTimestamps), a plain Date (freshly parsed from a CSV upload before
// it round-trips through Firestore), or an ISO string (a record still sitting
// in the localStorage import overlay, which JSON.stringify/parse strips back
// to a string). The Employees list sort comparator used to check only
// `instanceof Date`, silently treating a Timestamp or string startDate as
// epoch 0 — while formatDate/formatDateEN displayed the same value correctly,
// so the date looked right on screen but sorted as if it didn't exist.

describe('toDate', () => {
  it('passes through a real Date unchanged', () => {
    const d = new Date('2018-08-27')
    expect(toDate(d)).toBe(d)
  })

  it('converts a Firestore Timestamp', () => {
    const ts = Timestamp.fromDate(new Date('2016-06-01'))
    expect(toDate(ts)?.getTime()).toBe(new Date('2016-06-01').getTime())
  })

  it('parses an ISO string — the shape a localStorage-overlay record has after JSON round-tripping', () => {
    const iso = new Date('2017-10-16').toISOString()
    expect(toDate(iso)?.getTime()).toBe(new Date('2017-10-16').getTime())
  })

  it('returns null for undefined, null, and an unparseable string', () => {
    expect(toDate(undefined)).toBeNull()
    expect(toDate(null)).toBeNull()
    expect(toDate('not a date')).toBeNull()
  })
})
