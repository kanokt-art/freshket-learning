'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { StarsDisplay } from '@/components/common/Stars'
import { JourneyList, JourneyStep } from '@/components/features/LearningJourneySheet'
import { useCourses, useFirestoreList } from '@/hooks/useFirestore'
import { authedFetch } from '@/lib/api/authedFetch'
import { formatElapsed } from '@/lib/assessment/briefing'
import { getDemoMode } from '@/lib/demo/demoMode'
import { toStars } from '@/lib/feedback/stars'
import { journeyStates, latestBySlot, type LeadReview, type LeadSlot } from '@/lib/feedback/leadReviews'
import { MOCK_TAKEAWAYS } from '@/lib/utils/mockData'

// A member's course, read from the side by their Team Lead, Manager or a super_admin: what the member wrote as
// their Key Take Away, then the Team Lead's feedback, then the Manager's — the same path the member sees. A
// drawer on the right, over whatever is open, so the list underneath keeps its place.

const DEMO_MODE = getDemoMode()

const dmy = (d?: Date | string) => {
  if (!d) return ''
  const t = d instanceof Date ? d : new Date(d)
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

const SLOT_LABEL: Record<LeadSlot, string> = { team_lead: 'Team Lead', manager: 'Manager' }

interface QuizAttempt {
  id: string
  assessmentTitle: string
  step?: 'pre' | 'post'
  attemptNumber?: number
  score: number
  passingScore?: number
  passed: boolean
  elapsedMs?: number
  limitMs?: number
  timedOut?: boolean
  autoSubmitted?: boolean
  createdAt?: string
}

const STEP_LABEL = { pre: 'ก่อนเรียน', post: 'หลังเรียน' } as const

const dmyHm = (d?: string) => {
  if (!d) return ''
  const t = new Date(d)
  return isNaN(t.getTime()) ? '' : t.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function MemberCourseDrawer({ memberUid, memberName, courseId, courseTitle, onClose }: {
  memberUid: string
  memberName: string
  courseId: string
  courseTitle: string
  onClose: () => void
}) {
  const live = !DEMO_MODE && !!memberUid && !!courseId
  const takeawayDocs = useFirestoreList<{ courseId?: string; text?: string }>(
    'takeaways',
    [{ type: 'where', field: 'uid', op: '==', value: memberUid }],
    live,
  )
  const reviewDocs = useFirestoreList<LeadReview>(
    'courseFeedback',
    [{ type: 'where', field: 'memberUid', op: '==', value: memberUid }, { type: 'where', field: 'courseId', op: '==', value: courseId }],
    live,
  )

  const takeaway = useMemo(() => {
    if (DEMO_MODE) return (MOCK_TAKEAWAYS[`${memberUid}_${courseId}`] ?? '').trim()
    return (takeawayDocs.data.find((d) => d.courseId === courseId)?.text ?? '').trim()
  }, [takeawayDocs.data, memberUid, courseId])

  const reviews = useMemo<LeadReview[]>(() => {
    if (!DEMO_MODE) return reviewDocs.data
    // Demo mode has no database: one sample Team Lead comment so the drawer can be seen.
    return [{ leadUid: 'demo-tl', leadRole: 'team_lead', leadName: 'Pataranuch (Tao) Suyavech', score: 4, updatedAt: new Date('2026-11-03T09:00:00'), comment: 'ตั้งใจเรียนดีมาก ลองเอาไปใช้กับลูกค้าจริงดูนะ' }]
  }, [reviewDocs.data])

  // Every try at this course's quiz: which one, the score, how long it took. Read through the server (the
  // attempts table is an audit trail the browser cannot read); nothing is shown when there are none.
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  useEffect(() => {
    if (!live) return
    let cancelled = false
    authedFetch(`/api/assessment/attempts?uid=${encodeURIComponent(memberUid)}&courseId=${encodeURIComponent(courseId)}`)
      .then(async (res) => (res.ok ? ((await res.json()) as { attempts?: QuizAttempt[] }).attempts ?? [] : []))
      .then((list) => { if (!cancelled) setAttempts(list) })
      .catch(() => { if (!cancelled) setAttempts([]) })
    return () => { cancelled = true }
  }, [live, memberUid, courseId])

  const latest = latestBySlot(reviews)
  // A course without a Key Take Away has no such step.
  const { data: allCourses } = useCourses()
  const hasTakeAway = !!allCourses.find((c) => c.id === courseId)?.hasKeyTakeAway
  const states = journeyStates({ takeaway: hasTakeAway ? !!takeaway : true, teamLead: !!latest.team_lead, manager: !!latest.manager })
  const loading = live && (takeawayDocs.loading || reviewDocs.loading)

  const reviewStep = (slot: LeadSlot, i: number) => {
    const r = latest[slot]
    const stars = r ? toStars(r.score) : null
    return (
      <JourneyStep
        key={slot}
        state={states[i]}
        title={`Feedback จาก ${SLOT_LABEL[slot]}`}
        meta={r ? [r.leadName, dmy(r.updatedAt)].filter(Boolean).join(' · ') : `ยังไม่มีความเห็นจาก ${SLOT_LABEL[slot]}`}
      >
        {r && (
          <div className="space-y-1.5">
            {stars !== null && <StarsDisplay value={stars} />}
            {r.comment?.trim() && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{r.comment.trim()}</p>}
          </div>
        )}
      </JourneyStep>
    )
  }

  if (typeof document === 'undefined') return null
  // Portalled to the body so it sits above the window it was opened from, and a click in it does not
  // close that window (its own backdrop closes only the drawer).
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-900/40" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={courseTitle}
        className="relative w-full sm:max-w-md h-full bg-white shadow-2xl flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-start gap-3 px-6 py-5 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500">{memberName}</p>
            <h2 className="text-lg font-extrabold text-gray-900 leading-snug mt-0.5">{courseTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="size-9 shrink-0 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-all duration-150"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">กำลังโหลด…</p>
          ) : (
            <JourneyList>
              {hasTakeAway && <JourneyStep state={states[0]} title="Key Take Away" meta={takeaway ? 'จากพนักงาน' : 'พนักงานยังไม่ได้เขียน'}>
                {takeaway && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{takeaway}</p>}
              </JourneyStep>}
              {reviewStep('team_lead', 1)}
              {reviewStep('manager', 2)}
            </JourneyList>
          )}

          {attempts.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-bold text-gray-900">ประวัติการทำแบบทดสอบ</h3>
              <p className="text-xs text-gray-500 mt-0.5">ทำไป {attempts.length} ครั้ง · บันทึกทุกครั้ง</p>
              <ul className="mt-3 space-y-2">
                {attempts.map((a, i) => (
                  <li key={a.id} className="rounded-xl border border-gray-100 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900 min-w-0 truncate">
                        ครั้งที่ {a.attemptNumber ?? i + 1}
                        {a.step && <span className="font-normal text-gray-500">{` · ${STEP_LABEL[a.step]}`}</span>}
                      </p>
                      {a.timedOut ? (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 shrink-0">หมดเวลา</span>
                      ) : (
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0 ${a.passed ? 'bg-freshket-100 text-freshket-700' : 'bg-rose-50 text-rose-600'}`}>
                          {a.score}% · {a.passed ? 'ผ่าน' : 'ไม่ผ่าน'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {[
                        dmyHm(a.createdAt),
                        a.elapsedMs !== undefined ? `ใช้เวลา ${formatElapsed(a.elapsedMs)}${a.limitMs ? ` / ${formatElapsed(a.limitMs)}` : ''}` : '',
                        a.autoSubmitted ? 'ส่งอัตโนมัติ (สลับหน้าจอ)' : '',
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-gray-100">
          <Link
            href={`/manager?user=${encodeURIComponent(memberUid)}&tab=history`}
            className="block w-full text-center py-3 rounded-full bg-freshket-600 text-white text-sm font-bold shadow-md hover:bg-freshket-700 transition-all duration-150"
          >
            ให้ / แก้ Feedback ในหน้าทีม
          </Link>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
