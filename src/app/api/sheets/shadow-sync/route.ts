import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getStore } from '@/lib/server/store'
import { toShadowRecord, type ShadowSheetRow } from '@/lib/shadow/sheetImport'

// POST /api/sheets/shadow-sync
//
// Target of the course-scores Apps Script (docs/apps-script/course-scores) for the
// "Shadow" tab: one row per shadow visit a sale logged in the Google Form. Each row
// becomes a shadowRecords document (see lib/shadow/sheetImport.ts for the column map).
//
// The id comes from the observer and the form timestamp, so sending the whole tab again
// updates the same records: the sheet wins, and anything added in the app afterwards
// (a manager's review, which lives under the same id) is untouched.
//
// This does NOT notify anyone or post to Slack: it brings history across, it is not a
// new visit being reported.
//
// Auth: the shared secret SHEETS_SYNC_SECRET in the `x-sync-secret` header (Apps Script
// cannot present a Firebase ID token).
export const maxDuration = 60

const MAX_ROWS = 5000

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

  let body: { rows?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!Array.isArray(body.rows) || body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `rows must be a list of at most ${MAX_ROWS}` }, { status: 400 })
  }

  try {
    const store = getStore()

    // lower-cased email → person (the HR-imported profile wins over a first-login one)
    const people = new Map<string, { uid: string; name: string }>()
    for (const d of await store.query('users')) {
      const key = String(d.email ?? '').trim().toLowerCase()
      if (!key) continue
      const have = people.get(key)
      if (have && (have.uid.startsWith('csv-') || !d.id.startsWith('csv-'))) continue
      people.set(key, { uid: d.id, name: String(d.displayName ?? d.displayNameEN ?? key) })
    }

    const errors: Array<{ row: number; message: string }> = []
    const unknownChoices = new Set<string>()
    const docs = new Map<string, { id: string; data: Record<string, unknown> }>()
    ;(body.rows as ShadowSheetRow[]).forEach((r, i) => {
      const email = typeof r.observerEmail === 'string' ? r.observerEmail.trim().toLowerCase() : ''
      const mapped = toShadowRecord(r ?? {}, people.get(email) ?? null)
      if (!mapped.ok) { errors.push({ row: i + 2, message: mapped.reason }); return }
      mapped.unknownChoices.forEach((c) => unknownChoices.add(c))
      docs.set(mapped.id, { id: mapped.id, data: mapped.data })   // the same visit twice: the later row wins
    })

    const ids = Array.from(docs.keys())
    const existing = new Set((await store.getMany('shadowRecords', ids)).map((d) => d.id))
    await store.setMany('shadowRecords', Array.from(docs.values()), { merge: true })

    return NextResponse.json({
      ok: true,
      rows: (body.rows as unknown[]).length,
      written: ids.length,
      created: ids.filter((id) => !existing.has(id)).length,
      unmatched: Array.from(new Set(errors.filter((e) => e.message.startsWith('ไม่พบพนักงาน')).map((e) => e.message.replace('ไม่พบพนักงานตามอีเมล ', '')))),
      unknownChoices: Array.from(unknownChoices),
      errors: errors.slice(0, 50),
      errorCount: errors.length,
    })
  } catch (e) {
    console.error('POST /api/sheets/shadow-sync', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
