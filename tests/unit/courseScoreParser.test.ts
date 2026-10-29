import { describe, it, expect } from 'vitest'
import { parseCourseScoreText, parseScoreType } from '@/lib/utils/csvParser'
import { groupByPerson, recordPatch } from '@/lib/courses/scoreImport'

// The file people actually have is the Google Form export, not our template: a
// Timestamp, an Email Address, a Score written "9 / 10", and a Type such as
// "ก่อนเรียน (Pre Test)". These tests use that shape, taken from a real export.
const FORM_EXPORT = [
  'Timestamp,Email Address,Score,Type',
  '2/16/2026 7:37:57,rinlaphat.s@freshket.co,9 / 10,ก่อนเรียน (Pre Test)',
  '2/16/2026 7:38:08,sirinrat.s@freshket.co,8 / 10,ก่อนเรียน (Pre Test)',
  '2/16/2026 8:38:41,rinlaphat.s@freshket.co,10 / 10,หลังเรียน (Post Test)',
  '2/16/2026 8:40:09,sirinrat.s@freshket.co,10 / 10,หลังเรียน (Post Test)',
  '3/16/2026 14:45:22,kanthicha.s@freshket.co,6 / 9,ก่อนเรียน (Pre Test)',
  '3/16/2026 15:34:45,kanthicha.s@freshket.co,8 / 9,หลังเรียน (Post Test)',
].join('\n')

describe('the Google Form export', () => {
  const { data, errors } = parseCourseScoreText(FORM_EXPORT)

  it('parses without a single error', () => {
    expect(errors).toEqual([])
    expect(data).toHaveLength(6)
  })

  it('reads Pre Test and Post Test from the Type column', () => {
    expect(data.map((r) => r.type)).toEqual(['pre', 'pre', 'post', 'post', 'pre', 'post'])
  })

  it('reads "9 / 10" with spaces as 90, and a 9-question quiz as a percentage', () => {
    expect(data[0].score).toBe(90)
    expect(data[2].score).toBe(100)
    expect(data[4].score).toBe(67)   // 6 / 9
    expect(data[5].score).toBe(89)   // 8 / 9
  })

  it('treats the Timestamp as the date of that sitting', () => {
    expect(data[0].completedAt).toBe('2/16/2026 7:37:57')
  })

  it('needs no status column: an after row defaults to completed', () => {
    expect(data[2].status).toBe('completed')
  })

  it('puts each person’s before and after on one record', () => {
    const people = groupByPerson(data)
    expect(people.map((p) => p.email)).toEqual(['rinlaphat.s@freshket.co', 'sirinrat.s@freshket.co', 'kanthicha.s@freshket.co'])
    const rin = recordPatch(people[0], null, new Date('2026-04-01'))
    expect(rin).toMatchObject({ preTestScore: 90, postTestScore: 100, score: 100, status: 'completed' })
  })

  it('a before row alone does not finish the course', () => {
    const csv = 'Timestamp,Email Address,Score,Type\n2/16/2026 7:37:57,a@freshket.co,9 / 10,ก่อนเรียน (Pre Test)'
    const [only] = groupByPerson(parseCourseScoreText(csv).data)
    const patch = recordPatch(only, null, new Date('2026-04-01'))
    expect(patch.status).toBe('in_progress')
    expect(patch).not.toHaveProperty('score')
  })

  it('keeps the LATER sitting when someone retook it', () => {
    const csv = FORM_EXPORT + '\n4/1/2026 9:00:00,rinlaphat.s@freshket.co,7 / 10,หลังเรียน (Post Test)'
    const rin = groupByPerson(parseCourseScoreText(csv).data)[0]
    expect(rin.post?.score).toBe(70)
  })
})

describe('the app’s own template columns', () => {
  it('parses employeeEmail / type / score / status / completedAt', () => {
    const csv = 'employeeEmail,type,score,status,completedAt\nrinlaphat.s@freshket.co,post,9,completed,01/01/2026'
    const { data, errors } = parseCourseScoreText(csv)
    expect(errors).toEqual([])
    expect(data[0]).toMatchObject({ email: 'rinlaphat.s@freshket.co', type: 'post', score: 9, status: 'completed' })
  })
})

describe('the type column is required', () => {
  it('is ONE clear error about the header when the column is missing, and nothing is imported', () => {
    const csv = 'employeeEmail,score,status,completedAt\na@freshket.co,9,completed,01/01/2026\nb@freshket.co,8,completed,'
    const { data, errors } = parseCourseScoreText(csv)
    expect(data).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ field: 'header', row: 0 })
    expect(errors[0].message).toContain('type')
  })

  it('refuses a row whose type is blank or unrecognised, and keeps the good rows', () => {
    const csv = 'employeeEmail,type,score\na@freshket.co,pre,5\nb@freshket.co,,6\nc@freshket.co,midterm,7\nd@freshket.co,post,8'
    const { data, errors } = parseCourseScoreText(csv)
    expect(data.map((r) => r.email)).toEqual(['a@freshket.co', 'd@freshket.co'])
    expect(errors.map((e) => [e.row, e.field])).toEqual([[3, 'type'], [4, 'type']])
  })
})

describe('parseScoreType', () => {
  it.each([
    ['pre', 'pre'], ['PRE', 'pre'], ['pre_test', 'pre'], ['Pre Test', 'pre'], ['ก่อนเรียน', 'pre'], ['ก่อนเรียน (Pre Test)', 'pre'],
    ['post', 'post'], ['Post', 'post'], ['post_test', 'post'], ['Post Test', 'post'], ['หลังเรียน', 'post'], ['หลังเรียน (Post Test)', 'post'],
  ])('%s → %s', (raw, want) => expect(parseScoreType(raw)).toBe(want))

  it.each(['', '  ', 'midterm', 'final', '1', 'ทดสอบ'])('does not guess for %j', (raw) => {
    expect(parseScoreType(raw)).toBeNull()
  })

  it('does not guess when a value says both', () => {
    expect(parseScoreType('pre / post')).toBeNull()
  })

  it('still reads the English marker when the Thai arrives garbled', () => {
    // The Thai in some exports comes through as mojibake; the ASCII marker survives.
    expect(parseScoreType('à¸«à¸¥à¸±à¸‡à¹€à¸£à¸µà¸¢à¸™ (Post Test)')).toBe('post')
    expect(parseScoreType('à¸à¹ˆà¸­à¸™à¹€à¸£à¸µà¸¢à¸™ (Pre Test)')).toBe('pre')
  })
})
