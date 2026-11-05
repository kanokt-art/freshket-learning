'use client'

import { createPortal } from 'react-dom'
import { ShadowPushButton } from '@/components/features/ShadowPushButton'
import { useMentorName } from '@/hooks/useMentorName'
import type { ShadowRecord } from '@/types/shadow'

// One Shadow Visit read from the side: a drawer that slides in from the right over whatever is open (the member's
// window on the admin home, the Employees page), so the list of visits keeps its place underneath and the visit
// is easy to read in full. A super_admin has "Push ไป Slack" in its header.

const SEGMENT_STYLE: Record<string, string> = {
  'Mini Chain':  'bg-blue-100 text-blue-700',
  'Stand alone': 'bg-amber-100 text-amber-700',
  'Chain':       'bg-purple-100 text-purple-700',
}
const PERSONA_STYLE: Record<string, string> = {
  'Chef':       'bg-freshket-100 text-freshket-700',
  'Owner':      'bg-sky-100 text-sky-700',
  'Purchasing': 'bg-indigo-100 text-indigo-700',
  'Manager':    'bg-orange-100 text-orange-700',
}

const EVAL_FIELDS: { key: keyof ShadowRecord; label: string; color: string }[] = [
  { key: 'opening',            label: 'Opening / Hook',       color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  { key: 'interestPoint',      label: 'Interest Point',       color: 'bg-blue-100 text-blue-700 border border-blue-200' },
  { key: 'customerPain',       label: 'Customer Pain',        color: 'bg-rose-100 text-rose-700 border border-rose-200' },
  { key: 'diagnosticApproach', label: 'Diagnostic Approach',  color: 'bg-purple-100 text-purple-700 border border-purple-200' },
  { key: 'closingNextStep',    label: 'Closing / Next Step',  color: 'bg-amber-100 text-amber-700 border border-amber-200' },
  { key: 'bestPractice',       label: 'Best Practice',        color: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
  { key: 'beyondClassroom',    label: 'Beyond Classroom',     color: 'bg-teal-100 text-teal-700 border border-teal-200' },
]

export function ShadowVisitDrawer({ record, onClose }: { record: ShadowRecord; onClose: () => void }) {
  const mentorName = useMentorName()
  if (typeof document === 'undefined') return null

  const dateStr = record.createdAt
    ? new Date(record.createdAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  // Portalled to the body so it sits above the window it was opened from, and a click in it does not close
  // that window (its own backdrop closes only the drawer).
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-900/40" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={record.storeName}
        className="relative w-full sm:max-w-lg h-full bg-white shadow-2xl flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 py-5 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">Shadow Visit · {dateStr}</p>
              <h2 className="text-lg font-extrabold text-gray-900 leading-snug mt-0.5">{record.storeName}</h2>
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
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${SEGMENT_STYLE[record.segment] ?? 'bg-gray-100 text-gray-600'}`}>{record.segment}</span>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${PERSONA_STYLE[record.persona] ?? 'bg-gray-100 text-gray-600'}`}>{record.persona}</span>
            {record.ratingScore != null && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-700">{record.ratingScore}/5 ★</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2.5">
            Mentor: <span className="font-bold text-gray-700">{mentorName(record)}</span>
            {record.mentorPosition && <span className="text-gray-400"> · {record.mentorPosition}</span>}
          </p>
          <div className="mt-3"><ShadowPushButton record={record} /></div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {record.evaluationFeedback && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <p className="text-xs font-bold text-blue-600 mb-1.5">Evaluator Feedback</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{record.evaluationFeedback}</p>
            </div>
          )}
          {EVAL_FIELDS.map((f) => {
            const val = record[f.key] as string | undefined
            if (!val) return null
            return (
              <div key={f.key} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${f.color}`}>{f.label}</span>
                </div>
                <div className="px-4 py-3 space-y-1">
                  {val.split('\n').map((line, i) => (
                    <p key={i} className="text-sm text-gray-700 leading-relaxed">{line || ' '}</p>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
