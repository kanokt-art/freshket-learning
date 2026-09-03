'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { AdministrationTabs } from '@/components/layout/AdministrationTabs'
import { FreshketToolTabs } from '@/components/layout/FreshketToolTabs'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useTools, useDepartments, useKnowledgeDecks, DEFAULT_KNOWLEDGE_DECKS, type KnowledgeDeck } from '@/hooks/useFirestore'
import { getDemoMode, FRESHKET_LOGO_URL } from '@/lib/demo/demoMode'
import { SEED_TOOLS, isToolVisibleTo, type SaleTool } from '@/lib/tools'
import { markToolSeen } from '@/hooks/useUnseenTools'
import { CoverImagePicker } from '@/components/features/CoverImagePicker'
import { COURSE_IMAGE_CATALOG } from '@/lib/utils/mockData'
import { confirmAction } from '@/lib/ui/alert'

const DEMO_MODE = getDemoMode()

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
    id: 'veg-fruit',
    emoji: '🥦',
    category: 'Vegetable & Fruits',
    subLabel: '',
    contacts: ['Piyatida (Gik)', 'Benjawan (Wan)'],
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
  },
  {
    id: 'meat-eggs',
    emoji: '🥩',
    category: 'Meat & Eggs',
    subLabel: '',
    contacts: ['Korawith (Tode)', 'Papitchaya (Garfield)', 'Chalita (Punchy)'],
    imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
  },
  {
    id: 'fish-seafood',
    emoji: '🐟',
    category: 'Fish & Seafood',
    subLabel: '',
    contacts: ['Angkhan (Junior)', 'Napasorn (Memee)'],
    imageUrl: 'https://images.unsplash.com/photo-1534482421-64566f976cfa?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-cyan-100',
    badgeText: 'text-cyan-700',
  },
  {
    id: 'processed-food',
    emoji: '🥫',
    category: 'Processed Food',
    subLabel: '',
    contacts: ['Chatthananan (Yam)', 'Chadaporn (Praew)', 'Chanya (Tong)'],
    imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-700',
  },
  {
    id: 'dry-grocery',
    emoji: '📦',
    category: 'Dry grocery',
    subLabel: '',
    contacts: ['Pavinee (Praew)', 'Praewnapa (Zeegame)'],
    imageUrl: 'https://images.unsplash.com/photo-1593113630400-ea4288922497?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
  },
  {
    id: 'nonfood-bev',
    emoji: '🧴',
    category: 'Non food & beverage',
    subLabel: '',
    contacts: ['Jitraporn (Kie)', 'Kavisara (Earngoey)'],
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-700',
  },
  {
    id: 'md-coordinator',
    emoji: '📋',
    category: 'Merchandising Coordinator',
    subLabel: '',
    contacts: ['Pailin (Mook)'],
    imageUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-700',
  },
  {
    id: 'pricing',
    emoji: '💰',
    category: 'Pricing',
    subLabel: '',
    contacts: ['Saharat (Bright)', 'Thanaphoom (Tiger)', 'Sittha (Film)'],
    imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=75',
    badgeBg: 'bg-yellow-100',
    badgeText: 'text-yellow-700',
  },
]

// v2: bumped so the previous localStorage edits (old merged categories / ids)
// don't override the new taxonomy above.
const MERCH_STORAGE_KEY = 'fk_merch_contacts_v2'

// ── Q&A: "ติดต่อทีมไหน / ห้อง Slack ไหน" ───────────────────────────────────────
// Static reference the sale team asks about constantly — which Slack channel to
// open a card in / tag for each kind of request. Grouped by topic so it reads
// top-to-bottom; each item carries the channel to copy (paste into Slack search).
interface QAItem {
  q: string        // the situation / คำถามที่พบบ่อย
  channel: string  // Slack channel name (without the leading #)
  note?: string    // extra instruction, e.g. out-of-hours fallback
  link?: string    // optional reference link (e.g. pre-order blog)
}

interface QAGroup {
  id: string
  emoji: string
  title: string
  color: string   // pill text colour for the group heading
  bg: string      // pill bg colour for the group heading
  items: QAItem[]
}

const QA_GROUPS: QAGroup[] = [
  {
    id: 'logistics',
    emoji: '🚚',
    title: 'การขนส่ง & โลจิสติกส์',
    color: 'text-orange-700',
    bg: 'bg-orange-100',
    items: [
      { q: 'สอบถามการขนส่งในวัน (ก่อนส่ง) — จะถึงร้านกี่โมง, ใกล้ถึงยัง, อีกกี่นาทีถึง, มีตามส่งไหม', channel: 'operation-workflow' },
      { q: 'พื้นที่จัดส่ง — ทั้งในและนอกเขตพื้นที่ให้บริการ', channel: 'chat-logistics-plan' },
      { q: 'ขอกำหนดเวลาส่งใน slot time', channel: 'chat-logistics' },
    ],
  },
  {
    id: 'product',
    emoji: '🥦',
    title: 'สินค้า & สต็อก',
    color: 'text-freshket-700',
    bg: 'bg-freshket-100',
    items: [
      { q: 'สเปกสินค้า (ก่อนส่ง) — เปิดการ์ด', channel: 'chat-supply-qc' },
      { q: 'Advance order — เปิดการ์ด', channel: 'chat-supply-repln' },
      { q: 'คุณภาพสินค้า / เคลม / ถามสเปกสินค้า', channel: 'chat-cs' },
      { q: 'ถามสต็อกสินค้า / แพลนเข้า', channel: 'roger-supply-repln-bot' },
    ],
  },
  {
    id: 'order',
    emoji: '📝',
    title: 'ออเดอร์ & CO',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    items: [
      { q: 'เปิด CO เพิ่ม/ลด — เปิด CO สินค้าได้ตั้งแต่ 10.30–01.30 น. เปิดการ์ด', channel: 'chat-aa', note: 'นอกเวลานี้ แท็ก @csangel ใต้เทรดได้เลย' },
      { q: 'จองแซลมอน (Salmon pre-order)', channel: 'salmon-order', link: 'https://freshket.co/blog/salmon-preorder/?utm_source=line&utm_medium=paid&utm_campaign=2508-5_salmon-norway-line-bc' },
    ],
  },
  {
    id: 'finance',
    emoji: '💰',
    title: 'การเงิน & เอกสาร',
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    items: [
      { q: 'เรื่องเงินๆ ทองๆ — ยอดค้าง, วางบิล, เปิดระบบ, ปรับชำระ เปิดการ์ด', channel: 'chat-accounting' },
      { q: 'ขอราคา PVP', channel: 'chat-existing-bigvolume' },
    ],
  },
  {
    id: 'customer',
    emoji: '👤',
    title: 'ลูกค้า & บัญชี',
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    items: [
      { q: 'สถานะการยืนยันตัวตน (KYC)', channel: 'chat-kyc' },
      { q: 'แก้ไขข้อมูล/ที่อยู่ลูกค้า (ก่อนลูกค้าออเดอร์), ผูก parent, ขอ Not use', channel: 'chat-com-ops' },
    ],
  },
  {
    id: 'tech',
    emoji: '🛠️',
    title: 'ระบบ & เทคนิค',
    color: 'text-indigo-700',
    bg: 'bg-indigo-100',
    items: [
      { q: 'แจ้งปัญหา technical issue — web/app, intranet, portal เปิดการ์ด', channel: 'chat-tech-product' },
    ],
  },
]

// Department knowledge decks are Firestore-backed (useKnowledgeDecks) so a
// super_admin can add/edit them for the whole team. DEFAULT_KNOWLEDGE_DECKS is
// the read-only fallback shown until the admin imports the built-in decks.

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
type Tab = 'tools' | 'merch' | 'qa'

export default function ToolsPage() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user?.role, user?.department)

  // Sale Tool vs Merchandise Contact is driven by the #merch hash so it can be a
  // tab in the top FreshketToolTabs / AdministrationTabs bar (no duplicate bar).
  const [activeTab, setActiveTab] = useState<Tab>('tools')
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash
      setActiveTab(h === '#merch' ? 'merch' : h === '#qa' ? 'qa' : 'tools')
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  // Warm the Merchandise Contact images in the background while the user is on
  // the Tools tab, so switching to that tab shows them from cache instantly
  // instead of fetching 8 remote images on the spot.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const imgs = MERCH_CONTACTS.map((m) => {
      const img = new window.Image()
      img.decoding = 'async'
      img.src = m.imageUrl
      return img
    })
    return () => { imgs.forEach((img) => { img.src = '' }) }
  }, [])
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('grid')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [qaSearch, setQaSearch] = useState('')
  const [qaSubTab, setQaSubTab] = useState<'faq' | 'knowledge'>('faq')

  // Tools come from Firestore so a publish by super_admin is visible to everyone.
  // While the collection is still empty we display SEED_TOOLS read-only and offer
  // the admin a one-click import that writes them in for real.
  const { data: firestoreTools, loading: toolsLoading } = useTools()
  // useDepartments() has no departments collection behind it — it subscribes to the
  // ENTIRE users collection and derives the distinct department names from it. So an
  // ungated call here streamed every employee doc (all fields: email, employeeId,
  // startDate, lineManager…) on every visit to /tools, purely to fill the department
  // checkbox list inside ToolEditModal — which only a super_admin can open, and which
  // is closed by default. Gated to super_admin so learners never pay for it.
  const { data: departmentDocs } = useDepartments(isSuperAdmin)

  // Department knowledge decks — Firestore-backed, super_admin editable. Until the
  // collection is seeded we show DEFAULT_KNOWLEDGE_DECKS read-only (import to edit).
  const { data: firestoreDecks, loading: decksLoading } = useKnowledgeDecks()
  const isDeckSeedFallback = !DEMO_MODE && !decksLoading && firestoreDecks.length === 0
  const decks = isDeckSeedFallback ? DEFAULT_KNOWLEDGE_DECKS : firestoreDecks
  const [deckEditTarget, setDeckEditTarget] = useState<{ deck: KnowledgeDeck; isNew: boolean } | null>(null)
  const [deckSeeding, setDeckSeeding] = useState(false)

  const saveDeck = useCallback(async (deck: KnowledgeDeck, isNew: boolean) => {
    setDeckEditTarget(null)
    if (DEMO_MODE) return
    const { getClientFirestore, doc, setDoc, collection } = await import('@/lib/firebase/client')
    const db = getClientFirestore()
    const id = isNew ? doc(collection(db, 'knowledgeDecks')).id : deck.id
    const { id: _omit, ...fields } = deck
    await setDoc(doc(db, 'knowledgeDecks', id), {
      ...fields,
      createdAt: deck.createdAt ?? new Date(),
    }, { merge: true })
  }, [])

  const deleteDeck = useCallback(async (id: string) => {
    if (DEMO_MODE) return
    const okDeck = await confirmAction({ title: 'ลบสไลด์นี้?', text: 'การลบไม่สามารถย้อนกลับได้', confirmText: 'ลบ', danger: true })
    if (!okDeck) return
    const { getClientFirestore, doc, deleteDoc } = await import('@/lib/firebase/client')
    await deleteDoc(doc(getClientFirestore(), 'knowledgeDecks', id))
  }, [])

  // Copy the built-in default decks into Firestore so they become editable docs.
  const importSeedDecks = useCallback(async () => {
    if (DEMO_MODE) return
    setDeckSeeding(true)
    try {
      const { getClientFirestore, doc, writeBatch } = await import('@/lib/firebase/client')
      const db = getClientFirestore()
      const batch = writeBatch(db)
      DEFAULT_KNOWLEDGE_DECKS.forEach((d, i) => {
        const { id, ...fields } = d
        batch.set(doc(db, 'knowledgeDecks', id), { ...fields, createdAt: new Date(Date.now() + i) })
      })
      await batch.commit()
    } finally {
      setDeckSeeding(false)
    }
  }, [])
  const allDepartments = useMemo(() => departmentDocs.map(d => d.name).sort(), [departmentDocs])

  const isSeedFallback = !DEMO_MODE && !toolsLoading && firestoreTools.length === 0
  const allTools = isSeedFallback ? SEED_TOOLS : firestoreTools

  // super_admin authors the list, so they see drafts and every department's tools.
  const tools = useMemo(
    () => isSuperAdmin ? allTools : allTools.filter(t => isToolVisibleTo(t, user?.department)),
    [allTools, isSuperAdmin, user?.department],
  )

  const [editTarget, setEditTarget] = useState<{ tool: SaleTool; isNew: boolean } | null>(null)
  const [seeding, setSeeding] = useState(false)

  const saveTool = useCallback(async (tool: SaleTool, isNew: boolean) => {
    setEditTarget(null)
    if (DEMO_MODE) return
    const { getClientFirestore, doc, setDoc, collection } = await import('@/lib/firebase/client')
    const db = getClientFirestore()
    const id = isNew ? doc(collection(db, 'tools')).id : tool.id
    const { id: _omit, ...fields } = tool
    await setDoc(doc(db, 'tools', id), {
      ...fields,
      createdAt: tool.createdAt ?? new Date(),
    }, { merge: true })
  }, [])

  const deleteTool = useCallback(async (id: string) => {
    if (DEMO_MODE) return
    const okTool = await confirmAction({ title: 'ลบ Tool นี้?', text: 'การลบไม่สามารถย้อนกลับได้', confirmText: 'ลบ', danger: true })
    if (!okTool) return
    const { getClientFirestore, doc, deleteDoc } = await import('@/lib/firebase/client')
    await deleteDoc(doc(getClientFirestore(), 'tools', id))
  }, [])

  const togglePublish = useCallback(async (tool: SaleTool) => {
    if (DEMO_MODE) return
    const { getClientFirestore, doc, setDoc } = await import('@/lib/firebase/client')
    await setDoc(doc(getClientFirestore(), 'tools', tool.id), { isPublished: !tool.isPublished }, { merge: true })
  }, [])

  // Copy the built-in defaults into Firestore so they become real, editable docs.
  const importSeedTools = useCallback(async () => {
    if (DEMO_MODE) return
    setSeeding(true)
    try {
      const { getClientFirestore, doc, writeBatch } = await import('@/lib/firebase/client')
      const db = getClientFirestore()
      const batch = writeBatch(db)
      SEED_TOOLS.forEach((t, i) => {
        const { id, ...fields } = t
        batch.set(doc(db, 'tools', id), { ...fields, createdAt: new Date(Date.now() + i) })
      })
      await batch.commit()
    } finally {
      setSeeding(false)
    }
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

  // Q&A filtered by the topic/channel search — keeps a group only if some item matches.
  const qaFiltered = useMemo(() => {
    const q = qaSearch.trim().toLowerCase()
    if (!q) return QA_GROUPS
    return QA_GROUPS
      .map(g => ({
        ...g,
        items: g.items.filter(it =>
          it.q.toLowerCase().includes(q) ||
          it.channel.toLowerCase().includes(q) ||
          (it.note?.toLowerCase().includes(q) ?? false) ||
          g.title.toLowerCase().includes(q),
        ),
      }))
      .filter(g => g.items.length > 0)
  }, [qaSearch])

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

  if (!user) return null

  if (moduleLoading) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!allowedModules.has('sale_tools')) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center max-w-xs">
            <div className="size-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="size-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">Module ไม่ได้เปิดใช้งาน</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Tools ยังไม่ได้เปิดสำหรับแผนกของคุณ<br />กรุณาติดต่อ Admin
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Tools" subtitle={`${tools.length} เครื่องมือ`} />
      <AdministrationTabs />
      <FreshketToolTabs />

      {/* Sale Tool / Merchandise Contact live in the top tab bar (#merch hash) */}

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

      {/* ── Q&A tab ── */}
      {activeTab === 'qa' && (
        <div className="flex-1 overflow-auto p-5">
          <div>
            {/* Sub-tab switch — คำถามที่พบบ่อย / ความรู้แผนก */}
            <div className="inline-flex gap-0.5 p-1 bg-gray-100 rounded-xl mb-5">
              <button
                onClick={() => setQaSubTab('faq')}
                className={`px-3.5 py-1.5 text-sm font-bold rounded-lg transition-all ${
                  qaSubTab === 'faq' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                คำถามที่พบบ่อย
              </button>
              <button
                onClick={() => setQaSubTab('knowledge')}
                className={`px-3.5 py-1.5 text-sm font-bold rounded-lg transition-all ${
                  qaSubTab === 'knowledge' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ความรู้แผนก
              </button>
            </div>

            {/* ── คำถามที่พบบ่อย (FAQ / Slack channels) ── */}
            {qaSubTab === 'faq' && (
            <>
            {/* Intro */}
            <div className="mb-5">
              <h2 className="text-base font-bold text-gray-900">คำถามที่พบบ่อย — ติดต่อทีมไหน / ห้อง Slack ไหน</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                กด <span className="font-bold text-freshket-600">คัดลอกชื่อห้อง</span> แล้ววางค้นหาใน Slack เพื่อเปิดการ์ด/แท็กทีมที่เกี่ยวข้อง
              </p>
            </div>

            {/* Search */}
            <div className="relative max-w-sm mb-5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="ค้นหาคำถาม หรือชื่อห้อง..."
                value={qaSearch}
                onChange={e => setQaSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
              />
            </div>

            {/* Empty */}
            {qaFiltered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="size-10 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
                </svg>
                <p className="text-sm">ไม่พบคำถามที่ตรงกัน</p>
              </div>
            )}

            {/* Groups */}
            <div className="space-y-6">
              {qaFiltered.map(group => (
                <section key={group.id}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${group.bg} ${group.color}`}>
                      <span>{group.emoji}</span>
                      {group.title}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
                    {group.items.map((item, idx) => {
                      const key = `qa-${group.id}-${idx}`
                      const copied = copiedKey === key
                      return (
                        <div key={key} className="flex items-start gap-3 p-3.5 sm:p-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-normal text-gray-700 leading-relaxed">{item.q}</p>
                            {item.note && (
                              <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                                <svg className="size-3.5 shrink-0 mt-px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                                {item.note}
                              </p>
                            )}
                            {item.link && (
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-freshket-600 hover:text-freshket-700 mt-1.5"
                              >
                                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                                รายละเอียด/ลิงก์
                              </a>
                            )}
                          </div>
                          <button
                            onClick={() => copyContact(key, `#${item.channel}`)}
                            title="คัดลอกชื่อห้อง"
                            className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all max-w-[46%] ${
                              copied
                                ? 'bg-freshket-100 text-freshket-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-freshket-100 hover:text-freshket-700'
                            }`}
                          >
                            {copied ? (
                              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            ) : (
                              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                              </svg>
                            )}
                            <span className="truncate">{copied ? 'คัดลอกแล้ว' : `#${item.channel}`}</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>

            </>
            )}

            {/* ── ความรู้แผนก (department knowledge decks) ── */}
            {qaSubTab === 'knowledge' && (
              <>
                <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">ความรู้แผนก</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      สไลด์แนะนำงานของแต่ละแผนก — เปิดเพื่อทำความเข้าใจการทำงานร่วมกัน
                    </p>
                  </div>
                  {/* Add — super admin only. Disabled while decks are still the
                      read-only seed fallback (import first, then add). */}
                  {isSuperAdmin && !isDeckSeedFallback && (
                    <button
                      onClick={() => setDeckEditTarget({ deck: { id: '', title: '', subtitle: '', url: '' }, isNew: true })}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all shrink-0"
                    >
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      เพิ่มความรู้
                    </button>
                  )}
                </div>

                {/* Seed fallback — decks collection empty, defaults are display-only
                    until an admin imports them into Firestore. */}
                {isDeckSeedFallback && isSuperAdmin && (
                  <div className="card-ds p-4 mb-5 flex items-center gap-4 flex-wrap">
                    <div className="flex-1 min-w-[240px]">
                      <p className="text-sm font-bold text-gray-900 mb-0.5">ความรู้แผนกเหล่านี้ยังไม่ได้บันทึกลงระบบ</p>
                      <p className="text-sm font-normal text-gray-500">
                        ตอนนี้เป็นรายการตั้งต้นที่ฝังมากับโค้ด — นำเข้าก่อน จึงจะเพิ่ม แก้ไข หรือลบได้
                      </p>
                    </div>
                    <button
                      onClick={importSeedDecks}
                      disabled={deckSeeding}
                      className="px-4 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {deckSeeding ? 'กำลังนำเข้า...' : 'นำเข้ารายการเริ่มต้น'}
                    </button>
                  </div>
                )}

                {decks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <svg className="size-10 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                    <p className="text-sm">ยังไม่มีความรู้แผนก</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {decks.map(deck => (
                      <div key={deck.id} className="relative group">
                        <a
                          href={deck.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 hover:border-freshket-200 transition-all"
                        >
                          <div className="size-10 rounded-xl bg-freshket-100 flex items-center justify-center shrink-0 text-freshket-700">
                            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 group-hover:text-freshket-600 transition-colors leading-snug">{deck.title}</p>
                            {deck.subtitle && <p className="text-xs text-gray-400 mt-0.5">{deck.subtitle}</p>}
                          </div>
                          <svg className="size-4 text-gray-300 group-hover:text-freshket-600 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                        {/* Author controls — super admin only, once decks are real docs */}
                        {isSuperAdmin && !isDeckSeedFallback && (
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setDeckEditTarget({ deck, isNew: false })}
                              title="แก้ไข"
                              className="size-7 flex items-center justify-center rounded-lg bg-white/90 backdrop-blur-sm text-gray-600 hover:bg-white hover:text-freshket-600 transition-all shadow-sm"
                            >
                              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteDeck(deck.id)}
                              title="ลบ"
                              className="size-7 flex items-center justify-center rounded-lg bg-white/90 backdrop-blur-sm text-gray-400 hover:bg-white hover:text-rose-500 transition-all shadow-sm"
                            >
                              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Sale Tool tab ── */}
      {activeTab === 'tools' && (
      <div className="flex-1 overflow-auto p-6">

        {/* Seed fallback — the tools collection is empty, so these defaults are
            display-only until an admin imports them into Firestore. */}
        {isSeedFallback && isSuperAdmin && (
          <div className="card-ds p-4 mb-5 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <p className="text-sm font-bold text-gray-900 mb-0.5">Tool เหล่านี้ยังไม่ได้บันทึกลงระบบ</p>
              <p className="text-sm font-normal text-gray-500">
                ตอนนี้เป็นรายการตั้งต้นที่ฝังมากับโค้ด — นำเข้าก่อน จึงจะแก้ไข ตั้ง Publish และเลือกแผนกที่มองเห็นได้
              </p>
            </div>
            <button
              onClick={importSeedTools}
              disabled={seeding}
              className="px-4 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {seeding ? 'กำลังนำเข้า...' : 'นำเข้า Tool เริ่มต้น'}
            </button>
          </div>
        )}

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
              onClick={() => setEditTarget({ tool: { id: '', title: '', description: '', category: 'Presentation', url: '', imageUrl: '', isPublished: false, departments: [] }, isNew: true })}
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
                            <GridCard
                              tool={tool}
                              isSuperAdmin={isSuperAdmin}
                              onEdit={() => setEditTarget({ tool, isNew: false })}
                              onTogglePublish={isSeedFallback ? undefined : () => togglePublish(tool)}
                              onDelete={isSeedFallback ? undefined : () => deleteTool(tool.id)}
                              onOpen={() => user && markToolSeen(tool.id, user.uid)}
                            />
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
                        <GridCard
                          key={tool.id}
                          tool={tool}
                          isSuperAdmin={isSuperAdmin}
                          onEdit={() => setEditTarget({ tool, isNew: false })}
                          onTogglePublish={isSeedFallback ? undefined : () => togglePublish(tool)}
                          onDelete={isSeedFallback ? undefined : () => deleteTool(tool.id)}
                          onOpen={() => user && markToolSeen(tool.id, user.uid)}
                        />
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
                      <ListRow key={tool.id} tool={tool} isSuperAdmin={isSuperAdmin} onEdit={() => setEditTarget({ tool, isNew: false })} onOpen={() => user && markToolSeen(tool.id, user.uid)} />
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
          allDepartments={allDepartments}
          onSave={saveTool}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Knowledge deck edit/create modal */}
      {deckEditTarget && (
        <DeckEditModal
          deck={deckEditTarget.deck}
          isNew={deckEditTarget.isNew}
          onSave={saveDeck}
          onClose={() => setDeckEditTarget(null)}
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
        <img src={item.imageUrl} alt={item.category} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
        {item.subLabel && <p className="text-xs text-gray-400 leading-tight">{item.subLabel}</p>}

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
function GridCard({ tool, isSuperAdmin, onEdit, onTogglePublish, onDelete, onOpen }: {
  tool: SaleTool
  isSuperAdmin?: boolean
  onEdit?: () => void
  onTogglePublish?: () => void
  onDelete?: () => void
  onOpen?: () => void
}) {
  const meta = getCategoryMeta(tool.category)
  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className={`bg-white rounded-2xl border overflow-hidden flex flex-col hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 hover:border-freshket-200 transition-all group ${
        isSuperAdmin && !tool.isPublished ? 'border-amber-100' : 'border-gray-100'
      }`}
    >
      {/* Image */}
      <div className="relative w-full h-36 overflow-hidden shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tool.imageUrl} alt={tool.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        {/* Author controls — super admin only */}
        {isSuperAdmin && (
          <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
            <button
              onClick={e => { e.preventDefault(); onEdit?.() }}
              title="แก้ไข"
              className="size-7 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm text-gray-600 hover:bg-white hover:text-freshket-600 transition-all shadow-sm"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
            </button>
            {onTogglePublish && (
              <button
                onClick={e => { e.preventDefault(); onTogglePublish() }}
                title={tool.isPublished ? 'Unpublish' : 'Publish'}
                className={`size-7 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm hover:bg-white transition-all shadow-sm ${
                  tool.isPublished ? 'text-freshket-600' : 'text-amber-500'
                }`}
              >
                {tool.isPublished ? (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                )}
              </button>
            )}
            {onDelete && (
              <button
                onClick={e => { e.preventDefault(); onDelete() }}
                title="ลบ"
                className="size-7 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm text-gray-400 hover:bg-white hover:text-rose-500 transition-all shadow-sm"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            )}
          </div>
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

        {/* Audience — admin only: who actually sees this tool */}
        {isSuperAdmin && (
          <div className="flex items-center gap-1 flex-wrap mt-2">
            {!tool.isPublished && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Draft</span>
            )}
            {tool.departments.length === 0 ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">ทุกแผนก</span>
            ) : (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">
                {tool.departments.length === 1 ? tool.departments[0] : `${tool.departments.length} แผนก`}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FRESHKET_LOGO_URL}
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
function ListRow({ tool, isSuperAdmin, onEdit, onOpen }: { tool: SaleTool; isSuperAdmin?: boolean; onEdit?: () => void; onOpen?: () => void }) {
  const meta = getCategoryMeta(tool.category)
  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 hover:border-freshket-200 transition-all group"
    >
      {/* Text — left */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
          {isSuperAdmin && !tool.isPublished && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Draft</span>
          )}
          {isSuperAdmin && tool.departments.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">
              {tool.departments.length === 1 ? tool.departments[0] : `${tool.departments.length} แผนก`}
            </span>
          )}
        </div>
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
  allDepartments,
  onSave,
  onClose,
}: {
  tool: SaleTool
  isNew: boolean
  allDepartments: string[]
  onSave: (tool: SaleTool, isNew: boolean) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<SaleTool>(tool)

  const set = (k: keyof SaleTool, v: string) => setDraft(prev => ({ ...prev, [k]: v }))
  const canSave = draft.title.trim() && draft.url.trim() && draft.category

  const toggleDepartment = (dept: string) =>
    setDraft(prev => ({
      ...prev,
      departments: prev.departments.includes(dept)
        ? prev.departments.filter(d => d !== dept)
        : [...prev.departments, dept],
    }))

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
          {/* Cover image */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">ภาพปก</label>
            <CoverImagePicker
              value={draft.imageUrl} onChange={(url) => set('imageUrl', url)}
              title={draft.title} description={draft.description} entityId={isNew ? undefined : draft.id}
              catalog={COURSE_IMAGE_CATALOG} uploadEndpoint="/api/upload/tool-image" uploadIdField="toolId"
              aspect={2 / 1}
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

          {/* Departments — who can see this tool. Empty = everyone. */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">แผนกที่มองเห็น</label>
            <p className="text-sm font-normal text-gray-500 mb-2">
              ไม่เลือกแผนกใดเลย = ทุกแผนกเห็น (ที่เปิด module Tools ไว้)
            </p>
            {allDepartments.length === 0 ? (
              <p className="text-sm font-normal text-gray-400">ยังไม่มีข้อมูลแผนกในระบบ</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allDepartments.map(dept => {
                  const on = draft.departments.includes(dept)
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => toggleDepartment(dept)}
                      className={`text-sm font-bold px-3 py-1.5 rounded-full transition-all duration-150 ${
                        on
                          ? 'bg-freshket-100 text-freshket-700'
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {dept}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Publish */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-sm font-bold text-gray-900">Publish</p>
              <p className="text-sm font-normal text-gray-500 mt-0.5">User จะเห็น Tool นี้ทันทีหลังบันทึก</p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(prev => ({ ...prev, isPublished: !prev.isPublished }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                draft.isPublished ? 'bg-freshket-500' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                draft.isPublished ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
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

// ── Knowledge Deck Edit/Create Modal ──────────────────────────────────────────
function DeckEditModal({
  deck,
  isNew,
  onSave,
  onClose,
}: {
  deck: KnowledgeDeck
  isNew: boolean
  onSave: (deck: KnowledgeDeck, isNew: boolean) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<KnowledgeDeck>(deck)
  const set = (k: keyof KnowledgeDeck, v: string) => setDraft(prev => ({ ...prev, [k]: v }))
  const canSave = draft.title.trim() && draft.url.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">{isNew ? 'เพิ่มความรู้แผนก' : 'แก้ไขความรู้แผนก'}</h2>
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              ชื่อ <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={e => set('title', e.target.value)}
              placeholder="เช่น ความรู้แผนก Customer Success"
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>

          {/* Subtitle */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">คำอธิบายสั้นๆ</label>
            <input
              type="text"
              value={draft.subtitle}
              onChange={e => set('subtitle', e.target.value)}
              placeholder="เช่น สไลด์แนะนำงานทีม CS"
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>

          {/* URL */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              ลิงก์สไลด์ (URL) <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              value={draft.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://docs.google.com/presentation/..."
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
            {isNew ? 'เพิ่ม' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
