import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'

// POST /api/sheets/pvp-sync
//
// Webhook target for the "PVP" Apps Script trigger (docs/apps-script/PvpSync.gs).
// Apps Script only PINGS this route on edit/schedule — it never attaches sheet
// data — so this route does the actual work: read the "PVP" tab via the Google
// Sheets API (read-only, service account), then upsert/delete rows in the
// Firestore `pvpPrices` collection. Keeping the pull server-side avoids the
// Apps Script 6-minute execution ceiling and moves the Sheets→Firestore
// bandwidth off Google's infra entirely.
//
// Auth: Apps Script cannot present a Firebase ID token, so this route is
// gated by a shared secret (SHEETS_SYNC_SECRET) sent as `x-sync-secret`
// instead of requireSuperAdmin.
//
// Scale note: the PVP tab runs ~25k rows. This project is on Vercel's Hobby
// plan (60s hard ceiling per function, not extendable), and even with
// parallel batch commits a single-request sync of the whole sheet blew past
// that ceiling (FUNCTION_INVOCATION_TIMEOUT). So this endpoint is chunked
// instead of whole-sheet.
//
// Region note: Firestore for this project lives in asia-southeast3, so this
// function is pinned to sin1 in vercel.json. Left on Vercel's US default
// (iad1/sfo1) every Firestore round-trip crossed the Pacific (~200ms+), and
// even a single 3000-row chunk timed out.
//
// The chunk protocol:
//   POST ?offset=0&limit=3000        → syncs rows [offset, offset+limit) only
//     → { done: false, nextOffset, written, skipped, problems, runId }
//   POST ?offset=<last>&limit=3000   → last chunk, sheet exhausted
//     → { done: true, ... } (same shape, no nextOffset)
//   POST ?finalize=1&runId=<runId>   → deletes SKUs not seen by ANY chunk in
//                                       that run (must run after `done: true`)
// Apps Script drives the loop (see runFullSync_ in PvpSync.gs) — this route
// itself has no memory of "the whole sync" beyond what's in the `pvpSyncRuns`
// scratch doc for a given runId, written to and read by every chunk.
export const maxDuration = 60

const SPREADSHEET_ID = '1QPkrSSDREZazXBlw0ZiVsu5eCqJ-1ODcfk4U1Zzs3wQ'
const SHEET_NAME = 'PVP'
const COLLECTION = 'pvpPrices'
const RUNS_COLLECTION = 'pvpSyncRuns' // scratch parent: { startedAt }
const RUN_CHUNKS_SUBCOLLECTION = 'chunks' // one doc per chunk: { skus: string[] }

// 0-based column layout of the PVP tab. Must match the sheet.
const COL = {
  sku: 0,               // SKU              → doc id
  name: 1,               // NAME
  packSize: 2,           // Pack Size
  category: 3,           // Category
  picture: 4,            // Picture
  publicPrice: 5,        // Public Price
  publicPriceExVat: 6,   // Public Price Ex-Vat
  privatePrice: 7,       // Private Price
  privatePriceExVat: 8,  // Private Price Ex-Vat
  vat: 9,                // Vat
  remark: 10,            // Remark
} as const

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

// Empty cell → null (field is skipped, not written as 0) — a blank price
// means "unknown", not "free".
function num(v: unknown): number | null {
  const s = str(v)
  if (!s) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? null : n
}

let cachedToken: { token: string; expiresAt: number } | null = null

// Service-account JWT → OAuth access token for the read-only Sheets scope.
// Reuses the same Firebase Admin service account already configured for this
// app (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) — the PVP sheet must be
// shared with that email as a Viewer.
async function getSheetsAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const signature = base64url(
    crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(privateKey),
  )
  const jwt = `${header}.${claim}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`ขอ access token ไม่สำเร็จ: ${JSON.stringify(body)}`)

  cachedToken = { token: body.access_token, expiresAt: Date.now() + 55 * 60 * 1000 }
  return cachedToken.token
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// startRow/endRow are 1-based sheet row numbers (inclusive), matching the
// A1-notation range directly — caller does the offset→row math.
async function fetchSheetRows(token: string, startRow: number, endRow: number): Promise<string[][]> {
  const range = encodeURIComponent(`${SHEET_NAME}!A${startRow}:K${endRow}`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`อ่านชีต PVP ไม่สำเร็จ: ${res.status} ${await res.text()}`)
  const body = await res.json()
  return body.values ?? []
}

async function handleFinalize(req: NextRequest, db: FirebaseFirestore.Firestore) {
  const runId = req.nextUrl.searchParams.get('runId') ?? ''
  if (!runId) return NextResponse.json({ error: 'ต้องระบุ runId' }, { status: 400 })

  const runRef = db.collection(RUNS_COLLECTION).doc(runId)
  const runDoc = await runRef.get()
  if (!runDoc.exists) return NextResponse.json({ error: `ไม่พบ run ${runId}` }, { status: 404 })

  const chunksSnap = await runRef.collection(RUN_CHUNKS_SUBCOLLECTION).get()
  const seenSkus = new Set<string>()
  chunksSnap.docs.forEach(d => {
    const skus = d.data().skus as string[] | undefined
    skus?.forEach(s => seenSkus.add(s))
  })

  const existingSnap = await db.collection(COLLECTION).select().get()
  const toDelete = existingSnap.docs.map(d => d.id).filter(id => !seenSkus.has(id))

  const commits: Promise<unknown>[] = []
  for (let i = 0; i < toDelete.length; i += 450) {
    const delBatch = db.batch()
    for (const id of toDelete.slice(i, i + 450)) delBatch.delete(db.collection(COLLECTION).doc(id))
    commits.push(delBatch.commit())
  }
  await Promise.all(commits)

  // Clean up the scratch run doc + its chunk subcollection.
  const cleanupBatch = db.batch()
  chunksSnap.docs.forEach(d => cleanupBatch.delete(d.ref))
  cleanupBatch.delete(runRef)
  commits.push(cleanupBatch.commit())
  await Promise.all(commits)

  return NextResponse.json({ deleted: toDelete.length })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-sync-secret') ?? ''
  if (!process.env.SHEETS_SYNC_SECRET || secret !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminFirestore()

  if (req.nextUrl.searchParams.get('finalize') === '1') {
    try {
      return await handleFinalize(req, db)
    } catch (e) {
      console.error('POST /api/sheets/pvp-sync?finalize=1', e)
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  const offset = Number(req.nextUrl.searchParams.get('offset') ?? '0')
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '3000')
  let runId = req.nextUrl.searchParams.get('runId') ?? ''
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(limit) || limit <= 0) {
    return NextResponse.json({ error: 'offset/limit ไม่ถูกต้อง' }, { status: 400 })
  }

  const t0 = Date.now()
  const timing: Record<string, number> = {}
  const step = (m: string) => console.log(`[pvp-sync ${offset}/${limit}] +${Date.now() - t0}ms ${m}`)

  try {
    step('start')
    const token = await getSheetsAccessToken()
    timing.auth = Date.now() - t0
    step('auth ok')
    // Sheet row 1 is the header; offset 0 means "first data row" = sheet row 2.
    const startRow = offset + 2
    const endRow = startRow + limit - 1
    const tSheet = Date.now()
    const rows = await fetchSheetRows(token, startRow, endRow)
    timing.fetchSheet = Date.now() - tSheet
    step(`sheet ok, ${rows.length} rows`)

    if (!runId) runId = `run-${Date.now()}`
    const runRef = db.collection(RUNS_COLLECTION).doc(runId)
    // Always awaited (not only on the first chunk): this doubles as the
    // Firestore connection warm-up. Letting the very first write of the
    // request be one of the parallel batch commits below made every
    // offset>0 call hang until the function timed out.
    const tWarm = Date.now()
    await runRef.set({ startedAt: Timestamp.now() }, { merge: true })
    timing.warmup = Date.now() - tWarm
    step('warmup write ok')

    const now = Timestamp.now()
    const chunkSkus = new Set<string>()
    const problems: string[] = []
    let written = 0
    let skipped = 0

    let batch = db.batch()
    let batchCount = 0
    const commits: Promise<unknown>[] = []
    const flush = () => {
      if (batchCount === 0) return
      commits.push(batch.commit())
      batch = db.batch()
      batchCount = 0
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rowNo = startRow + i
      const sku = str(r[COL.sku])
      const name = str(r[COL.name])

      if (!sku && !name) continue // blank spacer row

      if (!sku) {
        problems.push(`แถว ${rowNo}: ${name || '(ไม่มีชื่อ)'} — ไม่มี SKU`)
        skipped++
        continue
      }
      if (chunkSkus.has(sku)) {
        problems.push(`แถว ${rowNo}: SKU ${sku} ซ้ำในชุดนี้ — ใช้ค่าจากแถวแรก`)
        skipped++
        continue
      }
      chunkSkus.add(sku)

      batch.set(db.collection(COLLECTION).doc(sku), {
        sku,
        name,
        packSize: str(r[COL.packSize]),
        category: str(r[COL.category]),
        pictureUrl: str(r[COL.picture]),
        publicPrice: num(r[COL.publicPrice]),
        publicPriceExVat: num(r[COL.publicPriceExVat]),
        privatePrice: num(r[COL.privatePrice]),
        privatePriceExVat: num(r[COL.privatePriceExVat]),
        vat: num(r[COL.vat]),
        remark: str(r[COL.remark]),
        updatedAt: now,
      }, { merge: true })
      batchCount++
      written++

      // Firestore batch hard cap is 500 writes.
      if (batchCount === 450) flush()
    }
    flush()

    // One doc per chunk (not arrayUnion into a single doc) — a full sync
    // sees ~25k SKUs total, which risks the 1MiB document-size limit if
    // accumulated into one array field.
    commits.push(runRef.collection(RUN_CHUNKS_SUBCOLLECTION).doc(String(offset)).set({
      skus: Array.from(chunkSkus),
    }))
    step(`built ${commits.length} commits, awaiting`)
    const tCommit = Date.now()
    await Promise.all(commits)
    timing.commit = Date.now() - tCommit
    step('commits ok')
    timing.total = Date.now() - t0

    const done = rows.length < limit // sheet ran out before filling this chunk
    return NextResponse.json({
      done,
      nextOffset: done ? undefined : offset + limit,
      runId,
      written,
      skipped,
      problems,
      timing,
    })
  } catch (e) {
    console.error('POST /api/sheets/pvp-sync', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
