'use client'

import { useState, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getDemoMode } from '@/lib/demo/demoMode'
import { Header } from '@/components/layout/Header'

const DEMO = getDemoMode()

// ── Types ─────────────────────────────────────────────────────────────────────

type UserActivityType =
  | 'course_complete' | 'assessment_submit' | 'key_takeaway'
  | 'challenge_enter' | 'challenge_rank' | 'points_earned'

type AdminActivityType =
  | 'course_create' | 'course_edit' | 'course_delete'
  | 'point_adjust' | 'role_change' | 'user_create' | 'user_delete'

interface UserActivity {
  id: string
  userId: string
  userName: string
  userAvatar?: string | null
  department?: string
  type: UserActivityType
  subject: string
  score?: number
  points?: number
  detail?: string
  timestamp: Date
}

interface AdminActivity {
  id: string
  adminId: string
  adminName: string
  type: AdminActivityType
  subject: string
  targetName?: string
  detail: string
  timestamp: Date
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

function daysAgo(n: number, hoursOffset = 0) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(d.getHours() - hoursOffset)
  return d
}

const MOCK_USER_ACTIVITIES: UserActivity[] = [
  { id: 'ua-01', userId: 'mock-sale-01', userName: 'สมชาย ใจดี',     department: 'Sale',         type: 'course_complete',   subject: 'Product Knowledge 101',   score: 95, points: 165, timestamp: daysAgo(0, 2) },
  { id: 'ua-02', userId: 'mock-sale-02', userName: 'ปริยา รักเรียน',  department: 'Sale',         type: 'assessment_submit', subject: 'Post-Test: Sales Skill',  score: 88,             timestamp: daysAgo(0, 4) },
  { id: 'ua-03', userId: 'mock-tl-01',  userName: 'ประสิทธิ์ นำทีม', department: 'Key Account',  type: 'challenge_enter',   subject: 'Sales Sprint Q2',         score: 96, points: 244, timestamp: daysAgo(1, 1) },
  { id: 'ua-04', userId: 'mock-sale-03', userName: 'ธนกร ขยันดี',     department: 'Sale',         type: 'key_takeaway',      subject: 'CRM System Usage',                   points: 15,  timestamp: daysAgo(1, 3) },
  { id: 'ua-05', userId: 'mock-sale-04', userName: 'อรัญญา ใหม่มือ', department: 'Sale',         type: 'course_complete',   subject: 'Compliance & Ethics',     score: 72, points: 90,  timestamp: daysAgo(1, 5) },
  { id: 'ua-06', userId: 'mock-sale-05', userName: 'วิทยา ศึกษา',     department: 'Key Account',  type: 'assessment_submit', subject: 'Pre-Test: Leadership',    score: 80,             timestamp: daysAgo(2, 0) },
  { id: 'ua-07', userId: 'mock-tl-02',  userName: 'ศิริพร หัวหน้า',  department: 'Sale',         type: 'course_complete',   subject: 'Leadership Fundamentals', score: 91, points: 185, timestamp: daysAgo(2, 2) },
  { id: 'ua-08', userId: 'mock-sale-01', userName: 'สมชาย ใจดี',     department: 'Sale',         type: 'challenge_rank',    subject: 'Sales Sprint Q2',                    points: 200, timestamp: daysAgo(2, 4), detail: 'ได้อันดับ #1' },
  { id: 'ua-09', userId: 'mock-sale-06', userName: 'ปัณณิตา สุดเก่ง', department: 'Sale',         type: 'key_takeaway',      subject: 'Product Knowledge 101',              points: 15,  timestamp: daysAgo(3, 0) },
  { id: 'ua-10', userId: 'mock-mgr-01', userName: 'วันชัย สมใจ',     department: 'Sale',         type: 'course_complete',   subject: 'Sales Skill Mastery',     score: 94, points: 210, timestamp: daysAgo(3, 2) },
  { id: 'ua-11', userId: 'mock-sale-02', userName: 'ปริยา รักเรียน',  department: 'Sale',         type: 'course_complete',   subject: 'CRM System Usage',        score: 85, points: 140, timestamp: daysAgo(4, 1) },
  { id: 'ua-12', userId: 'mock-tl-03',  userName: 'กฤษดา ทีมเวิร์ค', department: 'Key Account',  type: 'assessment_submit', subject: 'Pre-Test: Compliance',    score: 78,             timestamp: daysAgo(4, 3) },
  { id: 'ua-13', userId: 'mock-sale-07', userName: 'พิชัย มุ่งมั่น',   department: 'Sale',         type: 'course_complete',   subject: 'Product Knowledge 101',   score: 62, points: 55,  timestamp: daysAgo(5, 0) },
  { id: 'ua-14', userId: 'mock-sale-03', userName: 'ธนกร ขยันดี',     department: 'Sale',         type: 'course_complete',   subject: 'Compliance & Ethics',     score: 88, points: 155, timestamp: daysAgo(5, 2) },
  { id: 'ua-15', userId: 'mock-tl-04',  userName: 'นัทธ์ หัวหน้าทีม', department: 'Key Account',  type: 'challenge_enter',   subject: 'Sales Sprint Q2',         score: 82, points: 150, timestamp: daysAgo(6, 1) },
]

const MOCK_ADMIN_ACTIVITIES: AdminActivity[] = [
  { id: 'aa-01', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'point_adjust', subject: 'ปรับคะแนน', targetName: 'สมชาย ใจดี',  detail: '+50 pts — โบนัสพิเศษ: Best Performer เดือน พ.ค.',       timestamp: daysAgo(0, 1) },
  { id: 'aa-02', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'course_create', subject: 'สร้างหลักสูตร',                          detail: 'เพิ่มหลักสูตร "Advanced Negotiation Skills"',             timestamp: daysAgo(0, 3) },
  { id: 'aa-03', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'point_adjust', subject: 'ปรับคะแนน', targetName: 'ประสิทธิ์ นำทีม', detail: '+100 pts — โบนัสพิเศษ: Team of the Month เม.ย.',      timestamp: daysAgo(1, 2) },
  { id: 'aa-04', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'course_edit',   subject: 'แก้ไขหลักสูตร',                          detail: 'แก้ไข "Product Knowledge 101" — อัปเดตสไลด์ใหม่',      timestamp: daysAgo(2, 0) },
  { id: 'aa-05', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'role_change',   subject: 'เปลี่ยน Role',   targetName: 'วิทยา ศึกษา',  detail: 'เปลี่ยน role: sale → team_lead',                          timestamp: daysAgo(2, 3) },
  { id: 'aa-06', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'course_create', subject: 'สร้างหลักสูตร',                          detail: 'เพิ่มหลักสูตร Challenge "Sales Sprint Q2" (×2 pts)',      timestamp: daysAgo(3, 1) },
  { id: 'aa-07', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'point_adjust', subject: 'ปรับคะแนน', targetName: 'อรัญญา ใหม่มือ', detail: '-20 pts — ปรับแก้คะแนน: ตรวจพบข้อผิดพลาดการนำเข้า', timestamp: daysAgo(4, 0) },
  { id: 'aa-08', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'user_create',   subject: 'เพิ่มผู้ใช้',                             detail: 'เพิ่มพนักงานใหม่: พิชัย มุ่งมั่น (sale)',                 timestamp: daysAgo(5, 1) },
  { id: 'aa-09', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'course_delete', subject: 'ลบหลักสูตร',                              detail: 'ลบหลักสูตร "Old Product Training 2023"',                  timestamp: daysAgo(6, 0) },
  { id: 'aa-10', adminId: 'mock-admin-01', adminName: 'กนก ทองดี', type: 'course_create', subject: 'สร้างหลักสูตร',                          detail: 'เพิ่มหลักสูตร "Compliance & Ethics" (Mandatory)',        timestamp: daysAgo(7, 2) },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(d: Date) {
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'เมื่อกี้'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม. ที่แล้ว`
  if (diff < 172800) return 'เมื่อวาน'
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fmtTimeFull(d: Date) {
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const USER_ACTIVITY_META: Record<UserActivityType, { label: string; color: string; icon: string }> = {
  course_complete:   { label: 'เรียนจบ',         color: 'text-freshket-600 bg-freshket-50',  icon: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342' },
  assessment_submit: { label: 'ส่งแบบทดสอบ',   color: 'text-blue-600 bg-blue-50',          icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z' },
  key_takeaway:      { label: 'Key Takeaway',    color: 'text-teal-600 bg-teal-50',          icon: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18' },
  challenge_enter:   { label: 'เข้า Challenge',  color: 'text-amber-600 bg-amber-50',        icon: 'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0' },
  challenge_rank:    { label: 'ติดอันดับ',       color: 'text-yellow-600 bg-yellow-50',      icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z' },
  points_earned:     { label: 'ได้รับคะแนน',     color: 'text-purple-600 bg-purple-50',      icon: 'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497' },
}

const ADMIN_ACTIVITY_META: Record<AdminActivityType, { label: string; color: string; icon: string }> = {
  course_create: { label: 'สร้างหลักสูตร', color: 'text-freshket-600 bg-freshket-50', icon: 'M12 4.5v15m7.5-7.5h-15' },
  course_edit:   { label: 'แก้ไขหลักสูตร', color: 'text-blue-600 bg-blue-50',         icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z' },
  course_delete: { label: 'ลบหลักสูตร',    color: 'text-rose-600 bg-rose-50',         icon: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0' },
  point_adjust:  { label: 'ปรับคะแนน',     color: 'text-amber-600 bg-amber-50',        icon: 'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  role_change:   { label: 'เปลี่ยน Role',   color: 'text-purple-600 bg-purple-50',      icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5' },
  user_create:   { label: 'เพิ่มผู้ใช้',    color: 'text-sky-600 bg-sky-50',            icon: 'M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z' },
  user_delete:   { label: 'ลบผู้ใช้',       color: 'text-rose-600 bg-rose-50',          icon: 'M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z' },
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, photoURL, size = 'sm' }: { name: string; photoURL?: string | null; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'size-8' : 'size-10'
  const txt = size === 'sm' ? 'text-xs' : 'text-sm'
  return (
    <div className={`${sz} rounded-full bg-freshket-100 flex items-center justify-center shrink-0 overflow-hidden`}>
      {photoURL
        ? <img src={photoURL} alt={name} className="size-full object-cover" />
        : <span className={`${txt} font-bold text-freshket-700`}>{name[0]}</span>}
    </div>
  )
}

// ── Icon ──────────────────────────────────────────────────────────────────────
function ActivityIcon({ iconPath, color }: { iconPath: string; color: string }) {
  return (
    <div className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        {iconPath.split(' M').map((seg, i) => (
          <path key={i} strokeLinecap="round" strokeLinejoin="round" d={i === 0 ? seg : 'M' + seg} />
        ))}
      </svg>
    </div>
  )
}

// ── User Activity Row ─────────────────────────────────────────────────────────
function UserActivityRow({ item }: { item: UserActivity }) {
  const meta = USER_ACTIVITY_META[item.type]
  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-gray-50 last:border-0">
      <Avatar name={item.userName} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-gray-900">{item.userName}</span>
          {item.department && (
            <span className="text-xs text-gray-400">{item.department}</span>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-0.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold mr-1.5 ${meta.color}`}>
            {meta.label}
          </span>
          <span className="font-bold">{item.subject}</span>
          {item.score !== undefined && <span className="text-gray-500 ml-1">— คะแนน {item.score}%</span>}
          {item.detail && <span className="text-gray-500 ml-1">— {item.detail}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right flex flex-col items-end gap-1">
        {item.points !== undefined && (
          <span className="text-xs font-bold text-freshket-600">+{item.points} pts</span>
        )}
        <span className="text-xs text-gray-400" title={fmtTimeFull(item.timestamp)}>{fmtTime(item.timestamp)}</span>
      </div>
    </div>
  )
}

// ── Admin Activity Row ────────────────────────────────────────────────────────
function AdminActivityRow({ item }: { item: AdminActivity }) {
  const meta = ADMIN_ACTIVITY_META[item.type]
  const isDelete = item.type === 'course_delete' || item.type === 'user_delete'
  const isAdjust = item.type === 'point_adjust'
  const pointChange = isAdjust ? item.detail.match(/([+-]\d+)\s*pts/) : null
  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-gray-50 last:border-0">
      <ActivityIcon iconPath={meta.icon} color={meta.color} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${meta.color}`}>
            {meta.label}
          </span>
          <span className="text-sm font-bold text-gray-900">{item.adminName}</span>
        </div>
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
          {item.detail}
          {item.targetName && (
            <span className="text-gray-500"> → <span className="font-bold text-gray-700">{item.targetName}</span></span>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right flex flex-col items-end gap-1">
        {isDelete && (
          <span className="text-xs font-bold text-rose-500">ลบข้อมูล</span>
        )}
        {pointChange && (
          <span className={`text-xs font-bold ${pointChange[1].startsWith('+') ? 'text-freshket-600' : 'text-rose-500'}`}>{pointChange[1]} pts</span>
        )}
        <span className="text-xs text-gray-400" title={fmtTimeFull(item.timestamp)}>{fmtTime(item.timestamp)}</span>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type LogTab = 'user' | 'admin'

export default function ActivityLogPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<LogTab>('user')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const isSuperAdmin = user?.role === 'super_admin'

  const userActivities = useMemo(() => {
    if (!DEMO) return []
    let list = [...MOCK_USER_ACTIVITIES].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a => a.userName.toLowerCase().includes(q) || a.subject.toLowerCase().includes(q))
    }
    if (typeFilter !== 'all') list = list.filter(a => a.type === typeFilter)
    return list
  }, [search, typeFilter])

  const adminActivities = useMemo(() => {
    if (!DEMO) return []
    let list = [...MOCK_ADMIN_ACTIVITIES].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a => a.detail.toLowerCase().includes(q) || (a.targetName ?? '').toLowerCase().includes(q))
    }
    if (typeFilter !== 'all') list = list.filter(a => a.type === typeFilter)
    return list
  }, [search, typeFilter])

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-slate-50">
        <div className="text-center p-8">
          <div className="size-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="size-8 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-gray-900 mb-1">ไม่มีสิทธิ์เข้าถึง</p>
          <p className="text-xs text-gray-400">หน้านี้สำหรับ Super Admin เท่านั้น</p>
        </div>
      </div>
    )
  }

  const userTypeOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'course_complete', label: 'เรียนจบ' },
    { value: 'assessment_submit', label: 'ส่งแบบทดสอบ' },
    { value: 'key_takeaway', label: 'Key Takeaway' },
    { value: 'challenge_enter', label: 'Challenge' },
    { value: 'challenge_rank', label: 'ติดอันดับ' },
  ]

  const adminTypeOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'course_create', label: 'สร้างหลักสูตร' },
    { value: 'course_edit', label: 'แก้ไขหลักสูตร' },
    { value: 'course_delete', label: 'ลบหลักสูตร' },
    { value: 'point_adjust', label: 'ปรับคะแนน' },
    { value: 'role_change', label: 'เปลี่ยน Role' },
    { value: 'user_create', label: 'เพิ่มผู้ใช้' },
  ]

  const currentOptions = tab === 'user' ? userTypeOptions : adminTypeOptions
  const currentList = tab === 'user' ? userActivities : adminActivities

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Activity Log" subtitle="ติดตามกิจกรรมของผู้ใช้และ Admin แบบ real-time" />

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-5">

          {/* ── Tabs ── */}
          <div className="flex border-b border-gray-200 mb-5">
            <button type="button" onClick={() => { setTab('user'); setTypeFilter('all'); setSearch('') }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-normal border-b-2 transition-all -mb-px ${tab === 'user' ? 'border-freshket-500 text-freshket-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              กิจกรรมผู้ใช้
              {tab === 'user' && userActivities.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-freshket-100 text-freshket-700">{userActivities.length}</span>
              )}
            </button>
            <button type="button" onClick={() => { setTab('admin'); setTypeFilter('all'); setSearch('') }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-normal border-b-2 transition-all -mb-px ${tab === 'admin' ? 'border-freshket-500 text-freshket-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              กิจกรรม Admin
              {tab === 'admin' && adminActivities.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-freshket-100 text-freshket-700">{adminActivities.length}</span>
              )}
            </button>
          </div>

          {/* ── Search + Filter ── */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'user' ? 'ค้นหาชื่อหรือหลักสูตร...' : 'ค้นหา...'}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {currentOptions.map(opt => (
                <button key={opt.value} type="button" onClick={() => setTypeFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${typeFilter === opt.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Activity list ── */}
          <div className="bg-white rounded-2xl border border-gray-100 divide-y-0">
            {currentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="size-12 text-gray-200 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
                <p className="text-sm">ไม่พบกิจกรรม</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 px-5">
                {tab === 'user'
                  ? (currentList as UserActivity[]).map(item => <UserActivityRow key={item.id} item={item} />)
                  : (currentList as AdminActivity[]).map(item => <AdminActivityRow key={item.id} item={item} />)
                }
              </div>
            )}
          </div>

          {!DEMO && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-700">
              <span className="font-bold">Live mode:</span> Activity Log อ่านจาก Firestore collection <code className="font-mono bg-amber-100 px-1 rounded">activityLog</code>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
