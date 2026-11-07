import { describe, it, expect } from 'vitest'
import { diffQuestions, reviseAssessment, versionOf } from '@/lib/assessment/versions'
import type { Question } from '@/types/assessment'

const mc = (id: string, text: string, correct = 'a'): Question => ({
  id, order: 0, type: 'multiple_choice', text, points: 1,
  choices: [{ id: 'a', text: 'A', isCorrect: correct === 'a' }, { id: 'b', text: 'B', isCorrect: correct === 'b' }],
})
const now = new Date('2026-11-07T10:00:00Z')

describe('versionOf', () => {
  it('is 1 until a version is recorded', () => {
    expect(versionOf({})).toBe(1)
    expect(versionOf(undefined)).toBe(1)
    expect(versionOf({ version: 3 })).toBe(3)
    expect(versionOf({ version: 0 })).toBe(1)
  })
})

describe('diffQuestions', () => {
  it('counts added, removed and changed questions, ignoring order and spacing', () => {
    const before = [mc('1', 'one'), mc('2', 'two'), mc('3', 'three')]
    const after = [mc('3', ' three '), mc('2', 'two edited'), mc('4', 'four')]
    expect(diffQuestions(before, after)).toEqual({ added: 1, removed: 1, changed: 1 })
  })
  it('sees a changed right answer', () => {
    expect(diffQuestions([mc('1', 'x', 'a')], [mc('1', 'x', 'b')])).toEqual({ added: 0, removed: 0, changed: 1 })
  })
})

describe('reviseAssessment', () => {
  const prev = { questions: [mc('1', 'one'), mc('2', 'two')], passingScore: 70 }

  it('keeps the version when nothing that matters changed', () => {
    expect(reviseAssessment(prev, { questions: [...prev.questions], passingScore: 70 }, { uid: 'u' }, now)).toBeNull()
  })

  it('makes version 2 with a summary, and appends to the history', () => {
    const r = reviseAssessment(prev, { questions: [mc('1', 'one edited'), mc('2', 'two'), mc('3', 'three')], passingScore: 80 }, { uid: 'u1', name: 'Kanok' }, now)!
    expect(r.version).toBe(2)
    expect(r.revisions).toHaveLength(1)
    expect(r.revisions[0]).toMatchObject({ version: 2, by: 'u1', byName: 'Kanok', summary: 'เพิ่ม 1 ข้อ · แก้ 1 ข้อ · เกณฑ์ผ่าน 70% → 80%' })
    const again = reviseAssessment({ ...prev, version: 2, revisions: r.revisions }, { questions: [mc('1', 'one edited')], passingScore: 80 }, {}, now)!
    expect(again.version).toBe(3)
    expect(again.revisions.map((x) => x.version)).toEqual([2, 3])
  })

  it('a pass-mark change alone is a revision', () => {
    expect(reviseAssessment(prev, { questions: [...prev.questions], passingScore: 60 }, {}, now)?.revisions[0].summary).toBe('เกณฑ์ผ่าน 70% → 60%')
  })
})

import { analyzeAttempts, attemptVersion } from '@/lib/assessment/analytics'

describe('attempt versions', () => {
  it('counts a try from before versions existed as Ver 1', () => {
    expect(attemptVersion({})).toBe(1)
    expect(attemptVersion({ assessmentVersion: 3 })).toBe(3)
  })
  it('lists the versions the tries span', () => {
    const out = analyzeAttempts(
      [{ uid: 'a', assessmentId: 'q' }, { uid: 'b', assessmentId: 'q', assessmentVersion: 2 }, { uid: 'c', assessmentId: 'q', assessmentVersion: 2 }],
      new Map(),
    )
    expect(out.versions).toEqual([1, 2])
  })
})
