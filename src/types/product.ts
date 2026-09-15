// Legacy shape of the `products` Firestore collection, filled from the
// "Public-price" Google Sheet by the now-retired ProductsSync.gs. The PVP tab
// superseded it (same products, plus private prices) — see the pvpPrices
// collection and docs/apps-script/PvpSync.gs. Nothing reads this today.
// Field names mirror the sheet's own headers (Thai/English columns kept
// separate, as the sheet has them) rather than being renamed to a house style,
// so the sync script and this type stay trivially comparable column-by-column.

export interface Product {
  id: string              // Firestore doc id — same as fkId (sanitized)
  no?: number              // No. — row's running number in the sheet, not stable across re-sorts
  grade?: string           // Grade
  fkId: string             // FK ID — Freshket product code, the stable join key
  nameThai: string         // Product_Name_Thai
  packSize?: string        // Pack size
  categoryThai?: string    // Product_Category_Thai
  nameEnglish?: string     // Product_Name_Englist (sheet's own spelling)
  categoryEnglish?: string // Product_Category_Englist
  converter?: string       // Converter — unit conversion note, kept as the sheet's raw text
  isActive: boolean        // is_active
  publicPrice?: number     // Public Price
  publicPriceExVat?: number // Public Price Ex-VAT
  itemIsVat?: boolean      // item_is_vat
  vat?: number             // VAT
  adjustedWeight?: number  // Adjusted Weight
  remark?: string          // Remark
  exclusive?: string       // Exclusive
  createdAt: Date
  updatedAt: Date
}
