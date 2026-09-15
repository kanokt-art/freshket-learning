// Freshket product price list, imported from the PVP sheet's CSV export via
// /admin/pvp-import into the `pvpPrices` Firestore collection. Field names
// mirror the sheet's own columns so the importer and this type stay
// comparable column-by-column.

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
  rowHash: string                  // digest of the sheet values; how a re-import skips unchanged rows
  updatedAt: Date
}

// Where the importer keeps its summary (appConfig/pvpSummary — outside the
// price collection, so a query over pvpPrices can never pick it up as a row).
// It exists so the Product List can populate its category filter, and show a
// total, without reading all ~20k price documents just to learn which
// categories exist — which would spend the entire daily free-tier read quota
// on a handful of page loads.
export const PVP_SUMMARY_COLLECTION = 'appConfig'
export const PVP_SUMMARY_DOC = 'pvpSummary'

export interface PvpSummary {
  categories: string[]  // distinct, sorted
  totalRows: number
  updatedAt: Date
}
