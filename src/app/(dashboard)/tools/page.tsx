'use client'

import { useState, useMemo, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'

// ── Tool data ─────────────────────────────────────────────────────────────────

interface SaleTool {
  id: string
  title: string
  description: string
  category: string
  url: string
  imageUrl: string
}

const SALE_TOOLS: SaleTool[] = [
  {
    id: 'res-sa-01',
    title: 'Sale Deck (English)',
    description: 'Presentation deck สำหรับ pitch ลูกค้าภาษาอังกฤษ ครอบคลุมทุกขั้นตอนการขาย',
    category: 'Presentation',
    url: 'https://docs.google.com/presentation/d/1Vxd1UmhvnzMi4RaIZw50qTx2M58V9lt4/edit?slide=id.g206b6a35b6a_0_5#slide=id.g206b6a35b6a_0_5',
    imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-02',
    title: 'Sale Deck (ภาษาไทย)',
    description: 'Presentation deck สำหรับ pitch ลูกค้าภาษาไทย ใช้สำหรับนำเสนอในประเทศ',
    category: 'Presentation',
    url: 'https://docs.google.com/presentation/d/15i6_rCgyRgdsCVrTWYiyuZ3RUFm-Ackv/edit?rtpof=true&sd=true',
    imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-03',
    title: 'ตัวอย่างสินค้า Freshket',
    description: 'Google Drive รวมรูปภาพและไฟล์ตัวอย่างสินค้าสำหรับประกอบการนำเสนอลูกค้า',
    category: 'Product',
    url: 'https://drive.google.com/drive/folders/1qfLY2FtwTs_8VnpMeqolgLW6vT-HRS7H',
    imageUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-04',
    title: 'Mapping Product AI',
    description: 'เครื่องมือ AI สำหรับ mapping สินค้า เปรียบเทียบราคา และวิเคราะห์คู่แข่ง',
    category: 'Product',
    url: 'https://mapping-ai-bice.vercel.app/dashboard',
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-05',
    title: 'Service Area Map',
    description: 'แผนที่พื้นที่ให้บริการของ Freshket บน Google Maps สำหรับวางแผนเยี่ยมลูกค้า',
    category: 'Field',
    url: 'https://www.google.com/maps/d/u/0/viewer?mid=1eYZ7hvHKLw7Kb0jWwSUZPzP_m-3sV2w&ll=13.898219270378311%2C100.77710892140075&z=11',
    imageUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-06',
    title: 'Internal Portal',
    description: 'Freshket Internal Portal เข้าถึงข้อมูลพนักงาน เอกสาร และเครื่องมือภายในองค์กร',
    category: 'Operations',
    url: 'https://portal.freshket.co/',
    imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-07',
    title: 'AppSheet — PVP & Product Request',
    description: 'แอปสำหรับกรอก PVP (Pre-Visit Planning) และขอสินค้าใหม่ผ่าน AppSheet',
    category: 'Operations',
    url: 'https://www.appsheet.com/start/2293f65d-d06e-4b0f-b96d-8d6f10316f63?platform=desktop',
    imageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-08',
    title: 'Sales Dashboard — Datastudio',
    description: 'Dashboard รายงาน KPI ยอดขาย และ performance ทีม Sales แบบ real-time',
    category: 'Report',
    url: 'https://datastudio.google.com/u/0/reporting/eaa8df46-cb41-4fd7-ab57-13e01dd2601c/page/p_7na5yd6y6c?pli=1',
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=75',
  },
]

// ── Merchandise contacts ──────────────────────────────────────────────────────
interface MerchContact {
  id: string
  emoji: string
  category: string
  subLabel: string
  contacts: string[]
  imageUrl: string
  badgeBg: string
  badgeText: string
}

const MERCH_CONTACTS: MerchContact[] = [
  {
    id: 'merch-1',
    emoji: '🥬',
    category: 'ผักและผลไม้',
    subLabel: 'Vegetable & Fruit',
    contacts: ['@Piyatida (Gik) Punsawad', '@Benjawan (Wan) Santiphithak'],
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
  },
  {
    id: 'merch-2',
    emoji: '🥩',
    category: 'เนื้อสัตว์',
    subLabel: 'Pork, Beef, Other',
    contacts: ['@KORAWITH (tode) THIABMAK'],
    imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
  },
  {
    id: 'merch-3',
    emoji: '🍗',
    category: 'สัตว์ปีกและไข่',
    subLabel: 'Chicken, Duck, Egg',
    contacts: ['@KORAWITH (tode) THIABMAK', '@Papitchaya (Garfield) Saenkaew'],
    imageUrl: 'https://images.unsplash.com/photo-1587486913049-53fc88980cfc?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
  },
  {
    id: 'merch-4',
    emoji: '🐟',
    category: 'ปลาและอาหารทะเล',
    subLabel: 'Fish & Seafood',
    contacts: ['@Angkhan (Junior) Lertritphuwadon', '@Napasorn (Memee) Rattanachaidecha'],
    imageUrl: 'https://images.unsplash.com/photo-1534482421-64566f976cfa?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-cyan-100',
    badgeText: 'text-cyan-700',
  },
  {
    id: 'merch-5',
    emoji: '🥫',
    category: 'อาหารแปรรูป',
    subLabel: 'Processed Food',
    contacts: [],
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-700',
  },
  {
    id: 'merch-6',
    emoji: '📦',
    category: 'สินค้าทั่วไป',
    subLabel: 'DG Food',
    contacts: ['@Pavinee (Praew) Srijaroensukpark', '@Praewnapa (Zeegame) Boonyeam'],
    imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
  },
  {
    id: 'merch-7',
    emoji: '🍷',
    category: 'เครื่องดื่ม',
    subLabel: 'Beverage & Liquor',
    contacts: ['@Kie Jitraporn', '@Kavisara (Earngaoey) Manantaphong'],
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-700',
  },
  {
    id: 'merch-8',
    emoji: '🧼',
    category: 'สินค้าอื่นๆ',
    subLabel: 'Non-food',
    contacts: ['@Kie Jitraporn', '@Kavisara (Earngaoey) Manantaphong'],
    imageUrl: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
  },
]

const MERCH_STORAGE_KEY = 'fk_merch_contacts_v1'
const TOOLS_STORAGE_KEY = 'fk_sale_tools_v1'

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_ORDER = ['Presentation', 'Product', 'Field', 'Operations', 'Report']

interface CategoryMeta { label: string; color: string; bg: string; border: string; icon: React.ReactNode }

const CATEGORY_META: Record<string, CategoryMeta> = {
  Presentation: {
    label: 'Sale Deck', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200',
    icon: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>,
  },
  Product: {
    label: 'สินค้า', color: 'text-freshket-700', bg: 'bg-freshket-100', border: 'border-freshket-200',
    icon: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
  },
  Field: {
    label: 'Field', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200',
    icon: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
  },
  Operations: {
    label: 'Operations', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200',
    icon: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  Report: {
    label: 'Report', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200',
    icon: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  },
}

function getCategoryMeta(cat: string): CategoryMeta {
  return CATEGORY_META[cat] ?? {
    label: cat, color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200',
    icon: <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>,
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list'
type Tab = 'tools' | 'merch'

export default function ToolsPage() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  const [activeTab, setActiveTab] = useState<Tab>('tools')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('grid')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [tools, setTools] = useState<SaleTool[]>(() => {
    if (typeof window === 'undefined') return SALE_TOOLS
    try {
      const saved = localStorage.getItem(TOOLS_STORAGE_KEY)
      if (saved) return JSON.parse(saved) as SaleTool[]
    } catch {}
    return SALE_TOOLS
  })
  const [editTarget, setEditTarget] = useState<{ tool: SaleTool; isNew: boolean } | null>(null)

  const saveTool = useCallback((tool: SaleTool, isNew: boolean) => {
    setTools(prev => {
      const next = isNew
        ? [...prev, { ...tool, id: `tool-${Date.now()}` }]
        : prev.map(t => t.id === tool.id ? tool : t)
      try { localStorage.setItem(TOOLS_STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
    setEditTarget(null)
  }, [])

  const [merch, setMerch] = useState<MerchContact[]>(() => {
    if (typeof window === 'undefined') return MERCH_CONTACTS
    try {
      const saved = localStorage.getItem(MERCH_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as MerchContact[]
        return MERCH_CONTACTS.map(def => {
          const saved = parsed.find(p => p.id === def.id)
          return saved ? { ...def, contacts: saved.contacts } : def
        })
      }
    } catch {}
    return MERCH_CONTACTS
  })

  const saveMerchContacts = useCallback((id: string, contacts: string[]) => {
    setMerch(prev => {
      const next = prev.map(m => m.id === id ? { ...m, contacts } : m)
      try { localStorage.setItem(MERCH_STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const copyContact = useCallback((key: string, name: string) => {
    navigator.clipboard.writeText(name).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return tools
    const q = search.toLowerCase()
    return tools.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q),
    )
  }, [search, tools])

  const grouped = useMemo(() => {
    const map = new Map<string, SaleTool[]>()
    for (const t of filtered) {
      if (!map.has(t.category)) map.set(t.category, [])
      map.get(t.category)!.push(t)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
  }, [filtered])

  // Pair categories so each row shows 2 category headers + 4 cards on desktop
  const pairedGroups = useMemo(() => {
    const pairs: Array<Array<[string, SaleTool[]]>> = []
    for (let i = 0; i < grouped.length; i += 2) {
      pairs.push(grouped.slice(i, i + 2) as Array<[string, SaleTool[]]>)
    }
    return pairs
  }, [grouped])

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Sale Tools" subtitle={`${tools.length} เครื่องมือ`} />

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 flex gap-1">
        {([
          { id: 'tools' as Tab, label: 'Sale Tool' },
          { id: 'merch' as Tab, label: 'Merchandise Contact' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3.5 text-sm font-bold border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-freshket-500 text-freshket-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Merchandise Contact tab ── */}
      {activeTab === 'merch' && (
        <div className="flex-1 overflow-auto p-5">
          <p className="text-xs text-gray-400 mb-4">กด copy แล้วค้นหาชื่อใน Slack เพื่อติดต่อทีม Buyer</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {merch.map((item) => (
              <MerchCard
                key={item.id}
                item={item}
                copiedKey={copiedKey}
                onCopy={copyContact}
                isSuperAdmin={isSuperAdmin}
                onSave={saveMerchContacts}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Sale Tool tab ── */}
      {activeTab === 'tools' && (
      <div className="flex-1 overflow-auto p-6">

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="ค้นหาเครื่องมือ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>

          {/* Create button — super admin only */}
          {isSuperAdmin && (
            <button
              onClick={() => setEditTarget({ tool: { id: '', title: '', description: '', category: 'Presentation', url: '', imageUrl: '' }, isNew: true })}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all shrink-0"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              สร้าง Tool
            </button>
          )}

          {/* View toggle */}
          <div className="flex gap-0.5 p-1 bg-gray-100 rounded-xl shrink-0">
            <button
              onClick={() => setView('grid')}
              title="Grid view"
              className={`p-1.5 rounded-lg transition-all ${view === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </button>
            <button
              onClick={() => setView('list')}
              title="List view"
              className={`p-1.5 rounded-lg transition-all ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Empty */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="size-10 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
            <p className="text-sm">ไม่พบเครื่องมือที่ตรงกัน</p>
          </div>
        )}

        {/* Grid view */}
        {view === 'grid' && filtered.length > 0 && (
          <>
            {/* ── Mobile: each category its own row with horizontal scroll ── */}
            <div className="space-y-6 lg:hidden">
              {grouped.map(([category, items]) => {
                const meta = getCategoryMeta(category)
                return (
                  <div key={category} className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${meta.bg} ${meta.color} ${meta.border}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                      <span className="text-xs font-normal text-gray-400 shrink-0">{items.length}</span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                    <div className="overflow-x-auto">
                      <div className="flex gap-3 pb-2 snap-x snap-mandatory">
                        {items.map(tool => (
                          <div key={tool.id} className="w-[44vw] shrink-0 snap-start">
                            <GridCard tool={tool} isSuperAdmin={isSuperAdmin} onEdit={() => setEditTarget({ tool, isNew: false })} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Desktop: paired category headers + 4-col grid ── */}
            <div className="hidden lg:block space-y-8">
              {pairedGroups.map((pair, pairIdx) => {
                const allItems = pair.flatMap(([, items]) => items)
                return (
                  <div key={pairIdx} className="space-y-3">
                    <div className="grid grid-cols-4 gap-3">
                      {pair.map(([category, items]) => {
                        const meta = getCategoryMeta(category)
                        return (
                          <div key={category} className="col-span-2 flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${meta.bg} ${meta.color} ${meta.border}`}>
                              {meta.icon}
                              {meta.label}
                            </span>
                            <span className="text-xs font-normal text-gray-400 shrink-0">{items.length}</span>
                            <div className="flex-1 h-px bg-gray-100" />
                          </div>
                        )
                      })}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {allItems.map(tool => (
                        <GridCard key={tool.id} tool={tool} isSuperAdmin={isSuperAdmin} onEdit={() => setEditTarget({ tool, isNew: false })} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* List view */}
        {view === 'list' && filtered.length > 0 && (
          <div className="space-y-8">
            {grouped.map(([category, items]) => {
              const meta = getCategoryMeta(category)
              return (
                <section key={category}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="text-xs font-normal text-gray-400">{items.length}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((tool) => (
                      <ListRow key={tool.id} tool={tool} isSuperAdmin={isSuperAdmin} onEdit={() => setEditTarget({ tool, isNew: false })} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
      )}

      {/* Tool edit/create modal */}
      {editTarget && (
        <ToolEditModal
          tool={editTarget.tool}
          isNew={editTarget.isNew}
          onSave={saveTool}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}

// ── Merch Card ────────────────────────────────────────────────────────────────
function MerchCard({
  item,
  copiedKey,
  onCopy,
  isSuperAdmin,
  onSave,
}: {
  item: MerchContact
  copiedKey: string | null
  onCopy: (key: string, name: string) => void
  isSuperAdmin: boolean
  onSave: (id: string, contacts: string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])

  const startEdit = () => {
    setDraft([...item.contacts])
    setEditing(true)
  }
  const cancelEdit = () => setEditing(false)
  const handleSave = () => {
    onSave(item.id, draft.map(s => s.trim()).filter(Boolean))
    setEditing(false)
  }
  const updateDraft = (idx: number, val: string) =>
    setDraft(prev => prev.map((s, i) => (i === idx ? val : s)))
  const removeDraft = (idx: number) =>
    setDraft(prev => prev.filter((_, i) => i !== idx))
  const addDraft = () => setDraft(prev => [...prev, ''])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
      {/* Product image */}
      <div className="h-28 sm:h-32 w-full overflow-hidden relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={item.category} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <span className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full ${item.badgeBg} ${item.badgeText}`}>
          {item.emoji} {item.category}
        </span>
        {/* Edit toggle — super admin only */}
        {isSuperAdmin && !editing && (
          <button
            onClick={startEdit}
            title="แก้ไขรายชื่อ"
            className="absolute top-2 right-2 size-6 rounded-lg bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-600 hover:bg-white hover:text-freshket-600 transition-all shadow-sm"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 p-3 gap-2">
        <p className="text-xs text-gray-400 leading-tight">{item.subLabel}</p>

        {editing ? (
          /* ── Edit mode ── */
          <div className="space-y-1.5">
            {draft.map((name, idx) => (
              <div key={idx} className="flex items-center gap-1 min-w-0">
                <input
                  type="text"
                  value={name}
                  onChange={e => updateDraft(idx, e.target.value)}
                  placeholder="@ชื่อ Slack"
                  className="flex-1 min-w-0 text-xs px-2 py-1 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-freshket-300 focus:border-freshket-300"
                  autoFocus={idx === draft.length - 1 && name === ''}
                />
                <button
                  onClick={() => removeDraft(idx)}
                  className="shrink-0 size-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                >
                  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={addDraft}
              className="w-full flex items-center justify-center gap-1 py-1 rounded-lg border border-dashed border-freshket-300 text-freshket-600 text-xs font-bold hover:bg-freshket-50 transition-all"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              เพิ่มรายชื่อ
            </button>
            <div className="flex gap-1.5 pt-0.5">
              <button
                onClick={cancelEdit}
                className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-freshket-500 text-white hover:bg-freshket-600 transition-all"
              >
                บันทึก
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <>
            {item.contacts.length === 0 ? (
              <p className="text-xs text-gray-300 italic">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="space-y-1.5">
                {item.contacts.map((name, idx) => {
                  const key = `${item.id}-${idx}`
                  const copied = copiedKey === key
                  return (
                    <div key={idx} className="flex items-center gap-1.5 min-w-0">
                      <p className="text-xs font-normal text-gray-700 flex-1 min-w-0 truncate leading-tight">{name}</p>
                      <button
                        onClick={() => onCopy(key, name)}
                        title="คัดลอก"
                        className={`shrink-0 flex items-center justify-center size-6 rounded-lg transition-all ${
                          copied
                            ? 'bg-freshket-100 text-freshket-600'
                            : 'bg-gray-100 text-gray-400 hover:bg-freshket-100 hover:text-freshket-600'
                        }`}
                      >
                        {copied ? (
                          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Grid Card ─────────────────────────────────────────────────────────────────
function GridCard({ tool, isSuperAdmin, onEdit }: { tool: SaleTool; isSuperAdmin?: boolean; onEdit?: () => void }) {
  const meta = getCategoryMeta(tool.category)
  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 hover:border-freshket-200 transition-all group"
    >
      {/* Image */}
      <div className="relative w-full h-36 overflow-hidden shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tool.imageUrl} alt={tool.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        {/* Edit button — super admin only */}
        {isSuperAdmin && (
          <button
            onClick={e => { e.preventDefault(); onEdit?.() }}
            title="แก้ไข"
            className="absolute top-2 left-2 size-7 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm text-gray-600 hover:bg-white hover:text-freshket-600 transition-all shadow-sm z-10"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
          </button>
        )}
        {/* External link badge */}
        <span className="absolute top-2 right-2 size-7 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm text-gray-500 group-hover:text-freshket-600 group-hover:bg-white transition-all shadow-sm">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-3.5 gap-1">
        <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
        <p className="text-sm font-bold text-gray-900 leading-snug group-hover:text-freshket-600 transition-colors line-clamp-2">
          {tool.title}
        </p>
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mt-0.5 flex-1">{tool.description}</p>
        {/* Footer */}
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://ivpysunrulnrdykfaezk.supabase.co/storage/v1/object/public/logo-freshket/FRESHKET%20LOGO-01.png"
            className="h-4 w-auto object-contain"
            alt="Freshket"
          />
          <span className="text-xs text-gray-400">Freshket Sales</span>
        </div>
      </div>
    </a>
  )
}

// ── List Row ──────────────────────────────────────────────────────────────────
function ListRow({ tool, isSuperAdmin, onEdit }: { tool: SaleTool; isSuperAdmin?: boolean; onEdit?: () => void }) {
  const meta = getCategoryMeta(tool.category)
  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 hover:border-freshket-200 transition-all group"
    >
      {/* Text — left */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold mb-0.5 ${meta.color}`}>{meta.label}</p>
        <p className="text-sm font-bold text-gray-900 group-hover:text-freshket-600 transition-colors leading-snug line-clamp-2">
          {tool.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 leading-tight line-clamp-2">{tool.description}</p>
      </div>
      {/* Image + edit — right */}
      <div className="relative size-16 rounded-lg overflow-hidden shrink-0 border border-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tool.imageUrl} alt={tool.title} className="w-full h-full object-cover" />
        {isSuperAdmin && (
          <button
            onClick={e => { e.preventDefault(); onEdit?.() }}
            title="แก้ไข"
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity text-white"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
          </button>
        )}
      </div>
    </a>
  )
}

// ── Tool Edit/Create Modal ────────────────────────────────────────────────────
function ToolEditModal({
  tool,
  isNew,
  onSave,
  onClose,
}: {
  tool: SaleTool
  isNew: boolean
  onSave: (tool: SaleTool, isNew: boolean) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<SaleTool>(tool)

  const set = (k: keyof SaleTool, v: string) => setDraft(prev => ({ ...prev, [k]: v }))
  const canSave = draft.title.trim() && draft.url.trim() && draft.category

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">{isNew ? 'สร้าง Tool ใหม่' : 'แก้ไข Tool'}</h2>
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable form */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Image preview */}
          {draft.imageUrl ? (
            <div className="h-36 rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.imageUrl} alt="preview" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="h-36 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
              ใส่ URL รูปภาพเพื่อดูตัวอย่าง
            </div>
          )}

          {/* Image URL */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">URL รูปภาพปก</label>
            <input
              type="url"
              value={draft.imageUrl}
              onChange={e => set('imageUrl', e.target.value)}
              placeholder="https://..."
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              ชื่อ Tool <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={e => set('title', e.target.value)}
              placeholder="ชื่อเครื่องมือ"
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              หมวดหมู่ <span className="text-rose-500">*</span>
            </label>
            <select
              value={draft.category}
              onChange={e => set('category', e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white"
            >
              {CATEGORY_ORDER.map(cat => (
                <option key={cat} value={cat}>{getCategoryMeta(cat).label} ({cat})</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">คำอธิบาย</label>
            <textarea
              value={draft.description}
              onChange={e => set('description', e.target.value)}
              placeholder="อธิบายการใช้งานสั้นๆ"
              rows={3}
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400 resize-none"
            />
          </div>

          {/* URL */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              URL <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              value={draft.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://..."
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => { if (canSave) onSave(draft, isNew) }}
            disabled={!canSave}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isNew ? 'สร้าง Tool' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
