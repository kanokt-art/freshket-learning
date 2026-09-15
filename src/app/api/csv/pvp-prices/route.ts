import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'

// POST /api/csv/pvp-prices — bulk import of the PVP price list into `pvpPrices`.
//
// The browser parses the CSV and posts already-parsed rows in chunks, rather
// than uploading a 25k-row file for the server to parse: one request covering
// the whole file cannot finish inside Vercel's 60s function ceiling (the
// Sheets-API sync hit exactly that, see /api/sheets/pvp-sync). Each call here
// handles one bounded slice and returns, so no single request is long-running.
//
// Writes go over the Firestore REST API rather than firebase-admin because the
// Admin SDK's gRPC transport hangs on this runtime — the write lands but the
// promise never resolves, burning the whole 60s. Same reason and same shape as
// /api/sheets/pvp-sync; see the note there.
//
// Rows carry a `rowHash` and unchanged rows are skipped, so re-importing the
// same file costs almost no writes. That matters: Firestore is on the free
// tier here (20k writes/day) against a ~25k-row sheet.
export const maxDuration = 60

const COLLECTION = 'pvpPrices'
// The summary lives outside pvpPrices so it can never be mistaken for a price
// row by a query over that collection.
const SUMMARY_COLLECTION = 'appConfig'
const SUMMARY_DOC = 'pvpSummary'
const BATCH_SIZE = 450 // Firestore :batchWrite caps at 500 writes per call
const MAX_ROWS_PER_REQUEST = 2000

export interface PvpImportRow {
  sku: string
  name: string
  packSize: string
  category: string
  pictureUrl: string
  publicPrice: number | null
  publicPriceExVat: number | null
  privatePrice: number | null
  privatePriceExVat: number | null
  vat: number | null
  remark: string
}

type FsValue =
  | { stringValue: string }
  | { doubleValue: number }
  | { nullValue: null }
  | { timestampValue: string }

function fsString(v: string): FsValue { return { stringValue: v } }
function fsNumber(v: number | null): FsValue {
  return v === null || !Number.isFinite(v) ? { nullValue: null } : { doubleValue: v }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getFirestoreToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const signature = base64url(
    crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(privateKey),
  )

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`ขอ access token ไม่สำเร็จ: ${JSON.stringify(body)}`)

  cachedToken = { token: body.access_token, expiresAt: Date.now() + 55 * 60 * 1000 }
  return cachedToken.token
}

const DB_ROOT = () => `projects/${process.env.FIREBASE_PROJECT_ID!}/databases/(default)/documents`

class QuotaExhaustedError extends Error {
  constructor() { super('Firestore quota หมดแล้ววันนี้') }
}

async function fsRequest(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 429) throw new QuotaExhaustedError()
  if (!res.ok) throw new Error(`Firestore ${init?.method ?? 'GET'} ล้มเหลว: ${res.status} ${await res.text()}`)
  return res.json()
}

/** Stable digest of the values persisted for a row — the change check. */
function rowHash(r: PvpImportRow): string {
  const parts = [
    r.sku, r.name, r.packSize, r.category, r.pictureUrl,
    String(r.publicPrice ?? ''), String(r.publicPriceExVat ?? ''),
    String(r.privatePrice ?? ''), String(r.privatePriceExVat ?? ''),
    String(r.vat ?? ''), r.remark,
  ]
  return crypto.createHash('sha1').update(parts.join('')).digest('base64')
}

/** Existing rowHash for each sku, so unchanged rows can be skipped. */
async function fetchRowHashes(token: string, skus: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
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
      const h = entry.found.fields?.rowHash
      if (h && 'stringValue' in h) out.set(entry.found.name.split('/').pop()!, h.stringValue)
    }
  }
  return out
}

/**
 * Writes the summary the Product List reads to populate its category filter.
 * Sent once by the client at the end of an import, because deriving it
 * server-side would mean reading every price document — the exact cost the
 * summary exists to avoid.
 */
async function writeSummary(token: string, categories: string[], totalRows: number) {
  const fields: Record<string, FsValue | { arrayValue: { values: FsValue[] } }> = {
    categories: { arrayValue: { values: categories.map(fsString) } },
    totalRows: { doubleValue: totalRows },
    updatedAt: { timestampValue: new Date().toISOString() },
  }
  await fsRequest(token, `${DB_ROOT()}:batchWrite`, {
    method: 'POST',
    body: JSON.stringify({
      writes: [{
        update: { name: `${DB_ROOT()}/${SUMMARY_COLLECTION}/${SUMMARY_DOC}`, fields },
        updateMask: { fieldPaths: Object.keys(fields) },
      }],
    }),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.response

  let rows: PvpImportRow[]
  let summary: { categories?: unknown; totalRows?: unknown } | undefined
  try {
    const body = await req.json()
    rows = body?.rows ?? []
    summary = body?.summary
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'ต้องส่ง rows เป็น array' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'body ไม่ใช่ JSON ที่ถูกต้อง' }, { status: 400 })
  }

  // Summary-only call: the final request of an import, after every row chunk.
  if (summary && rows.length === 0) {
    try {
      const token = await getFirestoreToken()
      const categories = Array.isArray(summary.categories)
        ? summary.categories.filter((c): c is string => typeof c === 'string')
        : []
      const totalRows = typeof summary.totalRows === 'number' ? summary.totalRows : 0
      await writeSummary(token, categories, totalRows)
      return NextResponse.json({ written: 0, unchanged: 0, quotaExhausted: false, summaryWritten: true })
    } catch (e) {
      if (e instanceof QuotaExhaustedError) {
        return NextResponse.json({ written: 0, unchanged: 0, quotaExhausted: true })
      }
      console.error('POST /api/csv/pvp-prices (summary)', e)
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json(
      { error: `ส่งได้สูงสุด ${MAX_ROWS_PER_REQUEST} แถวต่อครั้ง (ได้รับ ${rows.length})` },
      { status: 400 },
    )
  }

  try {
    const token = await getFirestoreToken()

    // Last row wins on a duplicate SKU within the chunk — writing both would
    // just be two writes to the same doc.
    const bySku = new Map<string, PvpImportRow>()
    for (const r of rows) {
      const sku = String(r?.sku ?? '').trim()
      if (sku) bySku.set(sku, r)
    }
    const deduped = Array.from(bySku.entries())

    const existing = await fetchRowHashes(token, deduped.map(([sku]) => sku))

    const nowIso = new Date().toISOString()
    const writes: Array<{ update: { name: string; fields: Record<string, FsValue> }; updateMask: { fieldPaths: string[] } }> = []
    let unchanged = 0

    for (const [sku, r] of deduped) {
      const hash = rowHash({ ...r, sku })
      if (existing.get(sku) === hash) { unchanged++; continue }

      const fields: Record<string, FsValue> = {
        sku: fsString(sku),
        name: fsString(String(r.name ?? '')),
        packSize: fsString(String(r.packSize ?? '')),
        category: fsString(String(r.category ?? '')),
        pictureUrl: fsString(String(r.pictureUrl ?? '')),
        publicPrice: fsNumber(r.publicPrice),
        publicPriceExVat: fsNumber(r.publicPriceExVat),
        privatePrice: fsNumber(r.privatePrice),
        privatePriceExVat: fsNumber(r.privatePriceExVat),
        vat: fsNumber(r.vat),
        remark: fsString(String(r.remark ?? '')),
        rowHash: fsString(hash),
        updatedAt: { timestampValue: nowIso },
      }
      writes.push({
        update: { name: `${DB_ROOT()}/${COLLECTION}/${sku}`, fields },
        updateMask: { fieldPaths: Object.keys(fields) },
      })
    }

    let written = 0
    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
      const slice = writes.slice(i, i + BATCH_SIZE)
      try {
        await fsRequest(token, `${DB_ROOT()}:batchWrite`, {
          method: 'POST',
          body: JSON.stringify({ writes: slice }),
        })
        written += slice.length
      } catch (e) {
        if (e instanceof QuotaExhaustedError) {
          // Partial success is still progress — report how far we got so the
          // client can stop cleanly and resume after the quota resets, rather
          // than treating the whole chunk as failed and re-sending it.
          return NextResponse.json({ written, unchanged, quotaExhausted: true })
        }
        throw e
      }
    }

    return NextResponse.json({ written, unchanged, quotaExhausted: false })
  } catch (e) {
    console.error('POST /api/csv/pvp-prices', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
