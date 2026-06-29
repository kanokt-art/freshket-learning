'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { canAccess } from '@/types/user'
import { Header } from '@/components/layout/Header'

import { getDaysSince, NEW_JOINER_DAYS } from '@/lib/utils/newJoiner'

// ── Sale Tools ────────────────────────────────────────────────────────────────

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
    description: 'Presentation deck สำหรับ pitch ลูกค้าภาษาอังกฤษ',
    category: 'Presentation',
    url: 'https://docs.google.com/presentation/d/1Vxd1UmhvnzMi4RaIZw50qTx2M58V9lt4/edit?slide=id.g206b6a35b6a_0_5#slide=id.g206b6a35b6a_0_5',
    imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-02',
    title: 'Sale Deck (ภาษาไทย)',
    description: 'Presentation deck สำหรับ pitch ลูกค้าภาษาไทย',
    category: 'Presentation',
    url: 'https://docs.google.com/presentation/d/15i6_rCgyRgdsCVrTWYiyuZ3RUFm-Ackv/edit?rtpof=true&sd=true',
    imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-03',
    title: 'ตัวอย่างสินค้า Freshket',
    description: 'Google Drive รวมรูปภาพและไฟล์ตัวอย่างสินค้า',
    category: 'Product',
    url: 'https://drive.google.com/drive/folders/1qfLY2FtwTs_8VnpMeqolgLW6vT-HRS7H',
    imageUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-04',
    title: 'Mapping Product AI',
    description: 'เครื่องมือ AI สำหรับ mapping สินค้า เปรียบเทียบราคา',
    category: 'Product',
    url: 'https://mapping-ai-bice.vercel.app/dashboard',
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-05',
    title: 'Service Area Map',
    description: 'แผนที่พื้นที่ให้บริการสำหรับวางแผนเยี่ยมลูกค้า',
    category: 'Field',
    url: 'https://www.google.com/maps/d/u/0/viewer?mid=1eYZ7hvHKLw7Kb0jWwSUZPzP_m-3sV2w&ll=13.898219270378311%2C100.77710892140075&z=11',
    imageUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-06',
    title: 'Internal Portal',
    description: 'Freshket Internal Portal เข้าถึงข้อมูลพนักงานและเอกสาร',
    category: 'Operations',
    url: 'https://portal.freshket.co/',
    imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-07',
    title: 'AppSheet — PVP & Product Request',
    description: 'แอปสำหรับกรอก PVP และขอสินค้าใหม่ผ่าน AppSheet',
    category: 'Operations',
    url: 'https://www.appsheet.com/start/2293f65d-d06e-4b0f-b96d-8d6f10316f63?platform=desktop',
    imageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=75',
  },
  {
    id: 'res-sa-08',
    title: 'Sales Dashboard — Datastudio',
    description: 'Dashboard รายงาน KPI ยอดขาย และ performance ทีม Sales',
    category: 'Report',
    url: 'https://datastudio.google.com/u/0/reporting/eaa8df46-cb41-4fd7-ab57-13e01dd2601c/page/p_7na5yd6y6c?pli=1',
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=75',
  },
]

const SALE_CATEGORY_META: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  Presentation: {
    label: 'Presentation',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
      </svg>
    ),
  },
  Product: {
    label: 'Product',
    color: 'text-freshket-700',
    bg: 'bg-freshket-100',
    border: 'border-freshket-200',
    icon: (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
      </svg>
    ),
  },
  Field: {
    label: 'Field',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  Operations: {
    label: 'Operations',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  Report: {
    label: 'Report',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    icon: (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
}

const SALE_CATEGORY_ORDER = ['Presentation', 'Product', 'Field', 'Operations', 'Report']

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamCard {
  id: string
  name: string
  emoji: string
  tagline: string
  responsibilities: string[]
  contact: string
  color: string   // bg + text Tailwind classes (pastel)
  borderColor: string
}

interface ProblemGuide {
  id: string
  problem: string
  team: string
  teamEmoji: string
  howToContact: string
  urgency: 'high' | 'medium' | 'low'
}

interface HighlightedTool {
  id: string
  title: string
  subtitle: string
  description: string
  href: string
  emoji: string
  darkBg: string
  btnColor: string
  isNew?: boolean
}

// ── Demo Data ─────────────────────────────────────────────────────────────────

const INIT_TEAMS: TeamCard[] = [
  {
    id: 't1',
    name: 'Sales Team',
    emoji: '🏪',
    tagline: 'ดูแลลูกค้าและยอดขาย',
    responsibilities: ['Account Management', 'Customer Visit & Follow-up', 'Shadow Visit ร่วมกับ Mentor', 'รายงานยอดขายประจำวัน'],
    contact: 'Line Group: @freshket-sale',
    color: 'bg-freshket-100 text-freshket-800',
    borderColor: 'border-freshket-200',
  },
  {
    id: 't2',
    name: 'Key Account Team',
    emoji: '🤝',
    tagline: 'ดูแลลูกค้า Enterprise',
    responsibilities: ['ลูกค้า Chain & Hotel', 'Contract & Pricing', 'Upsell & Cross-sell', 'Customer Success'],
    contact: 'Line Group: @freshket-ka',
    color: 'bg-blue-100 text-blue-800',
    borderColor: 'border-blue-200',
  },
  {
    id: 't3',
    name: 'Product Team',
    emoji: '🥦',
    tagline: 'ผลิตภัณฑ์และคุณภาพ',
    responsibilities: ['Product Catalog & ราคา', 'Quality Control & Complaint', 'NPD (สินค้าใหม่)', 'Product Knowledge Training'],
    contact: 'Slack: #product-team',
    color: 'bg-emerald-100 text-emerald-800',
    borderColor: 'border-emerald-200',
  },
  {
    id: 't4',
    name: 'Operations Team',
    emoji: '🚚',
    tagline: 'จัดส่งและ Logistics',
    responsibilities: ['Delivery & Logistics', 'Warehouse Management', 'Order Fulfillment', 'แก้ไขปัญหาการจัดส่ง'],
    contact: 'Line: @freshket-ops',
    color: 'bg-amber-100 text-amber-800',
    borderColor: 'border-amber-200',
  },
  {
    id: 't5',
    name: 'Finance Team',
    emoji: '💳',
    tagline: 'การเงินและเอกสาร',
    responsibilities: ['Invoice & ใบกำกับภาษี', 'Credit Term & Payment', 'Reimbursement ค่าใช้จ่าย', 'Financial Report'],
    contact: 'Email: finance@freshket.co',
    color: 'bg-purple-100 text-purple-800',
    borderColor: 'border-purple-200',
  },
  {
    id: 't6',
    name: 'People & Engagement',
    emoji: '👥',
    tagline: 'HR และพัฒนาคน',
    responsibilities: ['Leave & Attendance', 'Training & Development', 'Benefits & Welfare', 'Onboarding New Joiner'],
    contact: 'Line: @freshket-hr',
    color: 'bg-pink-100 text-pink-800',
    borderColor: 'border-pink-200',
  },
  {
    id: 't7',
    name: 'Tech / IT Team',
    emoji: '💻',
    tagline: 'ระบบและเทคโนโลยี',
    responsibilities: ['App & System Support', 'Account & Access', 'Data & Report', 'Infrastructure'],
    contact: 'Slack: #it-helpdesk',
    color: 'bg-sky-100 text-sky-800',
    borderColor: 'border-sky-200',
  },
  {
    id: 't8',
    name: 'Marketing Team',
    emoji: '📣',
    tagline: 'สื่อสารและแบรนด์',
    responsibilities: ['Campaign & Promotion', 'Content & Social Media', 'Branding Materials', 'Customer Acquisition'],
    contact: 'Slack: #marketing',
    color: 'bg-rose-100 text-rose-800',
    borderColor: 'border-rose-200',
  },
]

const INIT_PROBLEMS: ProblemGuide[] = [
  { id: 'p1', problem: 'App Freshket ใช้งานไม่ได้ / ระบบล่ม', team: 'Tech / IT', teamEmoji: '💻', howToContact: 'Slack #it-helpdesk หรือโทรแจ้ง IT on-call', urgency: 'high' },
  { id: 'p2', problem: 'ลูกค้าไม่ได้รับสินค้า / ส่งผิด / ส่งช้า', team: 'Operations', teamEmoji: '🚚', howToContact: 'Line @freshket-ops แจ้ง Order ID และรายละเอียด', urgency: 'high' },
  { id: 'p3', problem: 'ลูกค้าขอใบกำกับภาษี / เอกสาร Credit', team: 'Finance', teamEmoji: '💳', howToContact: 'Email finance@freshket.co พร้อมแนบ Order ID', urgency: 'medium' },
  { id: 'p4', problem: 'สินค้ามีปัญหาคุณภาพ / ลูกค้า Complaint', team: 'Product', teamEmoji: '🥦', howToContact: 'Slack #product-complaint พร้อมรูปภาพ', urgency: 'high' },
  { id: 'p5', problem: 'ต้องการข้อมูลราคา / สินค้าใหม่ (NPD)', team: 'Product', teamEmoji: '🥦', howToContact: 'Slack #product-info หรือ Line @product-team', urgency: 'low' },
  { id: 'p6', problem: 'ลืม Password / เข้า System ไม่ได้', team: 'Tech / IT', teamEmoji: '💻', howToContact: 'Slack #it-helpdesk แจ้งชื่อและ Email', urgency: 'medium' },
  { id: 'p7', problem: 'ขอลา / ไม่สบาย / เรื่อง Leave', team: 'People & Engagement', teamEmoji: '👥', howToContact: 'Line @freshket-hr แจ้ง Manager ก่อนเสมอ', urgency: 'medium' },
  { id: 'p8', problem: 'ต้องการเบิกค่าใช้จ่าย (Reimbursement)', team: 'Finance', teamEmoji: '💳', howToContact: 'กรอกฟอร์ม Expense ใน HR System พร้อมใบเสร็จ', urgency: 'low' },
]

const INIT_TOOLS: HighlightedTool[] = [
  {
    id: 'tl1',
    title: 'Mandatory Reading',
    subtitle: 'อ่านก่อน เริ่มงาน',
    description: 'คู่มือ Product Knowledge ประจำสัปดาห์ที่ต้องอ่าน — อัปเดตทุกจันทร์',
    href: '/tools/mandatory',
    emoji: '📚',
    darkBg: 'linear-gradient(135deg, #1c1917 0%, #44403c 100%)',
    btnColor: 'bg-amber-500 hover:bg-amber-600',
    isNew: true,
  },
  {
    id: 'tl2',
    title: 'My Courses',
    subtitle: 'หลักสูตรของฉัน',
    description: 'เรียนครบ Onboarding Path — ตรวจสอบความก้าวหน้า 90 วันแรก',
    href: '/courses',
    emoji: '🎓',
    darkBg: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)',
    btnColor: 'bg-indigo-600 hover:bg-indigo-700',
  },
  {
    id: 'tl3',
    title: 'Shadow Visit',
    subtitle: 'เรียนรู้จากพี่เลี้ยง',
    description: 'บันทึกการ Shadow กับ Mentor — ดูว่า KA มืออาชีพ Visit ลูกค้าอย่างไร',
    href: '/shadow',
    emoji: '👀',
    darkBg: 'linear-gradient(135deg, #022c22 0%, #065f46 100%)',
    btnColor: 'bg-emerald-600 hover:bg-emerald-700',
  },
  {
    id: 'tl4',
    title: 'My Dashboard',
    subtitle: 'ภาพรวมของฉัน',
    description: 'ติดตาม Score คะแนน Certificate และ Streak การเรียนรู้',
    href: '/sale',
    emoji: '📊',
    darkBg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
    btnColor: 'bg-blue-700 hover:bg-blue-800',
  },
]

const URGENCY_STYLE = {
  high:   { badge: 'bg-rose-100 text-rose-700 border-rose-200', label: 'ด่วน' },
  medium: { badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'ปกติ' },
  low:    { badge: 'bg-gray-100 text-gray-600 border-gray-200', label: 'ไม่ด่วน' },
}

// ── Team Form Modal ───────────────────────────────────────────────────────────

function TeamFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: TeamCard
  onSave: (t: TeamCard) => void
  onClose: () => void
}) {
  const isEdit = !!initial
  const blank: TeamCard = { id: Date.now().toString(), name: '', emoji: '🏢', tagline: '', responsibilities: [''], contact: '', color: 'bg-gray-100 text-gray-800', borderColor: 'border-gray-200' }
  const [form, setForm] = useState<TeamCard>(initial ?? blank)

  function setResp(i: number, val: string) {
    setForm(prev => {
      const r = [...prev.responsibilities]
      r[i] = val
      return { ...prev, responsibilities: r }
    })
  }
  function addResp() { setForm(prev => ({ ...prev, responsibilities: [...prev.responsibilities, ''] })) }
  function removeResp(i: number) { setForm(prev => ({ ...prev, responsibilities: prev.responsibilities.filter((_, idx) => idx !== i) })) }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-pop-in" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{isEdit ? 'แก้ไขทีม' : 'เพิ่มทีมใหม่'}</h3>
          <button type="button" onClick={onClose} className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-xs font-normal text-gray-700 mb-1">Emoji</label>
              <input value={form.emoji} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-center outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-normal text-gray-700 mb-1">ชื่อทีม <span className="text-rose-400">*</span></label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" placeholder="Sales Team" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1">Tagline</label>
            <input value={form.tagline} onChange={e => setForm(p => ({ ...p, tagline: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" placeholder="ดูแลลูกค้าและยอดขาย" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-normal text-gray-700">หน้าที่รับผิดชอบ</label>
              <button type="button" onClick={addResp} className="text-xs text-freshket-600 font-bold hover:underline">+ เพิ่ม</button>
            </div>
            <div className="space-y-1.5">
              {form.responsibilities.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input value={r} onChange={e => setResp(i, e.target.value)} className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" placeholder={`หน้าที่ที่ ${i + 1}`} />
                  {form.responsibilities.length > 1 && (
                    <button type="button" onClick={() => removeResp(i)} className="size-8 shrink-0 rounded-lg flex items-center justify-center text-gray-300 hover:text-rose-400 hover:bg-rose-50 transition-colors">
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1">ช่องทางติดต่อ</label>
            <input value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" placeholder="Line: @team-xxx" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">ยกเลิก</button>
          <button type="button" onClick={() => { if (form.name.trim()) { onSave(form); onClose() } }} className="px-5 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors">บันทึก</button>
        </div>
      </div>
    </div>
  )
}

// ── Problem Form Modal ────────────────────────────────────────────────────────

function ProblemFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: ProblemGuide
  onSave: (p: ProblemGuide) => void
  onClose: () => void
}) {
  const blank: ProblemGuide = { id: Date.now().toString(), problem: '', team: '', teamEmoji: '❓', howToContact: '', urgency: 'medium' }
  const [form, setForm] = useState<ProblemGuide>(initial ?? blank)

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-pop-in" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{initial ? 'แก้ไขปัญหา' : 'เพิ่มรายการปัญหา'}</h3>
          <button type="button" onClick={onClose} className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1">ปัญหาที่เจอ <span className="text-rose-400">*</span></label>
            <input value={form.problem} onChange={e => setForm(p => ({ ...p, problem: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" placeholder="App ใช้งานไม่ได้..." />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-xs font-normal text-gray-700 mb-1">Emoji</label>
              <input value={form.teamEmoji} onChange={e => setForm(p => ({ ...p, teamEmoji: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-center outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-normal text-gray-700 mb-1">ทีมที่ติดต่อ</label>
              <input value={form.team} onChange={e => setForm(p => ({ ...p, team: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" placeholder="Tech / IT" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1">วิธีติดต่อ</label>
            <input value={form.howToContact} onChange={e => setForm(p => ({ ...p, howToContact: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100" placeholder="Slack #it-helpdesk" />
          </div>
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1">ระดับความเร่งด่วน</label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as const).map(u => (
                <button key={u} type="button" onClick={() => setForm(p => ({ ...p, urgency: u }))}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.urgency === u ? URGENCY_STYLE[u].badge + ' scale-105' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                  {URGENCY_STYLE[u].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">ยกเลิก</button>
          <button type="button" onClick={() => { if (form.problem.trim()) { onSave(form); onClose() } }} className="px-5 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors">บันทึก</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NewJoinerPage() {
  const { user } = useAuth()
  const isAdmin = user ? canAccess(user.role, 'super_admin') : false
  const daysSince = getDaysSince(user?.startDate)
  const isNewJoiner = daysSince < NEW_JOINER_DAYS
  const daysLeft = Math.max(0, NEW_JOINER_DAYS - daysSince)
  const pct = Math.min(100, Math.round((daysSince / NEW_JOINER_DAYS) * 100))
  const firstName = user?.nickname ?? user?.displayName?.split(' ')[0] ?? ''

  const [teams, setTeams] = useState<TeamCard[]>(INIT_TEAMS)
  const [problems, setProblems] = useState<ProblemGuide[]>(INIT_PROBLEMS)
  const [tools] = useState<HighlightedTool[]>(INIT_TOOLS)

  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'team' | 'problems'>('overview')
  const [editMode, setEditMode] = useState(false)
  const [teamModal, setTeamModal] = useState<{ open: boolean; item?: TeamCard }>({ open: false })
  const [problemModal, setProblemModal] = useState<{ open: boolean; item?: ProblemGuide }>({ open: false })
  const [expandedProblems, setExpandedProblems] = useState<Set<string>>(new Set())

  const highPriority = useMemo(() => problems.filter(p => p.urgency === 'high'), [problems])
  const otherProblems = useMemo(() => problems.filter(p => p.urgency !== 'high'), [problems])

  function toggleProblem(id: string) {
    setExpandedProblems(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (!isNewJoiner && !isAdmin) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <Header title="New Joiner Hub" subtitle="สำหรับพนักงานใหม่" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-5xl mb-4">🎉</div>
            <p className="text-lg font-bold text-gray-700">ยินดีด้วย! คุณผ่านช่วง Onboarding แล้ว</p>
            <p className="text-sm text-gray-400 mt-1">คุณทำงานมา {daysSince} วัน</p>
            <Link href="/sale" className="mt-4 inline-block px-5 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">
              กลับ Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header
        title="New Joiner Hub"
        subtitle="คู่มือสำหรับพนักงานใหม่ Freshket"
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={() => setEditMode(v => !v)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${editMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                {editMode
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                }
              </svg>
              {editMode ? 'เสร็จสิ้น' : 'แก้ไขเนื้อหา'}
            </button>
          ) : undefined
        }
      />

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 flex overflow-x-auto shrink-0">
        {([
          {
            id: 'overview' as const, label: 'ภาพรวม',
            icon: <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
          },
          {
            id: 'tools' as const, label: 'เครื่องมือ',
            icon: <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>,
          },
          {
            id: 'team' as const, label: 'ทีม',
            icon: <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>,
          },
          {
            id: 'problems' as const, label: 'แก้ปัญหา',
            icon: <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>,
          },
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-all duration-150 whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-freshket-500 text-freshket-600'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Overview Tab ───────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
        <div className="p-4 sm:p-6 space-y-6">

        {/* Welcome Banner */}
        {isNewJoiner && (
          <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #00804c 0%, #00a862 55%, #00ce7c 100%)' }}>
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-4 -right-4 size-32 rounded-full bg-white/5" />
              <div className="absolute top-8 right-8 size-20 rounded-full bg-white/10" />
              <div className="absolute -bottom-6 right-24 size-24 rounded-full bg-white/5" />
            </div>
            <div className="relative z-10 p-6 flex items-center gap-6 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
                  <span>🌱</span> New Joiner Onboarding
                </div>
                <h2 className="text-xl font-black text-white mb-1">
                  ยินดีต้อนรับ, {firstName}! 🎉
                </h2>
                <p className="text-sm text-green-100">
                  วันที่ {daysSince} จาก {NEW_JOINER_DAYS} วัน · เหลืออีก {daysLeft} วันในช่วง Onboarding
                </p>
              </div>

              {/* Progress ring */}
              <div className="shrink-0 relative size-20">
                <svg className="size-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
                  <circle
                    cx="40" cy="40" r="32" fill="none"
                    stroke="white" strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 32}`}
                    strokeDashoffset={`${2 * Math.PI * 32 * (1 - pct / 100)}`}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-black text-white leading-none">{pct}%</span>
                  <span className="text-xs text-green-100 leading-none mt-0.5">ครบแล้ว</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative z-10 px-6 pb-4">
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Admin-only info strip */}
        {isAdmin && !isNewJoiner && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-center gap-3">
            <svg className="size-4 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
            <p className="text-xs text-amber-700 font-normal">คุณดูหน้านี้ในฐานะ Admin — New Joiner banner จะไม่แสดงเนื่องจากอายุงานครบ 119 วันแล้ว</p>
          </div>
        )}

        {/* ── Key Tools ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="size-4 text-freshket-500" viewBox="0 0 24 24" fill="currentColor"><path d="M11.7 2.805a.75.75 0 01.6 0A60.65 60.65 0 0122.83 8.72a.75.75 0 01-.231 1.337 49.949 49.949 0 00-9.902 3.912l-.003.002-.34.18a.75.75 0 01-.707 0A50.009 50.009 0 007.5 12.174v-.224c0-.131.067-.248.172-.311a54.614 54.614 0 014.653-2.52.75.75 0 00-.65-1.352 56.129 56.129 0 00-4.78 2.589 1.858 1.858 0 00-.859 1.228 49.803 49.803 0 00-4.634-1.527.75.75 0 01-.231-1.337A60.653 60.653 0 0111.7 2.805z" /></svg>
            เครื่องมือสำคัญ
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tools.map(t => (
              <Link key={t.id} href={t.href}
                className="group bg-white rounded-2xl border border-gray-100 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 overflow-hidden flex flex-col">

                {/* Dark visual header */}
                <div className="relative h-40 overflow-hidden shrink-0" style={{ background: t.darkBg }}>
                  {t.isNew && (
                    <span className="absolute top-3 right-3 z-10 text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white shadow">NEW</span>
                  )}

                  {t.id === 'tl1' && (
                    <svg viewBox="0 0 240 140" className="absolute inset-0 w-full h-full" fill="none">
                      <rect x="40" y="88" width="100" height="14" rx="4" fill="rgba(255,255,255,0.12)"/>
                      <rect x="32" y="72" width="116" height="16" rx="4" fill="rgba(255,255,255,0.1)"/>
                      <rect x="48" y="56" width="88" height="16" rx="4" fill="rgba(255,255,255,0.08)"/>
                      <rect x="40" y="88" width="6" height="14" rx="2" fill="rgba(251,191,36,0.45)"/>
                      <rect x="32" y="72" width="6" height="16" rx="2" fill="rgba(251,191,36,0.35)"/>
                      <rect x="48" y="56" width="6" height="16" rx="2" fill="rgba(251,191,36,0.25)"/>
                      <rect x="160" y="45" width="56" height="5" rx="2.5" fill="rgba(255,255,255,0.2)"/>
                      <rect x="160" y="58" width="44" height="5" rx="2.5" fill="rgba(255,255,255,0.14)"/>
                      <rect x="160" y="71" width="50" height="5" rx="2.5" fill="rgba(255,255,255,0.1)"/>
                      <rect x="160" y="84" width="36" height="5" rx="2.5" fill="rgba(255,255,255,0.07)"/>
                      <circle cx="198" cy="22" r="14" fill="rgba(251,191,36,0.2)"/>
                      <path d="M198 11 l2.9 8.7 9.1 0 -7.4 5.4 2.9 8.7 -7.5-5.5 -7.5 5.5 2.9-8.7 -7.4-5.4 9.1 0z" fill="rgba(251,191,36,0.6)"/>
                    </svg>
                  )}

                  {t.id === 'tl2' && (
                    <svg viewBox="0 0 240 140" className="absolute inset-0 w-full h-full" fill="none">
                      <circle cx="60" cy="82" r="34" stroke="rgba(255,255,255,0.1)" strokeWidth="8"/>
                      <circle cx="60" cy="82" r="34" stroke="rgba(165,180,252,0.7)" strokeWidth="8"
                        strokeDasharray="213" strokeDashoffset="55" strokeLinecap="round"
                        style={{ transformOrigin: '60px 82px', transform: 'rotate(-90deg)' }}/>
                      <text x="60" y="78" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="12" fontWeight="bold">74%</text>
                      <text x="60" y="92" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8">เสร็จแล้ว</text>
                      <rect x="118" y="40" width="88" height="9" rx="4.5" fill="rgba(255,255,255,0.08)"/>
                      <circle cx="111" cy="44" r="8" fill="rgba(165,180,252,0.25)"/>
                      <path d="M107 44 l3 3 7-7" stroke="rgba(165,180,252,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="118" y="62" width="70" height="9" rx="4.5" fill="rgba(255,255,255,0.08)"/>
                      <circle cx="111" cy="66" r="8" fill="rgba(165,180,252,0.25)"/>
                      <path d="M107 66 l3 3 7-7" stroke="rgba(165,180,252,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="118" y="84" width="80" height="9" rx="4.5" fill="rgba(255,255,255,0.05)"/>
                      <circle cx="111" cy="88" r="8" fill="rgba(255,255,255,0.08)"/>
                      <path d="M175 18 l20 8 -20 8 -20-8 20-8z" fill="rgba(165,180,252,0.4)"/>
                      <path d="M155 26 l0 12 20 8 20-8 0-12" fill="rgba(165,180,252,0.12)" stroke="rgba(165,180,252,0.35)" strokeWidth="1"/>
                    </svg>
                  )}

                  {t.id === 'tl3' && (
                    <svg viewBox="0 0 240 140" className="absolute inset-0 w-full h-full" fill="none">
                      <rect x="88" y="52" width="64" height="62" rx="4" fill="rgba(255,255,255,0.1)"/>
                      <rect x="96" y="33" width="48" height="21" rx="3" fill="rgba(255,255,255,0.07)"/>
                      <rect x="105" y="82" width="20" height="32" rx="2" fill="rgba(0,0,0,0.25)"/>
                      <rect x="92" y="62" width="14" height="12" rx="2" fill="rgba(255,255,255,0.15)"/>
                      <rect x="134" y="62" width="14" height="12" rx="2" fill="rgba(255,255,255,0.15)"/>
                      <rect x="88" y="50" width="64" height="5" rx="2" fill="rgba(255,255,255,0.15)"/>
                      <circle cx="44" cy="56" r="11" fill="rgba(255,255,255,0.18)"/>
                      <path d="M25 108 Q44 80 63 108" fill="rgba(255,255,255,0.1)"/>
                      <circle cx="198" cy="66" r="9" fill="rgba(0,206,124,0.35)"/>
                      <path d="M182 108 Q198 83 214 108" fill="rgba(0,206,124,0.14)"/>
                      <circle cx="44" cy="28" r="12" fill="rgba(0,206,124,0.2)"/>
                      <path d="M36 28 Q44 21 52 28 Q44 35 36 28Z" fill="rgba(255,255,255,0.45)"/>
                      <circle cx="44" cy="28" r="4" fill="rgba(255,255,255,0.4)"/>
                      <path d="M68 80 L84 80" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round"/>
                    </svg>
                  )}

                  {t.id === 'tl4' && (
                    <svg viewBox="0 0 240 140" className="absolute inset-0 w-full h-full" fill="none">
                      <rect x="20" y="14" width="52" height="20" rx="5" fill="rgba(255,255,255,0.1)"/>
                      <rect x="80" y="14" width="52" height="20" rx="5" fill="rgba(59,130,246,0.3)"/>
                      <rect x="140" y="14" width="52" height="20" rx="5" fill="rgba(255,255,255,0.07)"/>
                      <rect x="200" y="14" width="28" height="20" rx="5" fill="rgba(255,255,255,0.05)"/>
                      <rect x="20" y="95" width="22" height="30" rx="3" fill="rgba(255,255,255,0.12)"/>
                      <rect x="50" y="75" width="22" height="50" rx="3" fill="rgba(255,255,255,0.15)"/>
                      <rect x="80" y="55" width="22" height="70" rx="3" fill="rgba(59,130,246,0.45)"/>
                      <rect x="110" y="68" width="22" height="57" rx="3" fill="rgba(255,255,255,0.13)"/>
                      <rect x="140" y="48" width="22" height="77" rx="3" fill="rgba(59,130,246,0.35)"/>
                      <rect x="170" y="78" width="22" height="47" rx="3" fill="rgba(255,255,255,0.1)"/>
                      <rect x="200" y="60" width="22" height="65" rx="3" fill="rgba(255,255,255,0.08)"/>
                      <path d="M20 100 l30-25 30 12 30-35 30 18 30-28 20 10" stroke="rgba(59,130,246,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="20" y1="125" x2="222" y2="125" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
                    </svg>
                  )}
                </div>

                {/* Card body */}
                <div className="px-4 pt-2 pb-4 flex flex-col flex-1 relative">
                  <div className="absolute -top-5 left-4 size-10 rounded-2xl bg-white border border-gray-100 shadow-md flex items-center justify-center text-lg select-none">
                    {t.emoji}
                  </div>
                  <div className="mt-6">
                    <p className="text-sm font-bold text-gray-900 leading-tight">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.subtitle}</p>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mt-2 flex-1">{t.description}</p>
                  <div className={`mt-3 w-full py-2 rounded-xl text-center text-xs font-bold text-white transition-colors ${t.btnColor}`}>
                    เปิด →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        </div>
        )}

        {/* ── Tools Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'tools' && (
        <div className="p-4 sm:p-6">
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="size-4 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
            เครื่องมือ Sale
          </h2>
          <div className="space-y-4">
            {SALE_CATEGORY_ORDER.map(cat => {
              const items = SALE_TOOLS.filter(t => t.category === cat)
              if (items.length === 0) return null
              const meta = SALE_CATEGORY_META[cat]
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <hr className="flex-1 border-gray-100" />
                    <span className="text-xs text-gray-400">{items.length} รายการ</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map(tool => (
                      <a
                        key={tool.id}
                        href={tool.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2.5 hover:border-freshket-200 hover:shadow-md transition-all duration-150"
                      >
                        <div className="size-11 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                          <img
                            src={tool.imageUrl}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate leading-tight">{tool.title}</p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{tool.description}</p>
                        </div>
                        <svg className="size-4 text-gray-300 group-hover:text-freshket-500 shrink-0 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
        </div>
        )}

        {/* ── Team Tab ───────────────────────────────────────────────────── */}
        {activeTab === 'team' && (
        <div className="p-4 sm:p-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <svg className="size-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              ทีมไหนดูแลอะไร
            </h2>
            {editMode && (
              <button type="button" onClick={() => setTeamModal({ open: true })}
                className="flex items-center gap-1.5 text-xs font-bold text-freshket-600 hover:text-freshket-700 px-3 py-1.5 rounded-xl border border-freshket-200 bg-freshket-50 hover:bg-freshket-100 transition-colors">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                เพิ่มทีม
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teams.map(team => (
              <div key={team.id} className={`relative bg-white rounded-2xl border p-4 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 ${team.borderColor}`}>
                {editMode && (
                  <div className="absolute top-2.5 right-2.5 flex gap-1">
                    <button type="button" onClick={() => setTeamModal({ open: true, item: team })}
                      className="size-6 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors">
                      <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
                    </button>
                    <button type="button" onClick={() => setTeams(prev => prev.filter(t => t.id !== team.id))}
                      className="size-6 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-rose-100 text-gray-400 hover:text-rose-500 transition-colors">
                      <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
                <div className={`inline-flex items-center justify-center size-10 rounded-xl ${team.color} text-xl mb-3`}>{team.emoji}</div>
                <p className="text-sm font-bold text-gray-900 mb-0.5">{team.name}</p>
                <p className="text-xs text-gray-400 mb-2">{team.tagline}</p>
                <ul className="space-y-1 mb-3">
                  {team.responsibilities.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                      <span className="text-freshket-500 mt-0.5 shrink-0">·</span>
                      {r}
                    </li>
                  ))}
                </ul>
                <div className={`inline-flex items-center gap-1 text-xs font-normal px-2.5 py-1 rounded-full border ${team.color} ${team.borderColor}`}>
                  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                  {team.contact}
                </div>
              </div>
            ))}
          </div>
        </section>
        </div>
        )}

        {/* ── Problems Tab ───────────────────────────────────────────────── */}
        {activeTab === 'problems' && (
        <div className="p-4 sm:p-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <svg className="size-4 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              เจอปัญหานี้ ติดต่อทีมไหน?
            </h2>
            {editMode && (
              <button type="button" onClick={() => setProblemModal({ open: true })}
                className="flex items-center gap-1.5 text-xs font-bold text-freshket-600 hover:text-freshket-700 px-3 py-1.5 rounded-xl border border-freshket-200 bg-freshket-50 hover:bg-freshket-100 transition-colors">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                เพิ่มรายการ
              </button>
            )}
          </div>

          {/* High urgency */}
          {highPriority.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-bold text-rose-500 mb-2">⚡ ติดต่อด่วน</p>
              <div className="space-y-2">
                {highPriority.map(p => (
                  <ProblemRow key={p.id} problem={p} editMode={editMode} expanded={expandedProblems.has(p.id)}
                    onToggle={() => toggleProblem(p.id)}
                    onEdit={() => setProblemModal({ open: true, item: p })}
                    onDelete={() => setProblems(prev => prev.filter(x => x.id !== p.id))}
                  />
                ))}
              </div>
            </div>
          )}

          {otherProblems.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 mb-2">ปัญหาทั่วไป</p>
              <div className="space-y-2">
                {otherProblems.map(p => (
                  <ProblemRow key={p.id} problem={p} editMode={editMode} expanded={expandedProblems.has(p.id)}
                    onToggle={() => toggleProblem(p.id)}
                    onEdit={() => setProblemModal({ open: true, item: p })}
                    onDelete={() => setProblems(prev => prev.filter(x => x.id !== p.id))}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
        </div>
        )}

      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {teamModal.open && (
        <TeamFormModal
          initial={teamModal.item}
          onSave={t => setTeams(prev => teamModal.item ? prev.map(x => x.id === t.id ? t : x) : [...prev, t])}
          onClose={() => setTeamModal({ open: false })}
        />
      )}
      {problemModal.open && (
        <ProblemFormModal
          initial={problemModal.item}
          onSave={p => setProblems(prev => problemModal.item ? prev.map(x => x.id === p.id ? p : x) : [...prev, p])}
          onClose={() => setProblemModal({ open: false })}
        />
      )}
    </div>
  )
}

// ── ProblemRow ────────────────────────────────────────────────────────────────

function ProblemRow({
  problem, editMode, expanded, onToggle, onEdit, onDelete,
}: {
  problem: ProblemGuide
  editMode: boolean
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const u = URGENCY_STYLE[problem.urgency]
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group">
        <span className="text-xl shrink-0">{problem.teamEmoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight">{problem.problem}</p>
          <p className="text-xs text-gray-400 mt-0.5">ติดต่อ: {problem.team}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${u.badge}`}>{u.label}</span>
          {editMode && (
            <>
              <button type="button" onClick={e => { e.stopPropagation(); onEdit() }}
                className="size-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
              </button>
              <button type="button" onClick={e => { e.stopPropagation(); onDelete() }}
                className="size-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </>
          )}
          <svg className={`size-4 text-gray-300 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-100 bg-gray-50">
          <div className="flex items-start gap-2 mt-2.5">
            <svg className="size-4 text-freshket-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            <p className="text-sm text-gray-700 leading-relaxed">{problem.howToContact}</p>
          </div>
        </div>
      )}
    </div>
  )
}
