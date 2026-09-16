-- PVP product price list — moved off Firestore.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- Why this table lives here and not in Firestore: it holds ~20,000 rows that
-- are read constantly and written rarely. Firestore's free tier meters reads
-- and writes per day, so a single person opening the product list consumed
-- ~41% of the daily read allowance, and one full import exceeded a day's
-- writes outright — which is what took logins down. Supabase's free tier
-- meters storage instead, and the whole dataset is about 14 MB of 500 MB, so
-- the same access patterns cost nothing.

create table if not exists pvp_prices (
  sku                   text primary key,
  name                  text not null default '',
  pack_size             text not null default '',
  category              text not null default '',
  picture_url           text not null default '',

  -- Nullable on purpose: a blank price cell in the sheet means "unknown",
  -- which is not the same as zero. numeric, not float, because these are money.
  public_price          numeric(12,2),
  public_price_ex_vat   numeric(12,2),
  private_price         numeric(12,2),
  private_price_ex_vat  numeric(12,2),
  vat                   numeric(12,2),

  remark                text not null default '',
  updated_at            timestamptz not null default now()
);

-- The product list filters by category and sorts by sku; this covers both.
create index if not exists pvp_prices_category_sku_idx
  on pvp_prices (category, sku);

-- Case-insensitive substring search over name and sku. Firestore could not do
-- this at all — the UI had to load a category and filter in the browser — so
-- trigram indexes are what let search move to the database.
create extension if not exists pg_trgm;
create index if not exists pvp_prices_name_trgm_idx on pvp_prices using gin (name gin_trgm_ops);
create index if not exists pvp_prices_sku_trgm_idx  on pvp_prices using gin (sku  gin_trgm_ops);

-- ── Access ───────────────────────────────────────────────────────────────────
-- Prices are catalogue data, not personal data: every signed-in employee reads
-- them and nobody edits them by hand. Writes happen only through the CSV
-- importer, which runs server-side with the service-role key and bypasses RLS.
--
-- Reads are granted to `anon` because this app authenticates with Firebase,
-- not Supabase Auth — there is no Supabase JWT to gate on. The app's own login
-- still gates the page; this table simply carries nothing worth hiding. Do NOT
-- copy this policy onto a table holding employee or customer data.
alter table pvp_prices enable row level security;

drop policy if exists "pvp_prices readable" on pvp_prices;
create policy "pvp_prices readable"
  on pvp_prices for select
  using (true);
