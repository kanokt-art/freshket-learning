import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getStore } from '@/lib/server/store'
import { toShadowRecord, type ShadowSheetRow } from '@/lib/shadow/sheetImport'
import { announceNewShadowVisit } from '@/lib/server/shadowNotice'
import type { UserProfile } from '@/types/user'

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
// A visit new to the system and sent in within the last few days is reported like one logged in the
// app (bell for the sender's manager and team lead(s), Slack group for sales); older rows are history
// and stay quiet.
//
// Auth: the shared secret SHEETS_SYNC_SECRET in the `x-sync-secret` header (Apps Script
// cannot present a Firebase ID token).
export const maxDuration = 60

const MAX_ROWS = 5000
/** How recent a new row must be to be reported as a new visit rather than brought across as history. */
const RECENT_MS = 3 * 24 * 60 * 60 * 1000
/** A cap on announcements in one call, so a large back-fill cannot run the function out of time. */
const MAX_ANNOUNCE = 30

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
    // The row the form just wrote, which the Apps Script marks on a form submit: always reported (once),
    // whatever its timestamp reads as, so a just-sent visit never waits on the date being parsed right.
    const justSubmitted = new Set<string>()
    ;(body.rows as Array<ShadowSheetRow & { submitted?: unknown }>).forEach((r, i) => {
      const email = typeof r.observerEmail === 'string' ? r.observerEmail.trim().toLowerCase() : ''
      const mapped = toShadowRecord(r ?? {}, people.get(email) ?? null)
      if (!mapped.ok) { errors.push({ row: i + 2, message: mapped.reason }); return }
      mapped.unknownChoices.forEach((c) => unknownChoices.add(c))
      docs.set(mapped.id, { id: mapped.id, data: mapped.data })   // the same visit twice: the later row wins
      if (r.submitted === true) justSubmitted.add(mapped.id)
    })

    const ids = Array.from(docs.keys())
    const existing = new Set((await store.getMany('shadowRecords', ids)).map((d) => d.id))
    await store.setMany('shadowRecords', Array.from(docs.values()), { merge: true })

    // A visit that is new to the system AND was sent in recently is reported like one logged in the app:
    // the bell for the sender's manager and team lead(s), and the Slack group for sales. Older rows are
    // history being brought across (a first full sync, or a row back-filled later) and stay quiet. Each
    // visit is announced at most once, however often the tab is sent again.
    const cutoff = Date.now() - RECENT_MS
    const fresh = ids.filter((id) => {
      if (existing.has(id)) return false
      if (justSubmitted.has(id)) return true
      const at = docs.get(id)!.data.createdAt
      const t = at instanceof Date ? at.getTime() : new Date(String(at)).getTime()
      return Number.isFinite(t) && t >= cutoff
    }).slice(0, MAX_ANNOUNCE)
    let announced = 0
    if (fresh.length > 0) {
      const senders = new Map((await store.getMany('users', Array.from(new Set(fresh.map((id) => String(docs.get(id)!.data.observerUid))))))
        .map((u) => [u.id, u as Partial<UserProfile>]))
      for (const id of fresh) {
        const d = docs.get(id)!.data
        const senderUid = String(d.observerUid)
        try {
          await announceNewShadowVisit(store, {
            recordId: id, senderUid, sender: senders.get(senderUid) ?? {},
            storeName: typeof d.storeName === 'string' ? d.storeName : undefined,
            segment: typeof d.segment === 'string' ? d.segment : undefined,
          })
          announced++
        } catch (e) {
          // Telling people must never fail the sync that saved the visit.
          console.error('shadow-sync: announce failed', id, e)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      rows: (body.rows as unknown[]).length,
      written: ids.length,
      created: ids.filter((id) => !existing.has(id)).length,
      announced,
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
