'use client'

import { useState, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/layout/Header'
import { usePointsLedger, useLeaderboard, usePointsThisMonth, useMyPoints } from '@/hooks/usePoints'
import { getTier, getTierProgress, getPointsToNextTier, CATEGORY_BASE_POINTS } from '@/lib/utils/pointsCalc'
import {
  POINT_TIERS, POINT_EVENT_LABELS, POINT_EVENT_COLORS,
  type PointEventType,
} from '@/types/points'

// ── Tier badge ────────────────────────────────────────────────────────────────
function TierBadge({ points, size = 'md' }: { points: number; size?: 'sm' | 'md' | 'lg' }) {
  const tier = getTier(points)
  const t = POINT_TIERS[tier]
  const sizes = { sm: 'text-xs px-2 py-0.5', md: 'text-xs px-3 py-1', lg: 'text-sm px-4 py-1.5' }
  return (
    <span className={`inline-flex items-center gap-1 font-bold rounded-full ${sizes[size]} ${t.bg} ${t.color} border ${t.border}`}>
      {t.icon} {t.labelTh}
    </span>
  )
}

// ── Event type icon ───────────────────────────────────────────────────────────
function EventIcon({ type }: { type: PointEventType }) {
  const paths: Record<PointEventType, string> = {
    course_complete:      'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342',
    score_bonus:          'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
    speed_bonus:          'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
    first_attempt_bonus:  'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    mandatory_bonus:      'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
    duration_bonus:       'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    key_takeaway:         'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
    challenge_complete:   'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0',
    challenge_rank_bonus: 'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0',
    admin_adjust:         'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  }
  const colors = POINT_EVENT_COLORS[type]
  return (
    <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${colors}`}>
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        {paths[type].split(' M').map((segment, i) => (
          <path key={i} strokeLinecap="round" strokeLinejoin="round" d={i === 0 ? segment : 'M' + segment} />
        ))}
      </svg>
    </div>
  )
}

// ── Rank medal ────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>
  if (rank === 2) return <span className="text-lg">🥈</span>
  if (rank === 3) return <span className="text-lg">🥉</span>
  return <span className="text-xs font-bold text-gray-400 w-7 text-center">#{rank}</span>
}

// ── Format date ───────────────────────────────────────────────────────────────
function fmtDate(d: Date) {
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ── Guide section ─────────────────────────────────────────────────────────────
function GuideRow({ label, pts, note }: { label: string; pts: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-800">{label}</p>
        {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
      </div>
      <span className="text-sm font-bold text-freshket-600 shrink-0">{pts}</span>
    </div>
  )
}

function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-bold text-gray-800">{title}</span>
        <svg
          className={`size-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="px-5 pb-4 bg-white">{children}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PointsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'history' | 'leaderboard' | 'guide'>('history')
  const [lbScope, setLbScope] = useState<'team' | 'company'>('company')

  const { data: userPoints, loading: ptLoading } = useMyPoints(user?.uid)
  const { events, loading: evLoading } = usePointsLedger(user?.uid)
  const { entries, loading: lbLoading } = useLeaderboard(lbScope === 'team' ? user?.teamId : undefined)
  const thisMonth = usePointsThisMonth(events)

  const totalPoints = userPoints?.totalPoints ?? 0
  const tier = getTier(totalPoints)
  const tierInfo = POINT_TIERS[tier]
  const progress = getTierProgress(totalPoints)
  const toNext = getPointsToNextTier(totalPoints)

  const myRank = useMemo(
    () => entries.find(e => e.userId === user?.uid)?.rank ?? null,
    [entries, user?.uid],
  )

  const tabs = [
    { key: 'history' as const,     label: 'ประวัติคะแนน' },
    { key: 'leaderboard' as const, label: 'Leaderboard' },
    { key: 'guide' as const,       label: 'วิธีการคิดคะแนน' },
  ]

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="คะแนนสะสม" />

      <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">

      {/* ── Hero card ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <div className="flex items-start gap-6">
            {/* Points total */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-400 mb-1">คะแนนสะสม</p>
              <div className="flex items-end gap-3 mb-3">
                {ptLoading ? (
                  <div className="h-12 w-32 bg-gray-100 rounded-xl animate-pulse" />
                ) : (
                  <span className="text-5xl font-bold text-gray-900 tabular-nums leading-none">
                    {totalPoints.toLocaleString()}
                  </span>
                )}
                <span className="text-lg text-gray-400 mb-1">pts</span>
                <TierBadge points={totalPoints} size="lg" />
              </div>

              {/* Tier progress */}
              <div className="space-y-1.5 max-w-md">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {tier !== 'platinum' ? (
                      <>ต้องการอีก <span className="font-bold text-gray-700">{toNext?.toLocaleString()} pts</span> เพื่อ <span className={`font-bold ${POINT_TIERS[tier === 'bronze' ? 'silver' : tier === 'silver' ? 'gold' : 'platinum'].color}`}>{POINT_TIERS[tier === 'bronze' ? 'silver' : tier === 'silver' ? 'gold' : 'platinum'].labelTh}</span></>
                    ) : (
                      <span className="text-freshket-600 font-bold">ระดับสูงสุด — Platinum!</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400">{progress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, background: '#00ce7c' }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{tierInfo.min.toLocaleString()}</span>
                  <span>{tierInfo.max === Infinity ? '3,000+' : tierInfo.max.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-3 shrink-0">
              <div className="bg-slate-50 rounded-2xl px-4 py-3 text-center min-w-[80px]">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{thisMonth.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">เดือนนี้</p>
              </div>
              {myRank && (
                <div className="bg-slate-50 rounded-2xl px-4 py-3 text-center min-w-[80px]">
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">#{myRank}</p>
                  <p className="text-xs text-gray-400 mt-0.5">อันดับ</p>
                </div>
              )}
            </div>
          </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 mb-4">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-normal transition-all border-b-2 ${
              activeTab === t.key
                ? 'border-freshket-500 text-freshket-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">

        {/* ── History tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {evLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <div className="size-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-gray-100 rounded w-2/3 animate-pulse" />
                      <div className="h-3 bg-gray-100 rounded w-1/3 animate-pulse" />
                    </div>
                    <div className="h-4 w-12 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <p className="text-sm">ยังไม่มีประวัติคะแนน</p>
                <p className="text-xs mt-1">เริ่มเรียนหลักสูตรเพื่อสะสมคะแนน</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {events.map(ev => (
                  <div key={ev.id} className="flex items-center gap-3 px-5 py-3.5">
                    <EventIcon type={ev.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{ev.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{POINT_EVENT_LABELS[ev.type]} · {fmtDate(ev.createdAt)}</p>
                    </div>
                    <span className={`text-sm font-bold shrink-0 ${ev.points >= 0 ? 'text-freshket-600' : 'text-rose-500'}`}>
                      {ev.points >= 0 ? '+' : ''}{ev.points} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Leaderboard tab ──────────────────────────────────────────────────── */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">
            {/* Scope toggle */}
            <div className="flex gap-2">
              {(['company', 'team'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setLbScope(s)}
                  className={`px-4 py-2 rounded-xl text-sm font-normal transition-all ${
                    lbScope === s
                      ? 'bg-freshket-100 text-freshket-700'
                      : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {s === 'company' ? 'ทั้งบริษัท' : 'ทีมของฉัน'}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {lbLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3 items-center">
                      <div className="w-7 h-5 bg-gray-100 rounded animate-pulse" />
                      <div className="size-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                      <div className="flex-1 h-4 bg-gray-100 rounded animate-pulse" />
                      <div className="w-16 h-4 bg-gray-100 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">ยังไม่มีข้อมูล</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {entries.map(entry => {
                    const isMe = entry.userId === user?.uid
                    return (
                      <div
                        key={entry.userId}
                        className={`flex items-center gap-3 px-5 py-3.5 ${isMe ? 'bg-freshket-50' : ''}`}
                      >
                        <div className="w-7 flex justify-center shrink-0">
                          <RankBadge rank={entry.rank} />
                        </div>
                        {entry.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={entry.photoURL} alt="" className="size-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="size-8 rounded-full bg-freshket-100 flex items-center justify-center text-freshket-700 text-sm font-bold shrink-0">
                            {entry.displayName.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${isMe ? 'text-freshket-700' : 'text-gray-800'}`}>
                            {entry.displayName}{entry.nickname ? ` (${entry.nickname})` : ''}{isMe ? ' (คุณ)' : ''}
                          </p>
                          {entry.teamName && <p className="text-xs text-gray-400 truncate">{entry.teamName}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-800 tabular-nums">{entry.totalPoints.toLocaleString()} pts</p>
                          <TierBadge points={entry.totalPoints} size="sm" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Guide tab ────────────────────────────────────────────────────────── */}
        {activeTab === 'guide' && (
          <div className="space-y-3">
            {/* Tier overview */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-sm font-bold text-gray-800 mb-4">ระดับสมาชิก</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(Object.entries(POINT_TIERS) as [string, typeof POINT_TIERS[keyof typeof POINT_TIERS]][]).map(([k, t]) => (
                  <div key={k} className={`rounded-2xl border p-4 text-center ${t.bg} ${t.border}`}>
                    <div className="text-2xl mb-1">{t.icon}</div>
                    <p className={`text-sm font-bold ${t.color}`}>{t.labelTh}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t.max === Infinity ? `${t.min.toLocaleString()}+ pts` : `${t.min.toLocaleString()}–${t.max.toLocaleString()} pts`}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <GuideSection title="📚 คะแนนจากการเรียนหลักสูตร">
              <GuideRow label="Product Knowledge" pts={`${CATEGORY_BASE_POINTS.product} pts`} note="คะแนนฐานก่อนคูณตัวคูณ" />
              <GuideRow label="Sales Skill" pts={`${CATEGORY_BASE_POINTS.sales_skill} pts`} />
              <GuideRow label="Leadership" pts={`${CATEGORY_BASE_POINTS.leadership} pts`} />
              <GuideRow label="Compliance" pts={`${CATEGORY_BASE_POINTS.compliance} pts`} />
              <GuideRow label="Onboarding" pts={`${CATEGORY_BASE_POINTS.onboarding} pts`} />
              <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                <p className="text-xs font-bold text-gray-600 mb-2">ตัวคูณตามคะแนน Test</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <div className="flex justify-between"><span>คะแนน ≥ 90%</span><span className="font-bold text-freshket-600">×1.5</span></div>
                  <div className="flex justify-between"><span>คะแนน 80–89%</span><span className="font-bold text-yellow-600">×1.3</span></div>
                  <div className="flex justify-between"><span>คะแนน 70–79%</span><span className="font-bold text-blue-600">×1.1</span></div>
                  <div className="flex justify-between"><span>คะแนน 60–69%</span><span className="font-bold text-gray-600">×1.0</span></div>
                  <div className="flex justify-between"><span>คะแนน &lt; 60%</span><span className="font-bold text-rose-500">×0.5</span></div>
                </div>
              </div>
            </GuideSection>

            <GuideSection title="⚡ โบนัสพิเศษ">
              <GuideRow label="หลักสูตรบังคับ (Mandatory)" pts="+25 pts" note="ทุกหลักสูตรที่มี isRequired" />
              <GuideRow label="ผ่านรอบแรก (First Attempt)" pts="+10 pts" note="ผ่านโดยไม่ต้องสอบซ้ำ" />
              <GuideRow label="หลักสูตรยาว ≥60 นาที" pts="+10 pts" />
              <GuideRow label="หลักสูตรยาว ≥120 นาที" pts="+20 pts" />
              <GuideRow label="ส่งก่อนกำหนด 3–6 วัน" pts="+15 pts" note="Speed Bonus" />
              <GuideRow label="ส่งก่อนกำหนด ≥7 วัน" pts="+30 pts" note="Speed Bonus สูงสุด" />
              <GuideRow label="ส่ง Key Takeaway" pts="+15 pts" note="ทุกหลักสูตรที่มี Key Takeaway" />
            </GuideSection>

            <GuideSection title="🏆 Challenge Course">
              <GuideRow
                label="สำเร็จ Challenge"
                pts="Base × Multiplier (1.5×–3×)"
                note="Super Admin กำหนด multiplier ต่อ challenge"
              />
              <GuideRow label="อันดับ #1 ในช่วงเวลา Challenge" pts="+200 pts" />
              <GuideRow label="อันดับ #2" pts="+150 pts" />
              <GuideRow label="อันดับ #3" pts="+100 pts" />
              <GuideRow label="Top 25% ผู้เข้าแข่งขัน" pts="+50 pts" />
              <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-xs text-amber-700">
                  <span className="font-bold">หมายเหตุ:</span> อันดับคิดจาก คะแนน Test × เวลาที่ใช้ ในช่วงเวลา Challenge
                </p>
              </div>
            </GuideSection>

            <GuideSection title="⚙️ การปรับคะแนนโดย Admin">
              <GuideRow label="โบนัสพิเศษจาก Admin" pts="กำหนดเอง" note="รางวัลพิเศษ / Best Performer / ฯลฯ" />
              <GuideRow label="การหักคะแนน" pts="ค่าลบ" note="เฉพาะกรณีที่จำเป็น มีเหตุผลกำกับเสมอ" />
              <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-gray-500">การปรับคะแนนโดย Admin จะปรากฎในประวัติคะแนนของคุณพร้อมเหตุผล เพื่อความโปร่งใส</p>
              </div>
            </GuideSection>

            {/* Example calculation */}
            <div className="bg-freshket-50 border border-freshket-200 rounded-2xl p-5">
              <p className="text-sm font-bold text-freshket-700 mb-3">ตัวอย่างการคิดคะแนน</p>
              <p className="text-xs text-gray-600 mb-3">หลักสูตร Sales Skill (Mandatory, 90 นาที) — คะแนน 92% — ส่งก่อนกำหนด 8 วัน — รอบแรก</p>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex justify-between"><span>Base (Sales Skill)</span><span className="font-bold">60 pts</span></div>
                <div className="flex justify-between"><span>Score ×1.5 (≥90%)</span><span className="font-bold">+30 pts → 90</span></div>
                <div className="flex justify-between"><span>Duration ≥60 นาที</span><span className="font-bold">+10 pts</span></div>
                <div className="flex justify-between"><span>Mandatory Bonus</span><span className="font-bold">+25 pts</span></div>
                <div className="flex justify-between"><span>Speed ≥7 วัน</span><span className="font-bold">+30 pts</span></div>
                <div className="flex justify-between"><span>First Attempt</span><span className="font-bold">+10 pts</span></div>
                <div className="flex justify-between border-t border-freshket-200 pt-1.5 mt-1.5">
                  <span className="font-bold text-freshket-700">รวม</span>
                  <span className="font-bold text-freshket-700">165 pts</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}
