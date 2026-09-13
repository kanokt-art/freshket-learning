import { describe, it, expect } from 'vitest'
import { parseFormJson } from '@/lib/assessment/importFormJson'

// The input is JSON a human pasted out of an Apps Script log, so the failure
// modes that matter are truncated pastes, the wrong file, and forms whose
// answer key doesn't fit the LMS's one-correct-choice grader.

let n = 0
const genId = () => `id-${++n}`

const json = (o: unknown) => JSON.stringify(o)

const mcQuestion = (over: Record<string, unknown> = {}) => ({
  order: 0,
  type: 'multiple_choice',
  text: 'ลูกค้าถามราคา ควรตอบอย่างไร',
  points: 2,
  choices: [
    { text: 'บอกราคาทันที', isCorrect: true },
    { text: 'เลี่ยงไม่ตอบ', isCorrect: false },
  ],
  ...over,
})

describe('parseFormJson — rejects bad input', () => {
  it('rejects an empty paste', () => {
    const r = parseFormJson('   ', genId)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ยังไม่ได้วาง')
  })

  it('rejects malformed JSON with a hint about the banner lines', () => {
    const r = parseFormJson('===== คัดลอก =====\n{ "questions": [', genId)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('=====')
  })

  it('rejects JSON that is not an object', () => {
    expect(parseFormJson('[1,2,3]', genId).ok).toBe(false)
    expect(parseFormJson('"hello"', genId).ok).toBe(false)
  })

  it('rejects an object with no questions array', () => {
    const r = parseFormJson(json({ title: 'X' }), genId)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('questions')
  })

  it('rejects an empty questions array', () => {
    const r = parseFormJson(json({ questions: [] }), genId)
    expect(r.ok).toBe(false)
  })

  it('rejects an absurd number of questions', () => {
    const many = Array.from({ length: 201 }, () => mcQuestion())
    const r = parseFormJson(json({ questions: many }), genId)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('มากเกินไป')
  })
})

describe('parseFormJson — happy path', () => {
  it('imports a multiple-choice question with its key intact', () => {
    const r = parseFormJson(json({ title: 'Product 101', questions: [mcQuestion()] }), genId)
    expect(r.ok).toBe(true)
    expect(r.data!.title).toBe('Product 101')
    const q = r.data!.questions[0]
    expect(q.type).toBe('multiple_choice')
    expect(q.points).toBe(2)
    expect(q.choices!.filter((c) => c.isCorrect)).toHaveLength(1)
    expect(q.choices![0].isCorrect).toBe(true)
  })

  it('imports an open-ended question', () => {
    const r = parseFormJson(json({
      questions: [{ type: 'open_ended', text: 'อธิบายวิธีปิดการขาย', points: 5 }],
    }), genId)
    expect(r.ok).toBe(true)
    expect(r.data!.questions[0].type).toBe('open_ended')
    expect(r.data!.questions[0].points).toBe(5)
  })

  it('assigns fresh ids rather than trusting ids in the JSON', () => {
    const r = parseFormJson(json({ questions: [mcQuestion({ id: 'form-side-id' })] }), genId)
    expect(r.data!.questions[0].id).not.toBe('form-side-id')
    expect(r.data!.questions[0].id).toMatch(/^id-/)
  })

  it('renumbers order sequentially from 0', () => {
    const r = parseFormJson(json({
      questions: [mcQuestion({ order: 7 }), mcQuestion({ order: 99 })],
    }), genId)
    expect(r.data!.questions.map((q) => q.order)).toEqual([0, 1])
  })

  it('never emits an undefined field value', () => {
    // Firestore's addDoc() rejects undefined outright ("Unsupported field
    // value: undefined"), and these questions are written to it verbatim. An
    // absent description must be omitted, not set to undefined.
    const r = parseFormJson(json({
      questions: [
        mcQuestion({ description: undefined }),
        mcQuestion({ description: '   ' }),
        { type: 'open_ended', text: 'อธิบาย', points: 1 },
      ],
    }), genId)
    expect(r.ok).toBe(true)
    for (const q of r.data!.questions) {
      for (const [key, value] of Object.entries(q)) {
        expect(value, `${key} must not be undefined`).not.toBeUndefined()
      }
      expect(Object.prototype.hasOwnProperty.call(q, 'description')).toBe(false)
    }
  })

  it('keeps a description when the form actually has one', () => {
    const r = parseFormJson(json({
      questions: [mcQuestion({ description: 'อ่านโจทย์ให้ดีก่อนตอบ' })],
    }), genId)
    expect(r.data!.questions[0].description).toBe('อ่านโจทย์ให้ดีก่อนตอบ')
  })

  it('carries the source form url through', () => {
    const r = parseFormJson(json({
      sourceFormUrl: 'https://docs.google.com/forms/d/e/abc/viewform',
      questions: [mcQuestion()],
    }), genId)
    expect(r.data!.sourceFormUrl).toContain('docs.google.com')
  })
})

describe('parseFormJson — repairs and warnings', () => {
  it('marks the first choice correct when the form had no key, and says so', () => {
    const r = parseFormJson(json({
      questions: [mcQuestion({
        choices: [{ text: 'ก', isCorrect: false }, { text: 'ข', isCorrect: false }],
      })],
    }), genId)
    expect(r.ok).toBe(true)
    expect(r.data!.questions[0].choices![0].isCorrect).toBe(true)
    expect(r.warnings.join()).toContain('ไม่มีเฉลย')
  })

  it('keeps only the first correct choice when several are flagged', () => {
    const r = parseFormJson(json({
      questions: [mcQuestion({
        choices: [
          { text: 'ก', isCorrect: true },
          { text: 'ข', isCorrect: true },
          { text: 'ค', isCorrect: false },
        ],
      })],
    }), genId)
    expect(r.data!.questions[0].choices!.filter((c) => c.isCorrect)).toHaveLength(1)
    expect(r.warnings.join()).toContain('มากกว่า 1')
  })

  it('skips a question with no text but keeps the rest', () => {
    const r = parseFormJson(json({
      questions: [mcQuestion({ text: '  ' }), mcQuestion()],
    }), genId)
    expect(r.ok).toBe(true)
    expect(r.data!.questions).toHaveLength(1)
    expect(r.warnings.join()).toContain('ไม่มีข้อความคำถาม')
  })

  it('skips an unsupported question type by name', () => {
    const r = parseFormJson(json({
      questions: [{ type: 'grid', text: 'ตาราง' }, mcQuestion()],
    }), genId)
    expect(r.data!.questions).toHaveLength(1)
    expect(r.warnings.join()).toContain('grid')
  })

  it('skips a multiple-choice question with fewer than two usable choices', () => {
    const r = parseFormJson(json({
      questions: [
        mcQuestion({ choices: [{ text: 'เดียว', isCorrect: true }] }),
        mcQuestion({ choices: [{ text: 'ก', isCorrect: true }, { text: '   ', isCorrect: false }] }),
        mcQuestion(),
      ],
    }), genId)
    expect(r.data!.questions).toHaveLength(1)
    expect(r.warnings.filter((w) => w.includes('ไม่ถึง 2'))).toHaveLength(2)
  })

  it('falls back to 1 point for missing, negative, or non-numeric points', () => {
    const r = parseFormJson(json({
      questions: [
        mcQuestion({ points: undefined }),
        mcQuestion({ points: -5 }),
        mcQuestion({ points: 'สาม' }),
      ],
    }), genId)
    expect(r.data!.questions.map((q) => q.points)).toEqual([1, 1, 1])
  })

  it('fails when every question was skipped', () => {
    const r = parseFormJson(json({ questions: [{ type: 'grid', text: 'x' }] }), genId)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ไม่มีคำถามที่นำเข้าได้')
  })
})
