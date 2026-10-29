import { describe, it, expect } from 'vitest'
import {
  EMPLOYEE_TEMPLATE,
  ASSESSMENT_SCORE_TEMPLATE,
  COURSE_RESULT_TEMPLATE,
  ROLEPLAY_TEMPLATE,
  toCsvText,
  type CsvTemplate,
} from '@/lib/utils/csvTemplates'
import { parseCourseScoreText, parseRoleplayText } from '@/lib/utils/csvParser'

// A template is only correct relative to the parser it feeds, and the two can
// drift apart without anything failing — the admin's upload just stops
// working, somewhere else, later. These tests run each generated template back
// through the real parser so a column added, removed or reordered on either
// side breaks here instead.

describe('toCsvText', () => {
  it('emits the header row followed by the samples, CRLF-separated', () => {
    const t: CsvTemplate = {
      filename: 'x.csv', label: 'x',
      headers: ['a', 'b'],
      sampleRows: [['1', '2']],
    }
    expect(toCsvText(t)).toBe('a,b\r\n1,2')
  })

  it('quotes only cells that need it, per RFC 4180', () => {
    const t: CsvTemplate = {
      filename: 'x.csv', label: 'x',
      headers: ['plain', 'comma', 'quote', 'newline'],
      sampleRows: [['ok', 'a,b', 'say "hi"', 'one\ntwo']],
    }
    // Thai text needs no quoting, which is why bare cells matter here.
    expect(toCsvText(t).split('\r\n')[1]).toBe('ok,"a,b","say ""hi""","one\ntwo"')
  })

  it('leaves Thai text unquoted', () => {
    const t: CsvTemplate = {
      filename: 'x.csv', label: 'x',
      headers: ['ชื่อ'],
      sampleRows: [['ตัวอย่าง ทดสอบ']],
    }
    expect(toCsvText(t)).toBe('ชื่อ\r\nตัวอย่าง ทดสอบ')
  })
})

describe('every template', () => {
  const all = [
    ['employee', EMPLOYEE_TEMPLATE],
    ['assessment score', ASSESSMENT_SCORE_TEMPLATE],
    ['course result', COURSE_RESULT_TEMPLATE],
    ['roleplay', ROLEPLAY_TEMPLATE],
  ] as const

  it.each(all)('%s: every sample row is as wide as the header', (_name, t) => {
    for (const row of t.sampleRows) {
      expect(row.length).toBe(t.headers.length)
    }
  })

  it.each(all)('%s: has at least one sample row to copy', (_name, t) => {
    expect(t.sampleRows.length).toBeGreaterThan(0)
  })

  it.each(all)('%s: downloads as a .csv', (_name, t) => {
    expect(t.filename).toMatch(/\.csv$/)
  })
})

// ── Employee template (positional, 16 columns) ──────────────────────────────
// parseCsvToProfiles lives inside a page component and cannot be imported
// here, so this pins the contract it reads by index. The numbers below are
// copied from its cols[N] reads; if they change, the template must too.
describe('EMPLOYEE_TEMPLATE', () => {
  it('is exactly 16 columns — the parser reads by position', () => {
    expect(EMPLOYEE_TEMPLATE.headers.length).toBe(16)
  })

  it('puts each field the parser reads at the index it reads', () => {
    const at = (i: number) => EMPLOYEE_TEMPLATE.headers[i]
    expect(at(1)).toBe('Status')
    expect(at(2)).toBe('Emp.ID')
    expect(at(4)).toBe('Name-Surname (TH)')
    expect(at(5)).toBe('Name-Surname (Eng)')
    expect(at(6)).toBe('Nick name')
    expect(at(8)).toBe('Department')
    expect(at(9)).toBe('Rank')
    expect(at(10)).toBe('Position')
    expect(at(12)).toBe('Start Date')
    expect(at(14)).toBe('Line Manager')
    expect(at(15)).toBe('Company Email')
  })

  it('samples carry a name and an email, which the parser requires', () => {
    for (const row of EMPLOYEE_TEMPLATE.sampleRows) {
      expect(row[4] || row[5]).toBeTruthy()      // displayName falls back to EN
      expect(row[15]).toContain('@freshket.co')
    }
  })

  it('samples sit in Phase 1 departments, so an unedited upload is visible', () => {
    // Importing the template as-is and then not finding the rows anywhere is a
    // confusing first run; these departments are the ones the platform shows.
    for (const row of EMPLOYEE_TEMPLATE.sampleRows) {
      expect([
        'Sales Management', 'Key Account Management',
        'Portfolio Management', 'People Experience',
      ]).toContain(row[8])
    }
  })
})

// ── Course results (named columns) ──────────────────────────────────────────
describe('COURSE_RESULT_TEMPLATE', () => {
  it('parses cleanly through parseCourseScoreText', () => {
    const { data, errors } = parseCourseScoreText(toCsvText(COURSE_RESULT_TEMPLATE))
    expect(errors).toEqual([])
    expect(data.length).toBe(COURSE_RESULT_TEMPLATE.sampleRows.length)
  })

  it('round-trips the values it demonstrates, including which sitting each row is', () => {
    const { data } = parseCourseScoreText(toCsvText(COURSE_RESULT_TEMPLATE))
    expect(data[0]).toMatchObject({ email: 'example@freshket.co', type: 'pre', score: 60 })
    expect(data[1]).toMatchObject({ email: 'example@freshket.co', type: 'post', score: 85, status: 'completed' })
  })

  it('has the type column the import now requires', () => {
    expect(COURSE_RESULT_TEMPLATE.headers).toContain('type')
  })

  it('shows one person with a before row and an after row', () => {
    const emails = COURSE_RESULT_TEMPLATE.sampleRows.map((r) => r[0])
    expect(emails.filter((e) => e === 'example@freshket.co')).toHaveLength(2)
  })

  it('shows that score and completedAt may be left blank', () => {
    // The last sample is deliberately sparse: the help text says these are
    // optional, and a template where every cell is filled does not show it.
    const { data, errors } = parseCourseScoreText(toCsvText(COURSE_RESULT_TEMPLATE))
    expect(errors).toEqual([])
    const sparse = data[data.length - 1]
    expect(sparse.score).toBeUndefined()
    expect(sparse.status).toBe('in_progress')
  })
})

// ── Roleplay (positional, 36 columns, interleaved notes) ────────────────────
describe('ROLEPLAY_TEMPLATE', () => {
  it('is wide enough for the parser header guard', () => {
    // parseRoleplayText rejects anything under 35 columns outright.
    expect(ROLEPLAY_TEMPLATE.headers.length).toBeGreaterThanOrEqual(35)
  })

  it('satisfies the guard on columns 1 and 2', () => {
    expect(ROLEPLAY_TEMPLATE.headers[1].toLowerCase()).toContain('email')
    expect(ROLEPLAY_TEMPLATE.headers[2].toLowerCase()).toContain('name')
  })

  it('parses cleanly through parseRoleplayText', () => {
    const { data, errors, skipped } = parseRoleplayText(toCsvText(ROLEPLAY_TEMPLATE))
    expect(errors).toEqual([])
    expect(skipped).toEqual([])   // no sample name may trip the test-row filter
    expect(data.length).toBe(ROLEPLAY_TEMPLATE.sampleRows.length)
  })

  it('scores all 25 topics, none of them silently zero', () => {
    // A rating of 0 means "not scored" and is skipped by the radar average, so
    // a misaligned template would show up as zeros rather than as an error.
    const { data } = parseRoleplayText(toCsvText(ROLEPLAY_TEMPLATE))
    expect(data[0].ratings.length).toBe(25)
    expect(data[0].ratings.filter((r) => r.rating === 0)).toEqual([])
  })

  it('reads round 1 as a pre-test', () => {
    const { data } = parseRoleplayText(toCsvText(ROLEPLAY_TEMPLATE))
    expect(data[0].round).toBe(1)
    expect(data[0].type).toBe('pre')
  })

  it('keeps the five section notes off the rating columns', () => {
    // The notes are interleaved between rating groups; landing one on a rating
    // index is exactly the misalignment this format invites.
    const { data } = parseRoleplayText(toCsvText(ROLEPLAY_TEMPLATE))
    for (const label of ['Greeting', 'Discovery', 'Solution', 'Closing', 'Follow Up']) {
      expect(data[0].overallNote).toContain(`[${label}]`)
    }
  })

  it('treats Email as the assessor and Name as the subject', () => {
    // Swapping these attributes every score to the wrong person, and nothing
    // downstream would flag it.
    const { data } = parseRoleplayText(toCsvText(ROLEPLAY_TEMPLATE))
    expect(data[0].assessorEmail).toBe('assessor@freshket.co')
    expect(data[0].subjectName).not.toContain('@')
  })
})

// ── Assessment scores (named columns) ───────────────────────────────────────
// parseAssessmentCSV takes a File and uses FileReader, which does not exist
// in this environment, so the template's agreement with it is pinned on the
// header names and value formats the parser requires instead.
describe('ASSESSMENT_SCORE_TEMPLATE', () => {
  it('names all four columns the parser resolves', () => {
    const lower = ASSESSMENT_SCORE_TEMPLATE.headers.map((h) => h.toLowerCase())
    for (const want of ['timestamp', 'email', 'score', 'type']) {
      expect(lower.some((h) => h.includes(want))).toBe(true)
    }
  })

  it('carries the ASCII Pre/Post marker the type detection looks for', () => {
    // Detection is a substring check on the English marker, so the Thai around
    // it is free text — but one of the two must be present verbatim.
    const types = ASSESSMENT_SCORE_TEMPLATE.sampleRows.map((r) => r[3])
    expect(types.some((t) => t.includes('Pre Test'))).toBe(true)
    expect(types.some((t) => t.includes('Post Test'))).toBe(true)
  })

  it('uses @freshket.co emails, which the parser enforces', () => {
    for (const row of ASSESSMENT_SCORE_TEMPLATE.sampleRows) {
      expect(row[1]).toMatch(/@freshket\.co$/)
    }
  })

  it('writes Score as the N/M fraction a Forms quiz exports', () => {
    for (const row of ASSESSMENT_SCORE_TEMPLATE.sampleRows) {
      expect(row[2]).toMatch(/^\d+\/\d+$/)
    }
  })
})
