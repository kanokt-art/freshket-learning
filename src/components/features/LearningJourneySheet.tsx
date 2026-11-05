'use client'

import { useState } from 'react'
import { StarsDisplay } from '@/components/common/Stars'
import { FeedbackSheetFrame, SheetButton } from '@/components/features/FeedbackSheetFrame'
import { FeedbackReadSheet } from '@/components/features/FeedbackReadSheet'
import { toStars } from '@/lib/feedback/stars'
import { latestBySlot, slotOfReview, type LeadReview, type LeadSlot } from '@/lib/feedback/leadReviews'

// What a learner sees when they open "Feedback หลักสูตร": their course as a path of three steps, one below
// the other on a dotted line — their own Key Take Away, then their Team Lead's feedback, then their
// Manager's. A step that is done has a green tick, the next one waiting an orange dot, the rest a hollow
// ring. A feedback opens in full in the reading sheet; at the foot, they can rate the course themselves.

export type StepState = 'done' | 'next' | 'later'

/** Done, then the first one not done is "next", the rest "later". */
export function stepStates(done: readonly boolean[]): StepState[] {
  const firstOpen = done.findIndex((d) => !d)
  return done.map((d, i) => (d ? 'done' : i === firstOpen ? 'next' : 'later'))
}

/** The steps, one below the other on a dotted line. */
export function JourneyList({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <ol className={`relative space-y-4 before:absolute before:left-3 before:top-8 before:bottom-8 before:border-l-2 before:border-dashed before:border-gray-200 ${className}`}>
      {children}
    </ol>
  )
}

const dmy = (d?: Date | string) => {
  if (!d) return ''
  const t = d instanceof Date ? d : new Date(d)
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function Marker({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="size-6 rounded-full bg-freshket-600 text-white flex items-center justify-center ring-4 ring-white">
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
      </span>
    )
  }
  if (state === 'next') return <span className="block size-6 rounded-full bg-orange-500 ring-4 ring-white border-4 border-orange-200" />
  return <span className="block size-6 rounded-full bg-white border-2 border-gray-300 ring-4 ring-white" />
}

export function JourneyStep({ state, title, meta, children, action }: {
  state: StepState
  title: string
  meta: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <li className="relative pl-10">
      <span className="absolute left-0 top-6"><Marker state={state} /></span>
      <div className={`rounded-2xl p-4 ${state === 'later' ? 'bg-gray-50' : 'bg-[#f7f4ef]'} shadow-[0_1px_0_rgba(0,0,0,0.04)]`}>
        <p className={`text-base font-bold leading-snug ${state === 'later' ? 'text-gray-500' : 'text-gray-900'}`}>{title}</p>
        <p className="text-xs text-gray-500 mt-1">{meta}</p>
        {children && <div className="mt-2.5">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </li>
  )
}

const SLOT_TITLE: Record<LeadSlot, string> = { team_lead: 'Feedback จาก Team Lead', manager: 'Feedback จาก Manager' }

export function LearningJourneySheet({
  courseTitle, takeaway, hasTakeAwayStep, reviews, finished, person, onWriteTakeAway, onRateCourse, onClose, inline = false,
}: {
  courseTitle: string
  /** What the learner wrote as their Key Take Away ('' when not yet). */
  takeaway: string
  /** Does this course ask for a Key Take Away at all. */
  hasTakeAwayStep: boolean
  reviews: readonly LeadReview[]
  /** Finished the course: they may rate it. */
  finished: boolean
  person?: { name: string; photoURL?: string | null }
  onWriteTakeAway?: () => void
  onRateCourse: () => void
  onClose: () => void
  /** In the page (a computer): comments shown in full, no card over the page. */
  inline?: boolean
}) {
  const [reading, setReading] = useState<LeadReview | null>(null)
  const latest = latestBySlot(reviews)
  const wrote = !!takeaway.trim()

  const states = stepStates([hasTakeAwayStep ? wrote : true, !!latest.team_lead, !!latest.manager])
  const stateOf = (i: number) => states[i]

  const reviewStep = (slot: LeadSlot, i: number) => {
    const r = latest[slot]
    const stars = r ? toStars(r.score) : null
    return (
      <JourneyStep
        key={slot}
        state={stateOf(i)}
        title={SLOT_TITLE[slot]}
        meta={r ? [r.leadName, dmy(r.updatedAt)].filter(Boolean).join(' · ') : `รอความเห็นจาก ${slot === 'manager' ? 'Manager' : 'Team Lead'}`}
        action={r && !inline ? (
          <button type="button" onClick={() => setReading(r)} className="text-sm font-bold text-freshket-700 hover:underline">อ่านแบบเต็ม</button>
        ) : undefined}
      >
        {r && (
          <div className="space-y-1.5">
            {stars !== null && <StarsDisplay value={stars} />}
            {r.comment?.trim() && <p className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap ${inline ? '' : 'line-clamp-3'}`}>{r.comment.trim()}</p>}
          </div>
        )}
      </JourneyStep>
    )
  }

  if (reading) {
    return (
      <FeedbackReadSheet
        title={SLOT_TITLE[slotOfReview(reading)]}
        person={person}
        courseTitle={courseTitle}
        leadName={reading.leadName}
        dateText={dmy(reading.updatedAt)}
        rating={toStars(reading.score)}
        comment={reading.comment}
        onClose={() => setReading(null)}
      />
    )
  }

  return (
    <FeedbackSheetFrame
      inline={inline}
      onClose={onClose}
      footer={finished
        ? <SheetButton onClick={onRateCourse}>ให้คะแนนหลักสูตรนี้</SheetButton>
        : <p className="text-center text-xs text-gray-400">ให้คะแนนหลักสูตรได้หลังเรียนจบ</p>}
    >
      <div className="text-left">
        <p className="text-sm text-gray-500 pr-8">ความคืบหน้าของคุณ</p>
        <h2 className="text-2xl font-extrabold text-gray-900 leading-snug mt-0.5 pr-8">{courseTitle}</h2>

        <JourneyList className="mt-6">
          <JourneyStep
            state={stateOf(0)}
            title="Key Take Away ของคุณ"
            meta={!hasTakeAwayStep ? 'หลักสูตรนี้ไม่มี Key Take Away' : wrote ? 'เขียนแล้ว' : 'ยังไม่ได้เขียน'}
            action={hasTakeAwayStep && !wrote && onWriteTakeAway ? (
              <button type="button" onClick={onWriteTakeAway} className="px-4 py-2 rounded-full bg-freshket-600 text-white text-sm font-bold hover:bg-freshket-700 transition-all duration-150">
                เขียน Key Take Away
              </button>
            ) : undefined}
          >
            {wrote && <p className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap ${inline ? '' : 'line-clamp-3'}`}>{takeaway.trim()}</p>}
          </JourneyStep>
          {reviewStep('team_lead', 1)}
          {reviewStep('manager', 2)}
        </JourneyList>
      </div>
    </FeedbackSheetFrame>
  )
}
