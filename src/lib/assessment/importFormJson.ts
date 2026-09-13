import type { Question, QuestionType } from '@/types/assessment'

// Parser for the JSON produced by docs/apps-script/FormToQuestions.gs.
//
// The input is pasted by hand out of an Apps Script log, so it is untrusted in
// the "might be malformed" sense rather than the "might be hostile" sense:
// truncated paste, wrong file, an older export shape. Everything is therefore
// validated and reported rather than trusted — a bad paste should explain
// itself, not throw or silently produce an empty quiz.
//
// Ids are NOT taken from the JSON. The LMS owns its own ids (genId in the
// assessment editor), and reusing form-side ids would risk colliding with the
// ids of questions already in the assessment being edited.

export interface ImportedAssessment {
  title: string
  description: string
  sourceFormUrl?: string
  questions: Question[]
}

export interface ImportResult {
  ok: boolean
  data?: ImportedAssessment
  /** Fatal — nothing could be imported. */
  error?: string
  /** Non-fatal: imported, but these need a human's attention. */
  warnings: string[]
}

const MAX_QUESTIONS = 200
const MAX_TEXT = 2000
const MAX_CHOICES = 20

function str(v: unknown, max = MAX_TEXT): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * @param raw   the pasted JSON text
 * @param genId id factory supplied by the caller so the editor's own scheme is used
 */
export function parseFormJson(raw: string, genId: () => string): ImportResult {
  const warnings: string[] = []

  const text = raw.trim()
  if (!text) return { ok: false, error: 'ยังไม่ได้วาง JSON', warnings }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      // The most common paste mistake is grabbing the log's ===== banner lines
      // along with the JSON, so name that specifically.
      error: 'อ่าน JSON ไม่ได้ — ตรวจว่าคัดลอกเฉพาะส่วนที่อยู่ระหว่างบรรทัด ===== และครบทั้งก้อน',
      warnings,
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'รูปแบบ JSON ไม่ถูกต้อง', warnings }
  }

  const root = parsed as Record<string, unknown>
  const rawQuestions = root.questions

  if (!Array.isArray(rawQuestions)) {
    return { ok: false, error: 'ไม่พบรายการคำถาม (questions) ใน JSON', warnings }
  }
  if (rawQuestions.length === 0) {
    return { ok: false, error: 'JSON นี้ไม่มีคำถามเลย', warnings }
  }
  if (rawQuestions.length > MAX_QUESTIONS) {
    return { ok: false, error: `คำถามมากเกินไป (${rawQuestions.length} ข้อ, สูงสุด ${MAX_QUESTIONS})`, warnings }
  }

  const questions: Question[] = []

  rawQuestions.forEach((item, i) => {
    const label = `ข้อ ${i + 1}`
    if (typeof item !== 'object' || item === null) {
      warnings.push(`${label}: ข้ามเพราะรูปแบบไม่ถูกต้อง`)
      return
    }
    const q = item as Record<string, unknown>

    const qText = str(q.text)
    if (!qText) {
      warnings.push(`${label}: ข้ามเพราะไม่มีข้อความคำถาม`)
      return
    }

    const type = q.type
    if (type !== 'multiple_choice' && type !== 'open_ended') {
      warnings.push(`${label}: ข้ามเพราะไม่รองรับชนิด "${String(type)}"`)
      return
    }

    // Points must be a sane positive number; anything else falls back to 1
    // rather than letting a NaN/negative reach the grader.
    let points = typeof q.points === 'number' && isFinite(q.points) ? Math.floor(q.points) : 1
    if (points < 1) points = 1

    // `description` is omitted entirely when empty rather than set to
    // undefined: these questions are written straight into Firestore by the
    // assessment editor, and addDoc() rejects an undefined field value.
    const desc = str(q.description)
    const base = {
      id: genId(),
      order: questions.length,
      text: qText,
      points,
      ...(desc ? { description: desc } : {}),
    }

    if (type === 'open_ended') {
      questions.push({ ...base, type: 'open_ended' as QuestionType, sampleAnswer: str(q.sampleAnswer) })
      return
    }

    const rawChoices = q.choices
    if (!Array.isArray(rawChoices) || rawChoices.length < 2) {
      warnings.push(`${label}: ข้ามเพราะมีตัวเลือกไม่ถึง 2 ข้อ`)
      return
    }

    const choices = rawChoices
      .slice(0, MAX_CHOICES)
      .map((c) => {
        const co = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>
        return { id: genId(), text: str(co.text, 500), isCorrect: co.isCorrect === true }
      })
      .filter((c) => c.text)

    if (choices.length < 2) {
      warnings.push(`${label}: ข้ามเพราะมีตัวเลือกที่มีข้อความไม่ถึง 2 ข้อ`)
      return
    }

    // The grader keys on exactly one isCorrect. Repair both failure shapes
    // instead of importing a question that can never be answered correctly.
    const correctCount = choices.filter((c) => c.isCorrect).length
    if (correctCount === 0) {
      choices[0].isCorrect = true
      warnings.push(`${label}: ไม่มีเฉลย — ตั้งตัวเลือกแรกไว้ชั่วคราว กรุณาแก้เฉลย`)
    } else if (correctCount > 1) {
      let seen = false
      for (const c of choices) {
        if (c.isCorrect && seen) c.isCorrect = false
        else if (c.isCorrect) seen = true
      }
      warnings.push(`${label}: มีเฉลยมากกว่า 1 ข้อ — เก็บไว้เฉพาะข้อแรก กรุณาตรวจสอบ`)
    }

    questions.push({ ...base, type: 'multiple_choice' as QuestionType, choices })
  })

  if (questions.length === 0) {
    return { ok: false, error: 'ไม่มีคำถามที่นำเข้าได้', warnings }
  }

  return {
    ok: true,
    warnings,
    data: {
      title: str(root.title, 200),
      description: str(root.description),
      sourceFormUrl: str(root.sourceFormUrl, 500) || undefined,
      questions,
    },
  }
}
