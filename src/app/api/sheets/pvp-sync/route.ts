import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// POST /api/sheets/pvp-sync
//
// Sync target for the "PVP" Apps Script driver (docs/apps-script/PvpSync.gs).
// Apps Script never attaches sheet data — it only passes offset/limit — and
// this route reads the "PVP" tab itself via the Google Sheets API and writes
// the Firestore `pvpPrices` collection. Keeping the pull server-side avoids
// the Apps Script 6-minute execution ceiling.
//
// Auth: Apps Script cannot present a Firebase ID token, so this route is
// gated by a shared secret (SHEETS_SYNC_SECRET) sent as `x-sync-secret`
// instead of requireSuperAdmin.
//
// Why raw REST instead of firebase-admin: the Admin SDK talks gRPC, and on
// Vercel's serverless runtime those calls hung here — the write landed in
// Firestore but the promise never resolved, so every chunk burned the full
// 60s and returned FUNCTION_INVOCATION_TIMEOUT. The same writes over the
// Firestore REST API return in well under a second. (This is also what
// docs/apps-script/ProductsSync.gs does, for its own reasons.) Other routes
// in this app keep using the Admin SDK — their workloads are small enough
// that they have not hit this.
//
// Region: Firestore for this project is in asia-southeast3, so the function
// is pinned to sin1 in vercel.json; on Vercel's US default every round-trip
// crossed the Pacific.
//
// Quota: Firestore is on the free tier here — 20k writes/day against a 25k-row
// sheet, so a full rewrite every sync is not affordable. Each row stores a
// `rowHash` of its sheet values, and a chunk only writes rows whose hash
// changed. Reads (50k/day) are the cheaper side of that trade.
//
// Scale: the PVP tab runs ~25k rows, too many to sync inside one 60s
// invocation, so the endpoint is chunked:
//   POST ?offset=0&limit=3000        → syncs rows [offset, offset+limit) only
//     → { done: false, nextOffset, written, unchanged, skipped, problems, runId }
//   POST ?offset=<last>&limit=3000   → last chunk, sheet exhausted
//     → { done: true, ... } (no nextOffset)
//   POST ?finalize=1&runId=<runId>   → deletes SKUs no chunk in that run saw
// Apps Script drives the loop (runFullSync_ in PvpSync.gs); this route keeps
// no cross-chunk state beyond the `pvpSyncRuns/<runId>` scratch doc.
export const maxDuration = 60

const SPREADSHEET_ID = '1QPkrSSDREZazXBlw0ZiVsu5eCqJ-1ODcfk4U1Zzs3wQ'
const SHEET_NAME = 'PVP'
const COLLECTION = 'pvpPrices'
const RUNS_COLLECTION = 'pvpSyncRuns'
const RUN_CHUNKS_SUBCOLLECTION = 'chunks'
const BATCH_SIZE = 450 // Firestore :batchWrite caps at 500 writes per call

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

// Empty cell → null (field written as null, not 0) — a blank price means
// "unknown", not "free".
function num(v: unknown): number | null {
  const s = str(v)
  if (!s) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? null : n
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

let cachedToken: { token: string; expiresAt: number } | null = null

// One service-account JWT covering both APIs this route uses: read-only
// Sheets, and Firestore (datastore) for the REST writes below. Reuses the
// Firebase Admin service account already configured for this app — the PVP
// sheet must be shared with FIREBASE_CLIENT_EMAIL as a Viewer.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(JSON.stringify({
    iss: clientEmail,
    scope: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/datastore',
    ].join(' '),
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

// startRow/endRow are 1-based sheet rows (inclusive), matching A1 notation.
async function fetchSheetRows(token: string, startRow: number, endRow: number): Promise<string[][]> {
  const range = encodeURIComponent(`${SHEET_NAME}!A${startRow}:K${endRow}`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`อ่านชีต PVP ไม่สำเร็จ: ${res.status} ${await res.text()}`)
  const body = await res.json()
  return body.values ?? []
}

// ── Firestore REST helpers ──────────────────────────────────────────────────

const PROJECT_ID = () => process.env.FIREBASE_PROJECT_ID!
const DB_ROOT = () => `projects/${PROJECT_ID()}/databases/(default)/documents`
const API = 'https://firestore.googleapis.com/v1'

type FsValue =
  | { stringValue: string }
  | { doubleValue: number }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values: FsValue[] } }

function fsString(v: string): FsValue { return { stringValue: v } }
function fsNumber(v: number | null): FsValue { return v === null ? { nullValue: null } : { doubleValue: v } }

async function fsRequest(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`Firestore ${init?.method ?? 'GET'} ${path} ล้มเหลว: ${res.status} ${await res.text()}`)
  return res.json()
}

/** Every document id in a collection, following pagination. Ids only. */
async function listDocIds(token: string, collectionPath: string): Promise<string[]> {
  const ids: string[] = []
  let pageToken = ''
  do {
    const qs = new URLSearchParams({ pageSize: '1000', 'mask.fieldPaths': '__name__' })
    if (pageToken) qs.set('pageToken', pageToken)
    const body = await fsRequest(token, `${DB_ROOT()}/${collectionPath}?${qs}`)
    for (const doc of body.documents ?? []) ids.push(String(doc.name).split('/').pop()!)
    pageToken = body.nextPageToken ?? ''
  } while (pageToken)
  return ids
}

/**
 * Current row-hash of every doc in a page of `pvpPrices`, so a chunk can skip
 * rows whose sheet values are unchanged. Reads are ~10x cheaper than writes on
 * Firestore's free tier (50k/day vs 20k/day), and a re-sync of an unchanged
 * 25k-row sheet would otherwise burn the entire daily write quota to rewrite
 * data that is already correct.
 */
async function fetchRowHashes(token: string, skus: string[]): Promise<Map<string, string>> {
  const hashes = new Map<string, string>()
  if (skus.length === 0) return hashes

  // batchGet takes up to 1000 document names per call.
  for (let i = 0; i < skus.length; i += 300) {
    const slice = skus.slice(i, i + 300)
    const body = await fsRequest(token, `${DB_ROOT().replace(/\/documents$/, '')}/documents:batchGet`, {
      method: 'POST',
      body: JSON.stringify({
        documents: slice.map(sku => `${DB_ROOT()}/${COLLECTION}/${sku}`),
        mask: { fieldPaths: ['rowHash'] },
      }),
    })
    for (const entry of body as Array<{ found?: { name: string; fields?: Record<string, FsValue> } }>) {
      if (!entry.found) continue
      const id = entry.found.name.split('/').pop()!
      const h = entry.found.fields?.rowHash
      if (h && 'stringValue' in h) hashes.set(id, h.stringValue)
    }
  }
  return hashes
}

/** Stable digest of the sheet values that get persisted for a row. */
function rowHash(values: string[]): string {
  return crypto.createHash('sha1').update(values.join(' ')).digest('base64')
}

type Write =
  | { update: { name: string; fields: Record<string, FsValue> }; updateMask: { fieldPaths: string[] } }
  | { delete: string }

async function batchWrite(token: string, writes: Write[]): Promise<void> {
  if (writes.length === 0) return
  await fsRequest(token, `${DB_ROOT()}:batchWrite`, {
    method: 'POST',
    body: JSON.stringify({ writes }),
  })
}

function upsertWrite(collectionPath: string, docId: string, fields: Record<string, FsValue>): Write {
  return {
    update: { name: `${DB_ROOT()}/${collectionPath}/${docId}`, fields },
    updateMask: { fieldPaths: Object.keys(fields) },
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleFinalize(req: NextRequest, token: string) {
  const runId = req.nextUrl.searchParams.get('runId') ?? ''
  if (!runId) return NextResponse.json({ error: 'ต้องระบุ runId' }, { status: 400 })

  const chunkIds = await listDocIds(token, `${RUNS_COLLECTION}/${runId}/${RUN_CHUNKS_SUBCOLLECTION}`)
  if (chunkIds.length === 0) {
    return NextResponse.json({ error: `ไม่พบข้อมูล chunk ของ run ${runId}` }, { status: 404 })
  }

  const seenSkus = new Set<string>()
  for (const chunkId of chunkIds) {
    const doc = await fsRequest(token, `${DB_ROOT()}/${RUNS_COLLECTION}/${runId}/${RUN_CHUNKS_SUBCOLLECTION}/${chunkId}`)
    const values = doc.fields?.skus?.arrayValue?.values ?? []
    for (const v of values) seenSkus.add(v.stringValue)
  }

  const existingIds = await listDocIds(token, COLLECTION)
  const toDelete = existingIds.filter(id => !seenSkus.has(id))

  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    await batchWrite(token, toDelete.slice(i, i + BATCH_SIZE).map(id => ({
      delete: `${DB_ROOT()}/${COLLECTION}/${id}`,
    })))
  }

  // Clean up the scratch run doc + its chunks.
  const cleanup: Write[] = chunkIds.map(id => ({
    delete: `${DB_ROOT()}/${RUNS_COLLECTION}/${runId}/${RUN_CHUNKS_SUBCOLLECTION}/${id}`,
  }))
  cleanup.push({ delete: `${DB_ROOT()}/${RUNS_COLLECTION}/${runId}` })
  for (let i = 0; i < cleanup.length; i += BATCH_SIZE) {
    await batchWrite(token, cleanup.slice(i, i + BATCH_SIZE))
  }

  return NextResponse.json({ deleted: toDelete.length })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-sync-secret') ?? ''
  if (!process.env.SHEETS_SYNC_SECRET || secret !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()
  const timing: Record<string, number> = {}

  try {
    const token = await getAccessToken()
    timing.auth = Date.now() - t0

    if (req.nextUrl.searchParams.get('finalize') === '1') {
      return await handleFinalize(req, token)
    }

    const offset = Number(req.nextUrl.searchParams.get('offset') ?? '0')
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? '3000')
    let runId = req.nextUrl.searchParams.get('runId') ?? ''
    if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(limit) || limit <= 0) {
      return NextResponse.json({ error: 'offset/limit ไม่ถูกต้อง' }, { status: 400 })
    }
    if (!runId) runId = `run-${Date.now()}`

    // Sheet row 1 is the header; offset 0 means "first data row" = sheet row 2.
    const startRow = offset + 2
    const tSheet = Date.now()
    const rows = await fetchSheetRows(token, startRow, startRow + limit - 1)
    timing.fetchSheet = Date.now() - tSheet

    const nowIso = new Date().toISOString()
    const chunkSkus: string[] = []
    const seenInChunk = new Set<string>()
    const problems: string[] = []
    let written = 0
    let unchanged = 0
    let skipped = 0

    // Parse first so the existing hashes can be fetched in one pass.
    type Parsed = { sku: string; rowNo: number; values: string[]; hash: string }
    const parsed: Parsed[] = []
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
      if (seenInChunk.has(sku)) {
        problems.push(`แถว ${rowNo}: SKU ${sku} ซ้ำในชุดนี้ — ใช้ค่าจากแถวแรก`)
        skipped++
        continue
      }
      seenInChunk.add(sku)
      chunkSkus.push(sku)

      const values = [
        sku, name,
        str(r[COL.packSize]), str(r[COL.category]), str(r[COL.picture]),
        str(r[COL.publicPrice]), str(r[COL.publicPriceExVat]),
        str(r[COL.privatePrice]), str(r[COL.privatePriceExVat]),
        str(r[COL.vat]), str(r[COL.remark]),
      ]
      parsed.push({ sku, rowNo, values, hash: rowHash(values) })
    }

    const tRead = Date.now()
    const existingHashes = await fetchRowHashes(token, parsed.map(p => p.sku))
    timing.readHashes = Date.now() - tRead

    const writes: Write[] = []
    for (const p of parsed) {
      // Unchanged rows are the overwhelming majority on a routine re-sync;
      // skipping them is what keeps a 25k-row sheet inside Firestore's
      // 20k writes/day free-tier quota.
      if (existingHashes.get(p.sku) === p.hash) {
        unchanged++
        continue
      }
      const [sku, name, packSize, category, picture,
             publicPrice, publicPriceExVat, privatePrice, privatePriceExVat,
             vat, remark] = p.values

      writes.push(upsertWrite(COLLECTION, sku, {
        sku: fsString(sku),
        name: fsString(name),
        packSize: fsString(packSize),
        category: fsString(category),
        pictureUrl: fsString(picture),
        publicPrice: fsNumber(num(publicPrice)),
        publicPriceExVat: fsNumber(num(publicPriceExVat)),
        privatePrice: fsNumber(num(privatePrice)),
        privatePriceExVat: fsNumber(num(privatePriceExVat)),
        vat: fsNumber(num(vat)),
        remark: fsString(remark),
        rowHash: fsString(p.hash),
        updatedAt: { timestampValue: nowIso },
      }))
      written++
    }

    // Record which SKUs this chunk saw, so ?finalize=1 can work out what to
    // delete. One doc per chunk rather than one growing array — a full sync
    // sees ~25k SKUs, which would risk the 1MiB document limit.
    writes.push(upsertWrite(
      `${RUNS_COLLECTION}/${runId}/${RUN_CHUNKS_SUBCOLLECTION}`,
      String(offset),
      { skus: { arrayValue: { values: chunkSkus.map(fsString) } } },
    ))

    const tWrite = Date.now()
    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
      await batchWrite(token, writes.slice(i, i + BATCH_SIZE))
    }
    timing.write = Date.now() - tWrite
    timing.total = Date.now() - t0

    const done = rows.length < limit // sheet ran out before filling this chunk
    return NextResponse.json({
      done,
      nextOffset: done ? undefined : offset + limit,
      runId,
      written,
      unchanged,
      skipped,
      problems,
      timing,
    })
  } catch (e) {
    console.error('POST /api/sheets/pvp-sync', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
