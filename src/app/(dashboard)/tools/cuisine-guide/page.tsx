'use client'

import { useCallback, useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { AdministrationTabs } from '@/components/layout/AdministrationTabs'
import { FreshketToolTabs } from '@/components/layout/FreshketToolTabs'
import { useAuth } from '@/hooks/useAuth'
import { canAccess } from '@/types/user'
import { useCuisineGuides } from '@/hooks/useFirestore'
import { getDemoMode } from '@/lib/demo/demoMode'
import { confirmAction } from '@/lib/ui/alert'
import {
  MOCK_CUISINE_GUIDES, formatBaht,
  type CuisineGuideItem, type CuisineSku,
} from '@/lib/cuisineGuide'

const DEMO_MODE = getDemoMode()

// Cuisine Guide — tells a sale rep which SKUs to lead with when walking into a
// restaurant of a given cuisine. Two-level view: a grid of cuisine cards
// (cover photo + name), click into one for the SKU table (fkt-id / item name /
// price / PVP price). Same CRUD shape as /tools (SaleTool): Firestore-backed,
// super_admin authors, a mock-data fallback with an "import defaults" action
// while the collection is still empty — this ships with placeholder SKU data
// (see lib/cuisineGuide.ts) rather than starting blank, since real SKU data is
// still being gathered.

interface FormState {
  name: string
  description: string
  coverUrl: string
  isPublished: boolean
  skus: CuisineSku[]
}

function emptySku(): CuisineSku {
  return { id: `sku-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fktId: '', itemName: '', price: 0, pvpPrice: 0 }
}

function emptyForm(): FormState {
  return { name: '', description: '', coverUrl: '', isPublished: false, skus: [emptySku()] }
}

export default function CuisineGuidePage() {
  const { user } = useAuth()
  const isAdmin = canAccess(user?.role ?? 'sale', 'super_admin')

  const { data: firestoreGuides, loading } = useCuisineGuides()
  const isSeedFallback = !DEMO_MODE && !loading && firestoreGuides.length === 0
  const allGuides = isSeedFallback ? MOCK_CUISINE_GUIDES : firestoreGuides

  const guides = useMemo(
    () => isAdmin ? allGuides : allGuides.filter((g) => g.isPublished),
    [allGuides, isAdmin],
  )

  // Matches cuisine name or description — the list is 17+ entries already and
  // will only grow, so scrolling to find one by eye stops scaling quickly.
  const [search, setSearch] = useState('')
  const visibleGuides = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return guides
    return guides.filter((g) => g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q))
  }, [guides, search])

  const [viewing, setViewing] = useState<CuisineGuideItem | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<CuisineGuideItem | null>(null)
  const [seeding, setSeeding] = useState(false)

  const saveGuide = useCallback(async (form: FormState, existing?: CuisineGuideItem) => {
    if (DEMO_MODE) return
    const { getClientFirestore, doc, setDoc, collection } = await import('@/lib/firebase/client')
    const { Timestamp } = await import('firebase/firestore')
    const db = getClientFirestore()
    const isNew = !existing
    const id = isNew ? doc(collection(db, 'cuisineGuides')).id : existing.id
    const now = new Date()
    await setDoc(doc(db, 'cuisineGuides', id), {
      name: form.name,
      description: form.description,
      coverUrl: form.coverUrl,
      isPublished: form.isPublished,
      skus: form.skus.filter((s) => s.fktId.trim() || s.itemName.trim()),
      createdAt: Timestamp.fromDate(existing?.createdAt ?? now),
      updatedAt: Timestamp.fromDate(now),
      createdBy: existing?.createdBy ?? user?.uid,
    })
  }, [user?.uid])

  async function handleDelete(id: string) {
    const ok = await confirmAction({
      title: 'ลบ Cuisine Guide นี้?',
      text: 'การลบไม่สามารถย้อนกลับได้',
      confirmText: 'ลบ',
      danger: true,
    })
    if (!ok) return
    if (DEMO_MODE) return
    const { getClientFirestore, doc, deleteDoc } = await import('@/lib/firebase/client')
    await deleteDoc(doc(getClientFirestore(), 'cuisineGuides', id))
  }

  async function handleTogglePublish(item: CuisineGuideItem) {
    if (DEMO_MODE) return
    const { getClientFirestore, doc, setDoc } = await import('@/lib/firebase/client')
    await setDoc(doc(getClientFirestore(), 'cuisineGuides', item.id), { isPublished: !item.isPublished }, { merge: true })
  }

  // Copies the built-in mock cuisines into Firestore so they become real,
  // editable docs — same "import defaults" action /tools uses for SEED_TOOLS.
  const importMockGuides = useCallback(async () => {
    if (DEMO_MODE) return
    setSeeding(true)
    try {
      const { getClientFirestore, doc, writeBatch } = await import('@/lib/firebase/client')
      const { Timestamp } = await import('firebase/firestore')
      const db = getClientFirestore()
      const batch = writeBatch(db)
      MOCK_CUISINE_GUIDES.forEach((g, i) => {
        const { id, ...fields } = g
        batch.set(doc(db, 'cuisineGuides', id), {
          ...fields,
          createdAt: Timestamp.fromDate(new Date(g.createdAt.getTime() + i)),
          updatedAt: Timestamp.fromDate(g.updatedAt),
        })
      })
      await batch.commit()
    } finally {
      setSeeding(false)
    }
  }, [])

  return (
    <>
      <Header
        title="Cuisine Guide"
        subtitle={`คู่มือแนะนำสินค้าตามประเภทร้าน · ${guides.length} ประเภท`}
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors shadow-sm"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              เพิ่ม Cuisine
            </button>
          ) : undefined
        }
      />
      <AdministrationTabs />
      <FreshketToolTabs />

      <div className="flex-1 overflow-auto p-6 space-y-5 animate-float-up">
        {isSeedFallback && isAdmin && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700">
              ยังไม่มีข้อมูลจริงใน Firestore — กำลังแสดงข้อมูลตัวอย่าง (mock) กด "นำเข้าเป็นข้อมูลจริง" เพื่อบันทึกและแก้ไขได้
            </p>
            <button
              type="button"
              onClick={importMockGuides}
              disabled={seeding}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors disabled:opacity-60"
            >
              {seeding ? 'กำลังนำเข้า...' : 'นำเข้าเป็นข้อมูลจริง'}
            </button>
          </div>
        )}

        {guides.length > 0 && (
          <div className="relative max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="ค้นหา Cuisine..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>
        )}

        {guides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="size-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="size-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 8.25h16.5M5.25 4.5h13.5A1.5 1.5 0 0120.25 6v12a1.5 1.5 0 01-1.5 1.5H5.25A1.5 1.5 0 013.75 18V6a1.5 1.5 0 011.5-1.5z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-500">ยังไม่มี Cuisine Guide</p>
            {isAdmin && <p className="text-xs text-gray-400 mt-1">กดปุ่ม "เพิ่ม Cuisine" เพื่อเพิ่มประเภทร้านแรก</p>}
          </div>
        ) : visibleGuides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm font-bold text-gray-500">ไม่พบ Cuisine ที่ตรงกับ "{search}"</p>
            <p className="text-xs text-gray-400 mt-1">ลองค้นหาด้วยคำอื่น</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleGuides.map((g) => (
              <CuisineCard
                key={g.id}
                item={g}
                isAdmin={isAdmin}
                onView={() => setViewing(g)}
                onEdit={() => setEditItem(g)}
                onDelete={() => handleDelete(g.id)}
                onTogglePublish={() => handleTogglePublish(g)}
              />
            ))}
          </div>
        )}
      </div>

      {viewing && <CuisineDetailPanel item={viewing} onClose={() => setViewing(null)} />}
      {showAdd && (
        <CuisineFormModal
          onClose={() => setShowAdd(false)}
          onSave={(form) => { saveGuide(form); setShowAdd(false) }}
          formTitle="เพิ่ม Cuisine Guide ใหม่"
        />
      )}
      {editItem && (
        <CuisineFormModal
          initial={editItem}
          onClose={() => setEditItem(null)}
          onSave={(form) => { saveGuide(form, editItem); setEditItem(null) }}
          formTitle="แก้ไข Cuisine Guide"
        />
      )}
    </>
  )
}

// ── CuisineCard ────────────────────────────────────────────────────────────────

function CuisineCard({
  item, isAdmin, onView, onEdit, onDelete, onTogglePublish,
}: {
  item: CuisineGuideItem
  isAdmin: boolean
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePublish: () => void
}) {
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden flex flex-col hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 ${
      !item.isPublished ? 'border-amber-100' : 'border-gray-100'
    }`}>
      <button type="button" onClick={onView} className="block text-left">
        <div className="relative w-full" style={{ paddingTop: '30%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.coverUrl} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
          {!item.isPublished && (
            <span className="absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
              Draft
            </span>
          )}
          <span className="absolute bottom-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full bg-white/90 text-freshket-700 shadow-sm">
            {item.skus.length} SKU
          </span>
        </div>
      </button>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-sm font-bold text-gray-900 leading-snug mb-1">{item.name}</h3>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 flex-1 mb-3">{item.description}</p>
        <div className="flex items-center justify-between">
          {isAdmin ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title={item.isPublished ? 'Unpublish' : 'Publish'}
                onClick={onTogglePublish}
                className={`size-7 rounded-lg flex items-center justify-center transition-colors ${
                  item.isPublished ? 'text-freshket-500 hover:bg-freshket-50' : 'text-amber-500 hover:bg-amber-50'
                }`}
              >
                <PublishIcon published={item.isPublished} />
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="size-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="size-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-rose-50 hover:text-rose-400 transition-colors"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          ) : <span />}
          <button
            type="button"
            onClick={onView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-xs font-bold transition-colors"
          >
            ดูรายการสินค้า
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CuisineDetailPanel — SKU table (fkt-id / item name / price / PVP price) ───

type SkuSortKey = 'fktId' | 'itemName' | 'price' | 'pvpPrice'

function SkuSortableTh({ label, sortKey, activeSortKey, sortDir, onSort, align = 'left' }: {
  label: string; sortKey: SkuSortKey; activeSortKey: SkuSortKey | null; sortDir: 'asc' | 'desc'
  onSort: (key: SkuSortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === activeSortKey
  return (
    <th
      className={`text-xs font-bold text-gray-500 px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:text-gray-700 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <svg className={`size-3 transition-transform ${active ? 'text-gray-600' : 'text-gray-300'} ${active && sortDir === 'desc' ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
      </span>
    </th>
  )
}

function CuisineDetailPanel({ item, onClose }: { item: CuisineGuideItem; onClose: () => void }) {
  const [sortKey, setSortKey] = useState<SkuSortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: SkuSortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedSkus = useMemo(() => {
    if (!sortKey) return item.skus
    const dir = sortDir === 'asc' ? 1 : -1
    return item.skus.slice().sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'th') * dir
    })
  }, [item.skus, sortKey, sortDir])

  return (
    <>
      <style>{`@keyframes panelSlideIn { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
        <aside
          className="w-full sm:max-w-3xl bg-white shadow-2xl flex flex-col"
          style={{ animation: 'panelSlideIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
        >
          <div className="shrink-0 flex items-center gap-4 px-6 py-4 border-b border-gray-100">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{item.name}</h2>
              {item.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-xl border border-amber-400 bg-amber-400 flex items-center justify-center text-white hover:bg-amber-500 hover:border-amber-500 transition-colors shrink-0"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {item.skus.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีสินค้าในรายการนี้</p>
            ) : (
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <SkuSortableTh label="FKT-ID" sortKey="fktId" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SkuSortableTh label="Item Name" sortKey="itemName" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SkuSortableTh label="Price" sortKey="price" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                      <SkuSortableTh label="PVP Price" sortKey="pvpPrice" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedSkus.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">{s.fktId}</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-800">{s.itemName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums whitespace-nowrap">{formatBaht(s.price)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-freshket-700 text-right tabular-nums whitespace-nowrap">{formatBaht(s.pvpPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}

// ── CuisineFormModal ──────────────────────────────────────────────────────────

function CuisineFormModal({
  initial, onClose, onSave, formTitle,
}: {
  initial?: CuisineGuideItem
  onClose: () => void
  onSave: (form: FormState) => void
  formTitle: string
}) {
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? { name: initial.name, description: initial.description, coverUrl: initial.coverUrl, isPublished: initial.isPublished, skus: initial.skus.length ? initial.skus : [emptySku()] }
      : emptyForm(),
  )
  const [errors, setErrors] = useState<Partial<Record<'name' | 'coverUrl', string>>>({})

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'name' || key === 'coverUrl') setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function setSku(id: string, patch: Partial<CuisineSku>) {
    setForm((prev) => ({ ...prev, skus: prev.skus.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  }

  function addSkuRow() {
    setForm((prev) => ({ ...prev, skus: [...prev.skus, emptySku()] }))
  }

  function removeSkuRow(id: string) {
    setForm((prev) => ({ ...prev, skus: prev.skus.filter((s) => s.id !== id) }))
  }

  function validate(): boolean {
    const e: Partial<Record<'name' | 'coverUrl', string>> = {}
    if (!form.name.trim()) e.name = 'กรุณากรอกชื่อประเภทร้าน'
    if (!form.coverUrl.trim()) e.coverUrl = 'กรุณากรอก URL รูปหน้าปก'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const inputCls = (err?: string) =>
    `w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all ${
      err
        ? 'border-rose-300 bg-rose-50 focus:ring-2 focus:ring-rose-200'
        : 'border-gray-200 bg-white focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100'
    }`

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-pop-in">
        <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{formTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1.5">
              ชื่อประเภทร้าน <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="เช่น อิตาเลียน, ญี่ปุ่น, ไทย"
              className={inputCls(errors.name)}
            />
            {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1.5">คำอธิบาย</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="สรุปลักษณะร้านและสินค้าที่เหมาะจะนำเสนอ"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none resize-none min-h-[70px] leading-relaxed focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1.5">
              URL รูปหน้าปก <span className="text-rose-400">*</span>
            </label>
            <input
              type="url"
              value={form.coverUrl}
              onChange={(e) => set('coverUrl', e.target.value)}
              placeholder="https://..."
              className={inputCls(errors.coverUrl)}
            />
            {errors.coverUrl && <p className="text-xs text-rose-500 mt-1">{errors.coverUrl}</p>}
          </div>

          {/* SKU table editor */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-gray-600">รายการสินค้า (SKU)</label>
              <button type="button" onClick={addSkuRow} className="text-xs text-freshket-600 font-bold hover:underline">
                + เพิ่มแถว
              </button>
            </div>
            <div className="space-y-2">
              {form.skus.map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr_1.5fr_0.8fr_0.8fr_auto] gap-1.5 items-center">
                  <input
                    type="text"
                    value={s.fktId}
                    onChange={(e) => setSku(s.id, { fktId: e.target.value })}
                    placeholder="FKT-ID"
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-mono outline-none focus:border-freshket-400 focus:ring-1 focus:ring-freshket-100"
                  />
                  <input
                    type="text"
                    value={s.itemName}
                    onChange={(e) => setSku(s.id, { itemName: e.target.value })}
                    placeholder="ชื่อสินค้า"
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-freshket-400 focus:ring-1 focus:ring-freshket-100"
                  />
                  <input
                    type="number"
                    min={0}
                    value={s.price || ''}
                    onChange={(e) => setSku(s.id, { price: Number(e.target.value) || 0 })}
                    placeholder="Price"
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-right outline-none focus:border-freshket-400 focus:ring-1 focus:ring-freshket-100"
                  />
                  <input
                    type="number"
                    min={0}
                    value={s.pvpPrice || ''}
                    onChange={(e) => setSku(s.id, { pvpPrice: Number(e.target.value) || 0 })}
                    placeholder="PVP"
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-right outline-none focus:border-freshket-400 focus:ring-1 focus:ring-freshket-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeSkuRow(s.id)}
                    className="size-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-rose-50 hover:text-rose-400 transition-colors"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 pb-1">
            <div>
              <p className="text-sm font-bold text-gray-900">Publish ทันที</p>
              <p className="text-xs text-gray-500 mt-0.5">User จะเห็น Cuisine นี้ทันทีหลัง Save</p>
            </div>
            <button
              type="button"
              onClick={() => set('isPublished', !form.isPublished)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                form.isPublished ? 'bg-freshket-500' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                form.isPublished ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-normal text-gray-600 hover:bg-gray-50 transition-colors">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => { if (validate()) onSave(form) }}
            className="px-5 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors shadow-sm"
          >
            {initial ? 'บันทึกการแก้ไข' : 'เพิ่ม Cuisine'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared icon ────────────────────────────────────────────────────────────────

function PublishIcon({ published }: { published: boolean }) {
  if (published) {
    return (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}
