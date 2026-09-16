import { supabase } from './client'
import type { PvpPrice } from '@/types/pvpPrice'

// Queries for the PVP price list, which lives in Supabase Postgres rather than
// Firestore. See supabase/migrations/001_pvp_prices.sql for why.
//
// These are one-shot reads, not subscriptions. Prices change when someone
// imports a new CSV — a handful of times a month — so there is nothing for a
// live listener to deliver, and the Firestore hooks' listener machinery has no
// counterpart here on purpose.

const TABLE = 'pvp_prices'

// Postgres row shape (snake_case) as PostgREST returns it.
interface PvpRow {
  sku: string
  name: string
  pack_size: string
  category: string
  picture_url: string
  public_price: number | null
  public_price_ex_vat: number | null
  private_price: number | null
  private_price_ex_vat: number | null
  vat: number | null
  remark: string
  updated_at: string
}

function toPvpPrice(r: PvpRow): PvpPrice {
  return {
    id: r.sku,
    sku: r.sku,
    name: r.name,
    packSize: r.pack_size,
    category: r.category,
    pictureUrl: r.picture_url,
    publicPrice: r.public_price,
    publicPriceExVat: r.public_price_ex_vat,
    privatePrice: r.private_price,
    privatePriceExVat: r.private_price_ex_vat,
    vat: r.vat,
    remark: r.remark,
    // Kept for interface compatibility with the Firestore shape. The importer
    // no longer needs a change digest — Postgres upserts the whole row — so
    // nothing reads this.
    rowHash: '',
    updatedAt: new Date(r.updated_at),
  }
}

export interface PvpQuery {
  category?: string | null
  search?: string | null
  page?: number
  pageSize?: number
}

export interface PvpPage {
  rows: PvpPrice[]
  total: number
}

/**
 * One page of the price list, filtered and searched in the database.
 *
 * Both filters run server-side, which is the point of the move: on Firestore
 * the category had to be chosen before anything loaded (an unfiltered read was
 * ~20k billed reads) and search could only scan whatever was already in the
 * browser. Here an empty filter is just a query.
 */
export async function fetchPvpPrices({
  category = null,
  search = null,
  page = 1,
  pageSize = 50,
}: PvpQuery = {}): Promise<PvpPage> {
  const from = (page - 1) * pageSize

  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('sku', { ascending: true })
    .range(from, from + pageSize - 1)

  if (category) q = q.eq('category', category)

  const term = search?.trim()
  if (term) {
    // Escape PostgREST's or() delimiters so a comma or paren in the search box
    // cannot break out of the filter expression.
    const safe = term.replace(/[,()]/g, ' ')
    q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
  }

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  return { rows: (data ?? []).map(toPvpPrice), total: count ?? 0 }
}

/**
 * The distinct category list for the filter dropdown.
 *
 * On Firestore this needed a summary document maintained by the importer,
 * because deriving it meant reading every price row. Here it is a query, so
 * the summary document and the code that wrote it are gone.
 */
export async function fetchPvpCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('category')
    .not('category', 'eq', '')
    .order('category', { ascending: true })

  if (error) throw new Error(error.message)

  const seen = new Set<string>()
  for (const r of (data ?? []) as { category: string }[]) seen.add(r.category)
  return Array.from(seen)
}

/** Total row count, for the empty state before a filter is applied. */
export async function fetchPvpCount(): Promise<number> {
  const { count, error } = await supabase
    .from(TABLE)
    .select('sku', { count: 'exact', head: true })

  if (error) throw new Error(error.message)
  return count ?? 0
}
