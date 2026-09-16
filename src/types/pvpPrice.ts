// Freshket product price list, imported from the PVP sheet's CSV export via
// /admin/pvp-import into the `pvp_prices` table in Supabase Postgres (see
// supabase/migrations/001_pvp_prices.sql). Field names mirror the sheet's own
// columns so the importer and this type stay comparable column-by-column;
// src/lib/supabase/pvpPrices.ts maps the snake_case row onto this shape.

export interface PvpPrice {
  id: string                       // Firestore doc id — same as sku
  sku: string                      // SKU — the stable key
  name: string                     // NAME
  packSize: string                 // Pack Size
  category: string                 // Category — may be '' on an incomplete row
  pictureUrl: string               // Picture
  // A blank price cell means "unknown", not "free", so these are null rather
  // than 0 when the sheet leaves them empty.
  publicPrice: number | null       // Public Price
  publicPriceExVat: number | null  // Public Price Ex-Vat
  privatePrice: number | null      // Private Price
  privatePriceExVat: number | null // Private Price Ex-Vat
  vat: number | null               // Vat
  remark: string                   // Remark
  // Vestigial: on Firestore this held a digest so a re-import could skip
  // unchanged rows and stay inside the daily write quota. Postgres upserts the
  // row outright, so nothing reads or writes it any more.
  rowHash: string
  updatedAt: Date
}
