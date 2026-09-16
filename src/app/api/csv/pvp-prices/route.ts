import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'

// POST /api/csv/pvp-prices — bulk import of the PVP price list.
//
// The browser parses the CSV and posts rows in chunks; each call upserts one
// chunk into Supabase Postgres and returns.
//
// This route used to write Firestore and was far more involved: it hashed
// every row to skip unchanged ones, tracked a per-run quota-exhaustion state,
// and maintained a separate summary document, all to stay inside Firestore's
// free-tier limit of 20k writes per day against a ~25k-row sheet. A full
// import could not finish in one day and took the login path down with it when
// the quota ran out. Postgres bills storage rather than operations, so the
// upsert is unconditional and the whole apparatus is gone.
export const maxDuration = 60

const MAX_ROWS_PER_REQUEST = 5000

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

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.response

  let rows: PvpImportRow[]
  try {
    const body = await req.json()
    rows = body?.rows
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'ต้องส่ง rows เป็น array' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'body ไม่ใช่ JSON ที่ถูกต้อง' }, { status: 400 })
  }

  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json(
      { error: `ส่งได้สูงสุด ${MAX_ROWS_PER_REQUEST} แถวต่อครั้ง (ได้รับ ${rows.length})` },
      { status: 400 },
    )
  }

  try {
    // Last row wins on a duplicate SKU within the chunk. Postgres rejects an
    // upsert whose payload names the same primary key twice, so this has to be
    // resolved before the request rather than left to the database.
    const bySku = new Map<string, PvpImportRow>()
    for (const r of rows) {
      const sku = String(r?.sku ?? '').trim()
      if (sku) bySku.set(sku, r)
    }

    const payload = Array.from(bySku.entries()).map(([sku, r]) => ({
      sku,
      name: String(r.name ?? ''),
      pack_size: String(r.packSize ?? ''),
      category: String(r.category ?? ''),
      picture_url: String(r.pictureUrl ?? ''),
      public_price: num(r.publicPrice),
      public_price_ex_vat: num(r.publicPriceExVat),
      private_price: num(r.privatePrice),
      private_price_ex_vat: num(r.privatePriceExVat),
      vat: num(r.vat),
      remark: String(r.remark ?? ''),
      updated_at: new Date().toISOString(),
    }))

    if (payload.length === 0) {
      return NextResponse.json({ written: 0 })
    }

    const { error } = await getSupabaseAdmin()
      .from('pvp_prices')
      .upsert(payload, { onConflict: 'sku' })

    if (error) {
      console.error('POST /api/csv/pvp-prices upsert', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ written: payload.length })
  } catch (e) {
    console.error('POST /api/csv/pvp-prices', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
