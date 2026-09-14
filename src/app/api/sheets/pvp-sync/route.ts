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
// Scale note: the PVP tab runs ~25k rows, and this project is on Vercel's
// Hobby plan (60s hard ceiling per function, not extendable). Batches are
// dispatched concurrently (not awaited one-by-one) to fit that ceiling —
// ~56 batches of 450 writes finishes well under 60s in parallel, whereas
// sequential commits alone got close to timing out at this row count.
export const maxDuration = 60

const SPREADSHEET_ID = '1QPkrSSDREZazXBlw0ZiVsu5eCqJ-1ODcfk4U1Zzs3wQ'
const SHEET_NAME = 'PVP'
const COLLECTION = 'pvpPrices'

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

async function fetchSheetRows(token: string): Promise<string[][]> {
  const range = encodeURIComponent(`${SHEET_NAME}!A2:K`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`อ่านชีต PVP ไม่สำเร็จ: ${res.status} ${await res.text()}`)
  const body = await res.json()
  return body.values ?? []
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-sync-secret') ?? ''
  if (!process.env.SHEETS_SYNC_SECRET || secret !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getAdminFirestore()

    // Fetch the sheet and the current collection at the same time — at 25k
    // rows, doing these sequentially alone cost a couple of seconds that
    // matter against a 60s ceiling.
    const [token, existingSnap] = await Promise.all([
      getSheetsAccessToken(),
      db.collection(COLLECTION).select().get(),
    ])
    const existingIds = new Set(existingSnap.docs.map(d => d.id))
    const rows = await fetchSheetRows(token)

    const now = Timestamp.now()
    const seenSkus = new Set<string>()
    const problems: string[] = []
    let created = 0
    let updated = 0
    let skipped = 0

    // Build every write up front, then flush all batches concurrently
    // instead of one commit-then-wait at a time — sequential commits at 25k
    // rows (~56 batches) ran too close to Vercel's 60s Hobby-plan ceiling.
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
      const rowNo = i + 2 // account for header row + 0-index
      const sku = str(r[COL.sku])
      const name = str(r[COL.name])

      if (!sku && !name) continue // blank spacer row

      if (!sku) {
        problems.push(`แถว ${rowNo}: ${name || '(ไม่มีชื่อ)'} — ไม่มี SKU`)
        skipped++
        continue
      }
      if (seenSkus.has(sku)) {
        problems.push(`แถว ${rowNo}: SKU ${sku} ซ้ำ — ใช้ค่าจากแถวแรก`)
        skipped++
        continue
      }
      seenSkus.add(sku)

      const isNew = !existingIds.has(sku)
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
        ...(isNew ? { createdAt: now } : {}),
        updatedAt: now,
      }, { merge: true })
      batchCount++
      isNew ? created++ : updated++

      // Firestore batch hard cap is 500 writes.
      if (batchCount === 450) flush()
    }
    flush()

    // A SKU no longer present in the sheet is a delisted price — deleted
    // outright, since this collection mirrors a live price list.
    const toDelete = Array.from(existingIds).filter(id => !seenSkus.has(id))
    for (let i = 0; i < toDelete.length; i += 450) {
      const delBatch = db.batch()
      for (const id of toDelete.slice(i, i + 450)) delBatch.delete(db.collection(COLLECTION).doc(id))
      commits.push(delBatch.commit())
    }

    await Promise.all(commits)

    return NextResponse.json({ created, updated, deleted: toDelete.length, skipped, problems })
  } catch (e) {
    console.error('POST /api/sheets/pvp-sync', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
