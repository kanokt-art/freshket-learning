'use client'

import { useState, useEffect, useRef } from 'react'
import {
  fetchPvpPrices,
  fetchPvpCategories,
  fetchPvpCount,
} from '@/lib/supabase/pvpPrices'
import type { PvpPrice } from '@/types/pvpPrice'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

// Product List (Tools → #products), backed by the pvp_prices table in Supabase
// Postgres rather than Firestore — see supabase/migrations/001_pvp_prices.sql.
//
// Filtering, searching and paging all happen in the database. On Firestore
// none of that was possible: reads were metered per document, so the ~20k-row
// catalogue could not be queried without a category chosen up front, the
// category list had to be denormalised into a summary document, and search
// could only scan whatever the browser had already downloaded. Postgres bills
// storage, so a query is just a query.
export function ProductListTab() {
  const [category, setCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  const [categories, setCategories] = useState<string[]>([])
  const [totalRows, setTotalRows] = useState<number | null>(null)
  const [rows, setRows] = useState<PvpPrice[]>([])
  const [matchCount, setMatchCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Typing shouldn't fire a query per keystroke now that search hits the
  // database instead of an in-memory array.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [category, debouncedSearch])

  // Filter options + the total, once.
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchPvpCategories(), fetchPvpCount()])
      .then(([cats, total]) => {
        if (cancelled) return
        setCategories(cats)
        setTotalRows(total)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])

  // Results. A request counter drops responses that arrive out of order, so a
  // slow early query can't overwrite a newer one.
  const reqRef = useRef(0)
  useEffect(() => {
    const req = ++reqRef.current
    setLoading(true)
    fetchPvpPrices({ category: category || null, search: debouncedSearch || null, page, pageSize: PAGE_SIZE })
      .then(({ rows: r, total }) => {
        if (req !== reqRef.current) return
        setRows(r)
        setMatchCount(total)
        setError(null)
      })
      .catch((e) => {
        if (req !== reqRef.current) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (req === reqRef.current) setLoading(false) })
  }, [category, debouncedSearch, page])

  const totalPages = Math.max(1, Math.ceil(matchCount / PAGE_SIZE))

  return (
    <div className="flex-1 overflow-auto p-5">
      {/* ── Category + search ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`pl-9 pr-8 py-2.5 text-sm rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 appearance-none cursor-pointer transition-all ${
              category ? 'border-freshket-300 text-freshket-700 font-bold' : 'border-gray-200 text-gray-700'
            }`}
          >
            <option value="">ทุกหมวด</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </span>
        </div>

        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="ค้นหาจากรหัสสินค้า หรือชื่อสินค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          โหลดรายการสินค้าไม่สำเร็จ — {error}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="size-6 border-2 border-gray-200 border-t-freshket-500 rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch || category ? 'ไม่พบสินค้าที่ตรงกัน'
            : 'ยังไม่มีข้อมูลสินค้า'
          }
          detail={
            debouncedSearch || category ? 'ลองค้นหาด้วยคำอื่น หรือเปลี่ยนหมวด'
            : 'ผู้ดูแลระบบนำเข้าได้จากหน้า นำเข้าราคาสินค้า (PVP)'
          }
        />
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            พบ <span className="font-bold text-gray-800">{matchCount.toLocaleString()}</span> รายการ
            {category && <> · หมวด <span className="font-bold text-freshket-700">{category}</span></>}
            {debouncedSearch && <> จากการค้นหา &ldquo;{debouncedSearch}&rdquo;</>}
            {!category && !debouncedSearch && totalRows !== null && <> (ทั้งหมด)</>}
          </p>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
            {rows.map((p) => <ProductRow key={p.id} product={p} />)}
          </div>

          {matchCount > PAGE_SIZE && (
            <div className="flex items-center justify-between px-1 mt-4">
              <p className="text-xs text-gray-400">
                แสดง {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, matchCount).toLocaleString()} จาก {matchCount.toLocaleString()} รายการ
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:border-freshket-400 hover:text-freshket-600 disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600 transition-colors"
                >
                  ก่อนหน้า
                </button>
                <span className="text-xs text-gray-500 tabular-nums">หน้า {page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:border-freshket-400 hover:text-freshket-600 disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600 transition-colors"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ProductRow({ product: p }: { product: PvpPrice }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 tabular-nums shrink-0">{p.sku}</span>
          {p.packSize && <span className="text-xs text-gray-400 truncate">· {p.packSize}</span>}
        </div>
        <p className="text-sm text-gray-900 truncate mt-0.5">{p.name || '(ไม่มีชื่อ)'}</p>
        {p.remark && <p className="text-xs text-gray-400 truncate mt-0.5">{p.remark}</p>}
      </div>

      <div className="shrink-0 text-right">
        <Price label="Public" value={p.publicPrice} />
        <Price label="Private" value={p.privatePrice} muted />
      </div>
    </div>
  )
}

// A blank cell in the sheet means the price is unknown, not zero — shown as a
// dash so it reads differently from a genuine 0.
function Price({ label, value, muted }: { label: string; value: number | null; muted?: boolean }) {
  return (
    <p className={`text-xs tabular-nums ${muted ? 'text-gray-400' : 'text-gray-700 font-bold'}`}>
      <span className="text-gray-400 font-normal mr-1.5">{label}</span>
      {value === null ? '—' : value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </p>
  )
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg className="size-10 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
      <p className="text-sm">{title}</p>
      {detail && <p className="text-xs text-gray-400 mt-1 text-center max-w-xs">{detail}</p>}
    </div>
  )
}
