import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getStore } from '@/lib/server/store'
import { refreshManyUserStats } from '@/lib/server/userStats'
import { parseScoreCell, parseScoreType } from '@/lib/utils/csvParser'
import { groupByPerson, recordPatch, type ExistingRecord, type ScoreRow } from '@/lib/courses/scoreImport'

// POST /api/sheets/course-scores-sync
//
// Target of the "course scores" Apps Script (docs/apps-script/course-scores). That
// script reads the assessment tabs of the HR sheet (one Google Form per course) and
// posts one course's rows here; this route does exactly what the CSV score import
// does: a person's before (pre) and after (post) sittings go on ONE training record,
// the file's values replace what is stored, and a blank or missing sitting leaves the
// stored value alone (see lib/courses/scoreImport.ts). Sending the same rows again
// changes nothing, which is what lets the script re-send a whole tab every night.
//
// Auth: Apps Script cannot present a Firebase ID token, so this is gated by the shared
// secret SHEETS_SYNC_SECRET in the `x-sync-secret` header. The database key never
// leaves the server.
export const maxDuration = 60

const MAX_ROWS = 5000

interface IncomingRow { email?: unknown; type?: unknown; score?: unknown; timestamp?: unknown }

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function POST(req: NextRequest) {
  const secret = process.env.SHEETS_SYNC_SECRET
  if (!secret) return NextResponse.json({ error: 'SHEETS_SYNC_SECRET ยังไม่ได้ตั้งค่าบน server' }, { status: 500 })
  if (!same(req.headers.get('x-sync-secret') ?? '', secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { courseId?: unknown; rows?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : ''
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(courseId)) return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })
  if (!Array.isArray(body.rows) || body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `rows must be a list of at most ${MAX_ROWS}` }, { status: 400 })
  }

  try {
    const store = getStore()
    const course = await store.get('courses', courseId)
    if (!course) return NextResponse.json({ error: 'ไม่พบหลักสูตรนี้' }, { status: 404 })
    const courseTitle = String(course.title ?? '')

    // ── read the rows; anything unusable is reported, not guessed at ──────────
    const errors: Array<{ row: number; message: string }> = []
    const parsed: ScoreRow[] = []
    ;(body.rows as IncomingRow[]).forEach((r, i) => {
      const n = i + 2   // 1-based plus the header row of the sheet
      const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : ''
      if (!email.includes('@')) { errors.push({ row: n, message: 'ไม่มีอีเมล' }); return }
      const type = parseScoreType(typeof r.type === 'string' ? r.type : '')
      if (!type) { errors.push({ row: n, message: `type ไม่ใช่ก่อน/หลังเรียน ("${String(r.type ?? '')}")` }); return }
      let score: number | undefined
      const raw = typeof r.score === 'string' ? r.score.trim() : typeof r.score === 'number' ? String(r.score) : ''
      if (raw) {
        const cell = parseScoreCell(raw)
        if (!cell.ok) { errors.push({ row: n, message: cell.reason === 'date' ? `คะแนนถูกแปลงเป็นวันที่ ("${raw}")` : `คะแนนไม่ถูกต้อง ("${raw}")` }); return }
        score = cell.score
      }
      const t = typeof r.timestamp === 'string' ? r.timestamp : ''
      parsed.push({ email, type, score, status: 'completed', completedAt: t && !isNaN(new Date(t).getTime()) ? t : undefined })
    })

    // Later sitting wins when someone retook it, so order by when each was taken.
    parsed.sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))
    const people = groupByPerson(parsed)

    // ── who is who: lower-cased email → person (the HR-imported profile wins) ──
    const emailIndex = new Map<string, string>()
    for (const d of await store.query('users')) {
      const key = String(d.email ?? '').trim().toLowerCase()
      if (!key) continue
      const have = emailIndex.get(key)
      if (have && (have.startsWith('csv-') || !d.id.startsWith('csv-'))) continue
      emailIndex.set(key, d.id)
    }
    const matched = people.flatMap((p) => { const id = emailIndex.get(p.email); return id ? [{ p, id }] : [] })
    const unmatched = people.filter((p) => !emailIndex.has(p.email)).map((p) => p.email)

    // ── write ─────────────────────────────────────────────────────────────────
    const existing = new Map(
      (await store.getMany('trainingRecords', matched.map((m) => `${m.id}_${courseId}`))).map((d) => [d.id, d as unknown as ExistingRecord]),
    )
    const now = new Date()
    await store.setMany('trainingRecords', matched.map(({ p, id }) => ({
      id: `${id}_${courseId}`,
      data: {
        userId: id, courseId, courseTitle, source: 'google_form', updatedAt: now,
        ...recordPatch(p, existing.get(`${id}_${courseId}`) ?? null, now),
      },
    })), { merge: true })
    await refreshManyUserStats(store, matched.map((m) => m.id))

    return NextResponse.json({
      ok: true, course: courseTitle, rows: parsed.length, people: people.length,
      written: matched.length, created: matched.filter((m) => !existing.has(`${m.id}_${courseId}`)).length,
      unmatched, errors: errors.slice(0, 50), errorCount: errors.length,
    })
  } catch (e) {
    console.error('POST /api/sheets/course-scores-sync', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
