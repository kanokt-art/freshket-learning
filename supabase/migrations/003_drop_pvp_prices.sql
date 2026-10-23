-- Drop the cancelled PVP price list table.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- The PVP project was cancelled before the table was ever loaded (it held 0
-- rows), and the application code for it — the import page, both sync routes,
-- the query layer and the Product List tab — has been removed. The matching
-- Firestore collections (pvpPrices, products, pvpSyncRuns) are already empty.
--
-- cuisine_sale is unrelated and stays: it borrowed the same shared-secret
-- sync pattern but is its own feature.

drop table if exists public.pvp_prices cascade;
