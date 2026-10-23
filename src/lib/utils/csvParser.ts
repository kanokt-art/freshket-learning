import Papa from 'papaparse'
import type { CSVImportError } from '@/types/tracking'

export interface ParsedTrainingResult {
  employeeEmail: string
  courseId: string
  courseTitle: string
  status: string
  score?: number
  completedAt?: string
}

// A single Pre/Post assessment attempt from the Google-Forms export. Only four
// columns matter (Timestamp, Email, Score, Type); the many question columns —
// whose Thai headers arrive mojibake'd — are ignored. Pre/Post is detected from
// the ASCII "(Pre Test)"/"(Post Test)" marker inside the (mojibake) Type value.
export interface ParsedAssessmentScore {
  email: string
  type: 'pre' | 'post'
  score: number   // correct answers
  total: number   // total questions
  pct: number     // 0–100
  takenAt: string // raw timestamp string from the export
}

export interface ParseResult<T> {
  data: T[]
  errors: CSVImportError[]
}

// One row of the per-course score import (นำเข้าผลคะแนน). The admin picks the
// course in the UI, so the file itself carries no courseId — just who got what.
export interface ParsedCourseScore {
  email: string
  score?: number          // 0–100, optional (some courses are pass/fail only)
  status: string          // TrainingStatus; blank defaults to 'completed'
  completedAt?: string    // raw date string, optional
}

const COURSE_SCORE_STATUSES = new Set(['not_started', 'in_progress', 'completed', 'failed'])

// Operates on raw CSV TEXT (not a File) so it runs identically in the browser
// and inside a Node route handler (Papa's File input needs FileReader, which
// doesn't exist server-side).
//
// Column matching is deliberately forgiving (resolveColumn: exact→prefix→
// substring, case-insensitive) so the same import works for both the app's own
// template (employeeEmail, score, status, completedAt) AND a raw Google-Forms
// export (Email Address, Score, ...), which is what admins actually have on
// hand. The email column is the only hard requirement; score/status/completedAt
// are optional. Score accepts a plain 0–100 number OR an "N/M" fraction
// (6/10 → 60) — the latter is how a quiz export writes it, and also the shape a
// spreadsheet loves to auto-mangle into a date (handled via parseScoreFraction).
export function parseCourseScoreText(text: string): ParseResult<ParsedCourseScore> {
  const { data, errors: parseErrors, meta } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  const csvErrors: CSVImportError[] = parseErrors.map((e) => ({
    row: e.row ?? 0,
    field: 'parse',
    message: e.message,
    rawValue: '',
  }))

  const headers = meta.fields ?? (data[0] ? Object.keys(data[0]) : [])
  const emailCol = resolveColumn(headers, 'email') ?? resolveColumn(headers, 'e-mail')
  const scoreCol = resolveColumn(headers, 'score')
  const statusCol = resolveColumn(headers, 'status')
  // Google Forms exports carry a "Timestamp" column — treat it as the completion
  // date when there's no explicit completedAt/date column.
  const dateCol = resolveColumn(headers, 'completed') ?? resolveColumn(headers, 'date') ?? resolveColumn(headers, 'timestamp')

  // No email column at all → ONE clear header error naming what's missing and
  // what the file actually contains, instead of an identical per-row error on
  // all N rows (which reads as "the data is wrong" when the header is the issue).
  if (!emailCol) {
    csvErrors.push({
      row: 0,
      field: 'header',
      message: `ไม่พบคอลัมน์อีเมลในไฟล์ (รองรับ: Email Address, employeeEmail, email) — คอลัมน์ที่พบจริง: ${headers.join(', ') || '(ไม่มี)'}`,
      rawValue: '',
    })
    return { data: [], errors: csvErrors }
  }

  const rows: ParsedCourseScore[] = []
  data.forEach((row, idx) => {
    const rowNum = idx + 2 // 1-based + header row

    const email = (row[emailCol] ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      csvErrors.push({ row: rowNum, field: 'email', message: 'ต้องกรอกอีเมลพนักงาน', rawValue: row[emailCol] ?? '' })
      return
    }

    let score: number | undefined
    const scoreRaw = scoreCol ? (row[scoreCol] ?? '').trim() : ''
    if (scoreRaw) {
      // Route EVERY value through parseScoreFraction first so a spreadsheet-
      // mangled date is caught whether or not it still has a slash ("6/10/2026"
      // AND "6-Oct" both flag as date). A plain "85" comes back 'invalid' (not a
      // fraction, not a date) and falls through to the plain-number path.
      const parsed = parseScoreFraction(scoreRaw)
      if ('reason' in parsed) {
        if (parsed.reason === 'date') {
          csvErrors.push({
            row: rowNum,
            field: 'score',
            message: `คอลัมน์ Score ถูกแปลงเป็นวันที่อัตโนมัติ (ค่าที่อ่านได้: "${scoreRaw}") — ตั้งรูปแบบคอลัมน์ Score เป็นข้อความ แล้ว export ใหม่`,
            rawValue: scoreRaw,
          })
          return
        }
        // Not a fraction — accept a plain 0–100 number.
        score = parseFloat(scoreRaw)
        if (isNaN(score) || score < 0 || score > 100) {
          csvErrors.push({ row: rowNum, field: 'score', message: 'คะแนนต้องอยู่ระหว่าง 0-100 (หรือรูปแบบ 6/10)', rawValue: scoreRaw })
          return
        }
      } else {
        // Fraction form ("6/10") — convert to a 0–100 percentage.
        score = parsed.total > 0 ? Math.round((parsed.score / parsed.total) * 100) : parsed.score
      }
    }

    const status = (statusCol ? (row[statusCol] ?? '').trim().toLowerCase() : '') || 'completed'
    if (!COURSE_SCORE_STATUSES.has(status)) {
      csvErrors.push({ row: rowNum, field: 'status', message: 'status ต้องเป็น not_started / in_progress / completed / failed (เว้นว่าง = completed)', rawValue: statusCol ? row[statusCol] : '' })
      return
    }

    const completedAt = dateCol ? (row[dateCol] ?? '').trim() || undefined : undefined
    if (completedAt && isNaN(new Date(completedAt).getTime())) {
      csvErrors.push({ row: rowNum, field: 'completedAt', message: 'รูปแบบวันที่ไม่ถูกต้อง (เช่น 2026-07-19)', rawValue: completedAt })
      return
    }

    rows.push({ email, score, status, completedAt })
  })

  return { data: rows, errors: csvErrors }
}

// ── Roleplay assessment import (FKT-Learning-Master - Roleplay export) ──────
// The Google-Forms roleplay export is matched by COLUMN POSITION, not header
// name: it has FIVE columns literally titled "Note" (Papa's header mode would
// silently rename them Note_1…Note_4) and the 25 score columns carry long Thai
// headers that arrive mojibake'd from some exports. The form's column order is
// fixed, so position is the stable key. Layout (0-based):
//   0 Timestamp · 1 Email Address (ASSESSOR) · 2 Name (SUBJECT) · 3 Section ·
//   4 Team · 5 ครั้งที่สอบ (round) · then 25 score cells + 5 Note cells
//   interleaved exactly as SCORE_COLS / NOTE_COLS below.
const RP_SCORE_COLS: { idx: number; key: string }[] = [
  { idx: 6, key: 'prep_research' },
  { idx: 7, key: 'prep_key_to_win' },
  { idx: 8, key: 'greet_rapport' },
  { idx: 9, key: 'greet_intro' },
  { idx: 10, key: 'greet_freshket' },
  { idx: 12, key: 'disc_check' },
  { idx: 13, key: 'disc_order' },
  { idx: 14, key: 'disc_receive' },
  { idx: 15, key: 'disc_pay' },
  { idx: 16, key: 'disc_billing' },
  { idx: 17, key: 'disc_product_pain' },
  { idx: 18, key: 'disc_active' },
  { idx: 19, key: 'pain_insight' },
  { idx: 20, key: 'insight_capture' },
  { idx: 22, key: 'sol_pitch' },
  { idx: 23, key: 'sol_customize' },
  { idx: 24, key: 'sol_knowledge' },
  { idx: 26, key: 'close_next' },
  { idx: 27, key: 'close_commit' },
  { idx: 28, key: 'close_pro' },
  { idx: 30, key: 'tools_explain' },
  { idx: 31, key: 'tools_line_oa' },
  { idx: 32, key: 'fu_results' },
  { idx: 33, key: 'fu_pain' },
  { idx: 34, key: 'fu_remember' },
]
// Notes are per-SECTION (not per-topic) — folded into one labelled overallNote.
const RP_NOTE_COLS: { idx: number; label: string }[] = [
  { idx: 11, label: 'Greeting' },
  { idx: 21, label: 'Discovery' },
  { idx: 25, label: 'Solution' },
  { idx: 29, label: 'Closing' },
  { idx: 35, label: 'Follow Up' },
]

export interface ParsedRoleplayRow {
  assessorEmail: string          // lowercased; the person who graded (col 1)
  subjectName: string            // raw Name cell — resolved to a user server-side
  team: string
  round: number
  type: 'pre' | 'post'           // round 1 → pre, later rounds → post
  takenAt: string                // raw Timestamp cell (col 0)
  ratings: { key: string; rating: number }[]
  overallNote: string
}

export interface RoleplayParseResult {
  data: ParsedRoleplayRow[]
  skipped: { name: string; reason: 'test' }[]   // obvious test rows, surfaced not written
  errors: CSVImportError[]
}

// A Name cell that is clearly a trainer's own test run rather than a real
// trainee ("Kik- Testing not real", "Kik Round 3", "Kik - Test Round 2").
function isRoleplayTestName(name: string): boolean {
  return /test/i.test(name) || /\bround\b/i.test(name)
}

// Operates on raw TEXT so it runs identically in the browser and a Node route.
export function parseRoleplayText(text: string): RoleplayParseResult {
  const { data: matrix, errors: parseErrors } = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  })

  const errors: CSVImportError[] = parseErrors.map((e) => ({
    row: e.row ?? 0, field: 'parse', message: e.message, rawValue: '',
  }))

  if (matrix.length < 2) {
    errors.push({ row: 0, field: 'header', message: 'ไฟล์ว่างหรือไม่มีข้อมูล (ต้องมีอย่างน้อย 1 แถวข้อมูลใต้ header)', rawValue: '' })
    return { data: [], skipped: [], errors }
  }

  // Verify the fixed layout: col 1 ≈ Email, col 2 ≈ Name, and enough columns
  // for all 25 score cells. One clear header error beats N per-row failures.
  const header = matrix[0].map((h) => (h ?? '').trim().toLowerCase())
  if (header.length < 35 || !header[1]?.includes('email') || !header[2]?.includes('name')) {
    errors.push({
      row: 0,
      field: 'header',
      message: `รูปแบบไฟล์ไม่ตรงกับ Roleplay export (ต้องมีคอลัมน์ Timestamp, Email Address, Name, Section, Team, ครั้งที่สอบ แล้วตามด้วยคะแนน 25 หัวข้อ) — พบ ${header.length} คอลัมน์`,
      rawValue: matrix[0].slice(0, 6).join(', '),
    })
    return { data: [], skipped: [], errors }
  }

  const rows: ParsedRoleplayRow[] = []
  const skipped: { name: string; reason: 'test' }[] = []

  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i]
    const rowNum = i + 1
    const assessorEmail = (cols[1] ?? '').trim().toLowerCase()
    const subjectName = (cols[2] ?? '').trim()

    // Trailing blank line / empty subject → silently skip.
    if (!subjectName && !assessorEmail) continue
    if (!subjectName) {
      errors.push({ row: rowNum, field: 'name', message: 'ไม่พบชื่อผู้ถูกประเมิน (คอลัมน์ Name)', rawValue: '' })
      continue
    }
    if (isRoleplayTestName(subjectName)) {
      skipped.push({ name: subjectName, reason: 'test' })
      continue
    }

    // Round from "ครั้งที่ N" — first integer in the cell, default 1.
    const roundMatch = (cols[5] ?? '').match(/\d+/)
    const round = roundMatch ? Math.max(1, parseInt(roundMatch[0], 10)) : 1
    const type: 'pre' | 'post' = round === 1 ? 'pre' : 'post'

    const ratings = RP_SCORE_COLS.map(({ idx, key }) => {
      const raw = (cols[idx] ?? '').trim()
      const n = parseInt(raw, 10)
      // Blank / non-numeric → rating 0 = "not scored" (avgTopics ignores 0s).
      return { key, rating: !raw || isNaN(n) ? 0 : Math.min(10, Math.max(0, n)) }
    })

    const overallNote = RP_NOTE_COLS
      .map(({ idx, label }) => {
        const note = (cols[idx] ?? '').trim()
        return note ? `[${label}] ${note}` : ''
      })
      .filter(Boolean)
      .join('\n\n')

    rows.push({
      assessorEmail,
      subjectName,
      team: (cols[4] ?? '').trim(),
      round,
      type,
      takenAt: (cols[0] ?? '').trim(),
      ratings,
      overallNote,
    })
  }

  return { data: rows, skipped, errors }
}

const TRAINING_REQUIRED_FIELDS = ['employeeEmail', 'courseId', 'courseTitle', 'status']

// ── Column resolution ──────────────────────────────────────────────────────
// Google Forms exports headers like "Timestamp", "Email Address", "Score",
// plus a custom question column for Pre/Post ("Type"). Match case-insensitively,
// exact name first, then prefix, then substring — so a minor rename ("Total
// score" instead of "Score", "Email" instead of "Email Address") still
// resolves instead of silently returning undefined for every row.
export function resolveColumn(headers: string[], want: string): string | null {
  const w = want.toLowerCase()
  const norm = headers.map((h) => ({ h, low: h.trim().toLowerCase() }))
  return (
    norm.find((x) => x.low === w)?.h ??
    norm.find((x) => x.low.startsWith(w))?.h ??
    norm.find((x) => x.low.includes(w))?.h ??
    null
  )
}

// ── Score fraction parsing ─────────────────────────────────────────────────
// A cell meant to read "6/10" (6 correct out of 10) is exactly the shape a
// spreadsheet auto-formats as a DATE the moment the Score column isn't set to
// Text — Google Sheets/Excel silently rewrites it to "6/10/2026", "10-Jun-26",
// or (if the cell had no display format at all) a bare serial number like
// 45850. All three still mean "6 out of 10"; only the first is recoverable
// without guessing. Returns a `reason` distinguishing "this was clearly
// mangled into a date by a spreadsheet" (actionable: fix the source column's
// format) from "not a recognizable fraction at all".
export function parseScoreFraction(raw: string): { score: number; total: number } | { reason: 'date' | 'invalid' } {
  // Strip whitespace and Excel's force-text leading apostrophe ('6/10).
  const cleaned = raw.trim().replace(/^'/, '')
  if (!cleaned) return { reason: 'invalid' }

  // "N/M", tolerating a trailing "/extra" a date-reformat may have appended
  // (e.g. "6/10/2026" — take the first two numbers, ignore the rest).
  const frac = cleaned.match(/^(\d{1,3})\s*[/\\]\s*(\d{1,3})(?:\s*[/\\]\s*\d{1,4})?$/)
  // "6 of 10" / "6 out of 10" phrasing, just in case.
  const worded = !frac ? cleaned.match(/^(\d{1,3})\s*(?:out\s*of|of)\s*(\d{1,3})$/i) : null
  const m = frac ?? worded
  if (m) {
    let score = Number(m[1])
    let total = Number(m[2])
    // A test can't score higher than its total — the only sane reading when
    // this happens is that a spreadsheet swapped day/month on re-save (e.g.
    // "6/10" → reformatted, then displayed back as "10/6"). Recover by
    // swapping rather than rejecting a value we can actually resolve.
    if (total > 0 && score > total) [score, total] = [total, score]
    return { score, total }
  }

  // No slash-style fraction found — check whether this looks like a date a
  // spreadsheet produced (month name, ISO date, or a bare Excel-serial-range
  // integer), so the error message can name the real cause instead of just
  // "invalid format".
  const MONTH_NAME = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i
  const isoDate = /^\d{4}-\d{2}-\d{2}/
  const bareSerial = /^\d{4,6}$/.test(cleaned) && Number(cleaned) > 1000
  if (MONTH_NAME.test(cleaned) || isoDate.test(cleaned) || bareSerial) {
    return { reason: 'date' }
  }
  return { reason: 'invalid' }
}

export function parseAssessmentCSV(file: File): Promise<ParseResult<ParsedAssessmentScore>> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors: parseErrors, meta }) => {
        const csvErrors: CSVImportError[] = parseErrors.map((e) => ({
          row: e.row ?? 0, field: 'parse', message: e.message, rawValue: '',
        }))
        const rows: ParsedAssessmentScore[] = []

        const headers = meta.fields ?? (data[0] ? Object.keys(data[0]) : [])
        const emailCol = resolveColumn(headers, 'email')
        const scoreCol = resolveColumn(headers, 'score')
        const typeCol = resolveColumn(headers, 'type')
        const timeCol = resolveColumn(headers, 'timestamp')

        // Fail fast with ONE clear error naming exactly which column is
        // missing, instead of a wall of confusing per-row "invalid format"
        // errors that are really a header-mismatch problem in disguise.
        const missing: string[] = []
        if (!emailCol) missing.push('Email Address')
        if (!scoreCol) missing.push('Score')
        if (!typeCol) missing.push('Type')
        if (!timeCol) missing.push('Timestamp')
        if (missing.length > 0) {
          csvErrors.push({
            row: 0,
            field: 'header',
            message: `ไม่พบคอลัมน์ ${missing.join(', ')} ในไฟล์ — คอลัมน์ที่พบจริง: ${headers.join(', ') || '(ไม่มี)'}`,
            rawValue: '',
          })
          resolve({ data: [], errors: csvErrors })
          return
        }
        // Narrowed for TS: the missing-column check above already guarantees
        // all four are non-null past this point.
        const email_ = emailCol as string, score_ = scoreCol as string, type_ = typeCol as string, time_ = timeCol as string

        data.forEach((row, idx) => {
          const rowNum = idx + 2
          const email = row[email_]?.trim().toLowerCase() ?? ''
          const scoreRaw = row[score_]?.trim() ?? ''
          const typeRaw = row[type_] ?? ''
          const takenAt = row[time_]?.trim() ?? ''

          if (!email) return // blank trailing line
          if (!email.endsWith('@freshket.co')) {
            csvErrors.push({ row: rowNum, field: 'email', message: 'อีเมลต้องเป็น @freshket.co', rawValue: email })
            return
          }

          const type: 'pre' | 'post' | null =
            typeRaw.includes('Post Test') ? 'post' : typeRaw.includes('Pre Test') ? 'pre' : null
          if (!type) {
            csvErrors.push({ row: rowNum, field: 'type', message: 'ไม่พบ Pre/Post Test', rawValue: typeRaw })
            return
          }

          const parsed = parseScoreFraction(scoreRaw)
          if ('reason' in parsed) {
            csvErrors.push({
              row: rowNum,
              field: 'score',
              message: parsed.reason === 'date'
                ? `คอลัมน์ Score ถูกแปลงเป็นวันที่โดยอัตโนมัติ (ค่าที่อ่านได้: "${scoreRaw}") — เปิดไฟล์ต้นฉบับ ตั้งรูปแบบคอลัมน์ Score เป็นข้อความ (Plain text) แล้ว export ใหม่`
                : 'รูปแบบคะแนนไม่ถูกต้อง (ต้องเป็น N/M เช่น 6/10)',
              rawValue: scoreRaw,
            })
            return
          }
          const { score, total } = parsed
          if (!total) {
            csvErrors.push({ row: rowNum, field: 'score', message: 'คะแนนเต็มเป็น 0', rawValue: scoreRaw })
            return
          }

          rows.push({ email, type, score, total, pct: Math.round((score / total) * 100), takenAt })
        })

        resolve({ data: rows, errors: csvErrors })
      },
    })
  })
}

export function parseTrainingResultCSV(file: File): Promise<ParseResult<ParsedTrainingResult>> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors: parseErrors }) => {
        const csvErrors: CSVImportError[] = parseErrors.map((e) => ({
          row: e.row ?? 0,
          field: 'parse',
          message: e.message,
          rawValue: '',
        }))

        const results: ParsedTrainingResult[] = []

        data.forEach((row, idx) => {
          const rowNum = idx + 2

          for (const field of TRAINING_REQUIRED_FIELDS) {
            if (!row[field]?.trim()) {
              csvErrors.push({ row: rowNum, field, message: `ต้องกรอก ${field}`, rawValue: row[field] ?? '' })
              return
            }
          }

          const score = row.score ? parseFloat(row.score) : undefined
          if (score !== undefined && (isNaN(score) || score < 0 || score > 100)) {
            csvErrors.push({ row: rowNum, field: 'score', message: 'คะแนนต้องอยู่ระหว่าง 0-100', rawValue: row.score })
            return
          }

          results.push({
            employeeEmail: row.employeeEmail.trim().toLowerCase(),
            courseId: row.courseId.trim(),
            courseTitle: row.courseTitle.trim(),
            status: row.status.trim(),
            score,
            completedAt: row.completedAt?.trim(),
          })
        })

        resolve({ data: results, errors: csvErrors })
      },
    })
  })
}
