import { describe, it, expect } from 'vitest'
import { toShadowRecord, shadowId, type ShadowSheetRow } from '@/lib/shadow/sheetImport'

const observer = { uid: 'csv-1', name: 'Rin' }
const row: ShadowSheetRow = {
  timestamp: '2026-02-16T00:37:57.000Z', observerEmail: ' Rin@Freshket.co ', mentorFullname: 'Somchai Jaidee', mentorName: 'Chai',
  mentorPosition: 'Senior Sale', mentorEmail: 'Chai@Freshket.co', storeName: 'Ban Pasta', segment: 'Stand alone', persona: 'Chef',
  opening: 'hook', interestPoint: 'ip', customerPain: 'pain', diagnosticApproach: 'dx', closingNextStep: 'next',
}

describe('toShadowRecord', () => {
  it('maps each column to its field and takes the observer from the email', () => {
    const r = toShadowRecord(row, observer)
    expect(r.ok && r.data).toMatchObject({
      observerUid: 'csv-1', observerEmail: 'rin@freshket.co', observerName: 'Rin', mentorName: 'Somchai Jaidee',
      mentorPosition: 'Senior Sale', storeName: 'Ban Pasta', segment: 'Stand alone', persona: 'Chef',
      opening: 'hook', interestPoint: 'ip', customerPain: 'pain', diagnosticApproach: 'dx', closingNextStep: 'next',
    })
  })

  it('dates the record by the form timestamp', () => {
    const r = toShadowRecord(row, observer)
    expect(r.ok && r.data.createdAt).toEqual(new Date('2026-02-16T00:37:57.000Z'))
  })

  it('keeps the mentor email and short name as extras, and leaves the questions the form lacks blank', () => {
    const r = toShadowRecord(row, observer)
    expect(r.ok && r.data).toMatchObject({ mentorEmail: 'chai@freshket.co', mentorNickname: 'Chai', bestPractice: '', beyondClassroom: '' })
  })

  it('uses the short name when there is no full name', () => {
    const r = toShadowRecord({ ...row, mentorFullname: '' }, observer)
    expect(r.ok && r.data.mentorName).toBe('Chai')
    expect(r.ok && r.data).not.toHaveProperty('mentorNickname')
  })

  it('gives the same id for the same observer and moment, however the email is typed', () => {
    const a = toShadowRecord(row, observer)
    const b = toShadowRecord({ ...row, observerEmail: 'rin@freshket.co' }, observer)
    expect(a.ok && b.ok && a.id === b.id).toBe(true)
    expect(shadowId('rin@freshket.co', new Date('2026-02-16T00:37:57.000Z'))).toMatch(/^gs-rin-freshket-co-\d+$/)
  })

  it('gives different ids for different moments or people', () => {
    const a = toShadowRecord(row, observer)
    const b = toShadowRecord({ ...row, timestamp: '2026-02-16T00:37:58.000Z' }, observer)
    const c = toShadowRecord({ ...row, observerEmail: 'other@freshket.co' }, observer)
    expect(a.ok && b.ok && c.ok && new Set([a.id, b.id, c.id]).size).toBe(3)
  })

  it('refuses a row with no usable email, no timestamp, or an observer nobody has', () => {
    expect(toShadowRecord({ ...row, observerEmail: '' }, observer)).toMatchObject({ ok: false })
    expect(toShadowRecord({ ...row, timestamp: '' }, observer)).toMatchObject({ ok: false })
    expect(toShadowRecord({ ...row, timestamp: 'not a date' }, observer)).toMatchObject({ ok: false })
    expect(toShadowRecord(row, null)).toMatchObject({ ok: false, reason: expect.stringContaining('rin@freshket.co') })
  })

  it('keeps a segment or persona outside the app lists as typed, and says so', () => {
    const r = toShadowRecord({ ...row, segment: 'Franchise', persona: 'Barista' }, observer)
    expect(r.ok && r.data).toMatchObject({ segment: 'Franchise', persona: 'Barista' })
    expect(r.ok && r.unknownChoices).toEqual(['Segment "Franchise"', 'Persona "Barista"'])
  })

  it('reports nothing for the known choices', () => {
    for (const segment of ['Mini Chain', 'Stand alone', 'Chain']) {
      expect(toShadowRecord({ ...row, segment }, observer)).toMatchObject({ unknownChoices: [] })
    }
  })

  it('trims whitespace and treats missing cells as empty text', () => {
    const r = toShadowRecord({ ...row, opening: '  hi  ', customerPain: undefined }, observer)
    expect(r.ok && r.data).toMatchObject({ opening: 'hi', customerPain: '' })
  })
})
