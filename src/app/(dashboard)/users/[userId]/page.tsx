'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { useAllUsers, useMyTrainingRecords } from '@/hooks/useFirestore'
import { canAccess, ROLE_LABELS, type UserRole } from '@/types/user'
import { STATUS_LABELS, STATUS_COLORS } from '@/types/tracking'
import { formatDate } from '@/lib/utils/dateFormatter'
import { getDemoMode } from '@/lib/demo/demoMode'
import { useMyPoints, usePointsLedger } from '@/hooks/usePoints'
import { getTier, getTierProgress } from '@/lib/utils/pointsCalc'
import { POINT_TIERS, POINT_EVENT_LABELS } from '@/types/points'

const DEMO_MODE = getDemoMode()

const ROLE_BADGE: Record<UserRole, string> = {
  super_admin: 'bg-orange-100 text-orange-700 border border-orange-200',
  manager:     'bg-purple-100 text-purple-700 border border-purple-200',
  team_lead:   'bg-blue-100 text-blue-700 border border-blue-200',
  sale:        'bg-freshket-100 text-freshket-700 border border-freshket-200',
}

const TEAM_LABELS: Record<string, string> = {
  'team-north': 'ทีมเหนือ',
  'team-south': 'ทีมใต้',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-freshket-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-rose-600'
}

function scoreBarColor(score: number): string {
  if (score >= 80) return '#00ce7c'
  if (score >= 60) return '#fbbf24'
  return '#f87171'
}

// ── Shadow data ────────────────────────────────────────────────────────────────
interface ShadowVisit {
  id: string
  restaurantName: string
  restaurantType: string
  date: Date
  seniorName: string
  learnings: string
}

const DEMO_SHADOW_VISITS: ShadowVisit[] = [
  {
    id: 'sv-1',
    restaurantName: 'ร้านครัวไทย สีลม',
    restaurantType: 'ร้านอาหาร',
    date: new Date('2025-03-15'),
    seniorName: 'พี่วิชาญ มณีรัตน์',
    learnings: 'ได้เรียนรู้เทคนิคการแนะนำเมนูให้ตรงกับโปรไฟล์ลูกค้า พี่วิชาญสอนให้สังเกตขนาดร้านและยอดสั่งซื้อก่อนเสนอแพ็กเกจ\n\nการสร้างความไว้วางใจต้องใช้เวลาอย่างน้อย 3 ครั้งในการเยี่ยมชม ได้ฝึกการพูดคุยแบบไม่เป็นทางการก่อนเข้าสู่การเสนอขาย ลูกค้ากลุ่มนี้ให้ความสำคัญกับความสม่ำเสมอของคุณภาพมากกว่าราคา',
  },
  {
    id: 'sv-2',
    restaurantName: 'โรงแรม แกรนด์ ไฮแอท เอราวัณ',
    restaurantType: 'โรงแรม 5 ดาว',
    date: new Date('2025-04-02'),
    seniorName: 'พี่สมชาย เจริญวงศ์',
    learnings: 'ลูกค้าระดับโรงแรม 5 ดาวให้ความสำคัญกับความสม่ำเสมอของคุณภาพและการจัดส่งตรงเวลา 100% พี่สมชายแสดงให้เห็นว่าการรู้จักหัวหน้าเชฟเป็นกุญแจสำคัญ\n\nควรเตรียม spec sheet ของสินค้าทุกรายการก่อนเข้าพบ ราคาไม่ใช่ปัจจัยหลัก แต่เป็นความน่าเชื่อถือและ service level ต้องเน้นการ response ภายใน 1 ชั่วโมงเสมอ',
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────
export default function UserReportPage() {
  const { userId } = useParams<{ userId: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'training' | 'roleplay' | 'shadow'>('profile')
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustPts, setAdjustPts] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustDone, setAdjustDone] = useState(false)

  const { data: allUsers, loading: usersLoading } = useAllUsers()
  const { data: records, loading: recordsLoading } = useMyTrainingRecords(userId)
  const { data: userPoints } = useMyPoints(userId)
  const { events: pointEvents } = usePointsLedger(userId)

  if (user && !canAccess(user.role, 'team_lead')) {
    router.replace('/sale')
    return null
  }

  const loading = usersLoading || recordsLoading
  const profile = allUsers.find((u) => u.uid === userId)

  // Training stats
  const completed = records.filter((r) => r.status === 'completed').length
  const inProgress = records.filter((r) => r.status === 'in_progress').length
  const failed = records.filter((r) => r.status === 'failed').length
  const notStarted = records.filter((r) => r.status === 'not_started').length
  const scores = records.filter((r) => r.score !== undefined && r.score !== null).map((r) => r.score!)
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text
    }
  }

  const handleAdjust = async () => {
    const pts = parseInt(adjustPts, 10)
    if (!pts || !adjustReason.trim()) return
    setAdjusting(true)
    try {
      if (DEMO_MODE) {
        await new Promise(r => setTimeout(r, 600))
      } else {
        const { getAuth } = await import('firebase/auth')
        const idToken = await getAuth().currentUser?.getIdToken()
        await fetch('/api/points/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, targetUserId: userId, points: pts, reason: adjustReason }),
        })
      }
      setAdjustDone(true)
      setTimeout(() => { setAdjustDone(false); setShowAdjust(false); setAdjustPts(''); setAdjustReason('') }, 1500)
    } finally {
      setAdjusting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <Header title="รายงานพนักงาน" />
        <div className="flex-1 flex items-center justify-center">
          <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <Header title="รายงานพนักงาน" />
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
          <svg className="size-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <p className="text-sm">ไม่พบข้อมูลพนักงาน</p>
          <button onClick={() => router.back()} className="text-sm text-freshket-600 hover:underline">
            ← กลับ
          </button>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: 'profile' as const,   label: 'Profile' },
    { id: 'training' as const,  label: 'Training Record' },
    { id: 'roleplay' as const,  label: 'Role Play' },
    { id: 'shadow' as const,    label: 'Shadow' },
  ]

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="รายงานพนักงาน" subtitle={profile.displayName} />

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-5">

          {/* Back + Share row */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              รายชื่อพนักงาน
            </button>

            <button
              onClick={handleShare}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-normal transition-all border ${
                copied
                  ? 'bg-freshket-100 text-freshket-700 border-freshket-200'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {copied ? (
                <>
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  คัดลอกลิงก์แล้ว!
                </>
              ) : (
                <>
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                  แชร์ลิงก์รายงาน
                </>
              )}
            </button>
          </div>

          {/* Profile card — always visible */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-md">
            <div className="p-6 md:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="size-16 rounded-2xl bg-freshket-100 border-2 border-freshket-200 flex items-center justify-center text-freshket-700 text-2xl font-bold shrink-0">
                  {profile.displayName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold text-gray-900">{profile.displayName}</h2>
                    {profile.nickname && <span className="text-sm text-gray-500">({profile.nickname})</span>}
                    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${ROLE_BADGE[profile.role]}`}>
                      {ROLE_LABELS[profile.role]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{profile.email}</p>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex mt-5 border-b border-gray-100 -mx-6 md:-mx-8 px-4 md:px-6">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
                      activeTab === tab.id
                        ? 'border-freshket-500 text-freshket-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Profile tab ── */}
          {activeTab === 'profile' && (
            <>
              {/* Info grid */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <p className="text-xs font-bold text-gray-400 mb-4">ข้อมูลพนักงาน</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                  <InfoItem label="รหัสพนักงาน" value={profile.employeeId} mono />
                  <InfoItem label="แผนก" value={profile.department} />
                  <InfoItem label="ตำแหน่ง" value={profile.position} />
                  <InfoItem label="ชื่อเล่น" value={profile.nickname} />
                  <InfoItem label="วันเริ่มงาน" value={profile.startDate ? formatDate(profile.startDate) : undefined} />
                  <InfoItem label="ทีม" value={profile.teamId ? (TEAM_LABELS[profile.teamId] ?? profile.teamId) : undefined} />
                </div>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="ผ่านแล้ว"   value={completed}      unit="วิชา"  color="text-freshket-600" bg="bg-freshket-100" />
                <StatCard label="ทั้งหมด"    value={records.length} unit="วิชา"  color="text-blue-600"     bg="bg-blue-50" />
                <StatCard label="ไม่ผ่าน"    value={failed}         unit="วิชา"  color="text-rose-600"     bg="bg-rose-50" />
                <StatCard
                  label="คะแนนเฉลี่ย"
                  value={avgScore ?? '—'}
                  unit={avgScore !== null ? 'คะแนน' : ''}
                  color={avgScore !== null ? scoreColor(avgScore) : 'text-gray-400'}
                  bg="bg-gray-50"
                />
              </div>

              {/* ── Points widget ─────────────────────────────────────────── */}
              {(() => {
                const total = userPoints?.totalPoints ?? 0
                const tier = getTier(total)
                const t = POINT_TIERS[tier]
                const prog = getTierProgress(total)
                const recentEvents = pointEvents.slice(0, 3)
                const isSA = user?.role === 'super_admin'
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-bold text-gray-400">คะแนนสะสม</p>
                      {isSA && (
                        <button
                          onClick={() => setShowAdjust(true)}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-freshket-100 text-freshket-700 hover:bg-freshket-200 transition-colors"
                        >
                          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          ปรับคะแนน
                        </button>
                      )}
                    </div>

                    <div className="flex items-end gap-3 mb-3">
                      <span className="text-3xl font-bold text-gray-900 tabular-nums">{total.toLocaleString()}</span>
                      <span className="text-sm text-gray-400 mb-0.5">pts</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${t.bg} ${t.color} border ${t.border}`}>
                        {t.icon} {t.labelTh}
                      </span>
                    </div>

                    <div className="mb-4">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${prog}%`, background: '#00ce7c' }} />
                      </div>
                    </div>

                    {recentEvents.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-400">ล่าสุด</p>
                        {recentEvents.map(ev => (
                          <div key={ev.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 truncate flex-1 pr-2">{POINT_EVENT_LABELS[ev.type]}: {ev.description.substring(0, 40)}{ev.description.length > 40 ? '…' : ''}</span>
                            <span className={`font-bold shrink-0 ${ev.points >= 0 ? 'text-freshket-600' : 'text-rose-500'}`}>
                              {ev.points >= 0 ? '+' : ''}{ev.points} pts
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}

          {/* ── Adjust Points Modal ────────────────────────────────────────────── */}
          {showAdjust && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-pop-in">
                {adjustDone ? (
                  <div className="text-center py-4">
                    <div className="size-12 bg-freshket-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="size-6 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <p className="font-bold text-gray-900">ปรับคะแนนสำเร็จ</p>
                  </div>
                ) : (
                  <>
                    <h3 className="font-bold text-gray-900 mb-1">ปรับคะแนน</h3>
                    <p className="text-xs text-gray-500 mb-5">ปรับคะแนนสำหรับ {profile.displayName}</p>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1.5">คะแนน (บวกหรือลบ)</label>
                        <input
                          type="number"
                          value={adjustPts}
                          onChange={e => setAdjustPts(e.target.value)}
                          placeholder="เช่น 50 หรือ -20"
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1.5">เหตุผล (แสดงให้ user เห็น)</label>
                        <textarea
                          value={adjustReason}
                          onChange={e => setAdjustReason(e.target.value)}
                          placeholder="เช่น โบนัสพิเศษ Best Performer เดือน มิ.ย."
                          rows={3}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={() => { setShowAdjust(false); setAdjustPts(''); setAdjustReason('') }}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={handleAdjust}
                        disabled={!adjustPts || !adjustReason.trim() || adjusting}
                        className="flex-1 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {adjusting ? 'กำลังบันทึก…' : 'ยืนยัน'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Training Record tab ── */}
          {activeTab === 'training' && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">ประวัติการฝึกอบรม</h3>
                <span className="text-xs text-gray-400">{records.length} รายการ</span>
              </div>
              {records.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-sm">ยังไม่มีประวัติการฝึกอบรม</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/60 border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500">วิชา</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500">สถานะ</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500">คะแนน</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden md:table-cell">วันที่สำเร็จ</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden md:table-cell">ครั้งที่สอบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 font-normal text-gray-800 max-w-[220px] truncate">{rec.courseTitle}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[rec.status]}`}>
                            {STATUS_LABELS[rec.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {rec.score !== undefined && rec.score !== null ? (
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <span className={`font-bold text-sm ${scoreColor(rec.score)}`}>{rec.score}</span>
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${rec.score}%`, background: scoreBarColor(rec.score) }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500 hidden md:table-cell whitespace-nowrap">
                          {rec.completedAt ? formatDate(rec.completedAt) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500 hidden md:table-cell">
                          {rec.attemptCount ?? 1} ครั้ง
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Role Play tab ── */}
          {activeTab === 'roleplay' && (
            <div className="bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center">
              <div className="size-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-4">
                <svg className="size-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <p className="font-bold text-gray-800 text-lg mb-2">Role Play</p>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 mb-3">
                อยู่ระหว่างพัฒนา
              </span>
              <p className="text-sm text-gray-400 max-w-xs">ฟีเจอร์นี้กำลังอยู่ในระหว่างการพัฒนา จะเปิดให้ใช้งานเร็วๆ นี้</p>
            </div>
          )}

          {/* ── Shadow tab ── */}
          {activeTab === 'shadow' && <ShadowSection />}

          <p className="text-xs text-gray-400 text-center pb-2">
            รายงานนี้แสดงเฉพาะผู้ที่มีสิทธิ์เข้าถึงระบบเท่านั้น
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Shadow Section ─────────────────────────────────────────────────────────────
function ShadowSection() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const visits: ShadowVisit[] = DEMO_MODE ? DEMO_SHADOW_VISITS : []

  if (visits.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center">
        <div className="size-14 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center mb-4">
          <svg className="size-7 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="font-bold text-gray-700 mb-1">ยังไม่มีข้อมูล Shadow</p>
        <p className="text-sm text-gray-400">เมื่อมีการบันทึก Shadow จะแสดงที่นี่</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {visits.map((visit) => {
        const isOpen = expandedId === visit.id
        return (
          <div
            key={visit.id}
            className={`border rounded-2xl overflow-hidden bg-white shadow-md transition-all duration-200 ${isOpen ? 'border-sky-200' : 'border-gray-100'}`}
          >
            <button
              onClick={() => setExpandedId(isOpen ? null : visit.id)}
              className="w-full text-left px-6 py-5 flex items-start gap-4"
            >
              <div className="size-11 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="size-5 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 leading-snug">{visit.restaurantName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">{visit.restaurantType}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">{formatDate(visit.date)}</span>
                </div>
                <p className="text-xs text-sky-500 font-normal mt-1">พี่เลี้ยง: {visit.seniorName}</p>
              </div>
              <svg
                className={`size-5 text-gray-400 shrink-0 mt-1 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {isOpen && (
              <div className="px-6 pb-6">
                <div className="border-t border-sky-100 pt-4">
                  <p className="text-xs font-bold text-sky-600 mb-3">สิ่งที่ได้เรียนรู้</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{visit.learnings}</p>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Small helper components ────────────────────────────────────────────────────

function InfoItem({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      {value
        ? <p className={`text-sm font-normal text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</p>
        : <p className="text-sm text-gray-300">—</p>
      }
    </div>
  )
}

function StatCard({
  label,
  value,
  unit,
  color,
  bg,
}: {
  label: string
  value: number | string
  unit: string
  color: string
  bg: string
}) {
  return (
    <div className={`rounded-2xl ${bg} p-4 flex flex-col gap-1`}>
      <p className="text-xs text-gray-500">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  )
}
