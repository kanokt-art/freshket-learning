'use client'

import { StarsDisplay } from '@/components/common/Stars'
import { Chip, FeedbackSheetFrame, SheetButton } from '@/components/features/FeedbackSheetFrame'

// Reading what a team lead or manager wrote about a learner's course: a big title, the stars large and
// centred, who said it and when, the comment on a soft card, and a big "Done" button. Opened the same way
// by a learner (from the notification), a team lead, a manager and a super_admin.
export function FeedbackReadSheet({ title = 'ความเห็นจากหัวหน้า', person, courseTitle, leadName, dateText, rating, comment, onClose }: {
  title?: string
  /** Who the feedback is about. */
  person?: { name: string; photoURL?: string | null; sub?: string }
  courseTitle?: string
  leadName?: string
  dateText?: string
  rating: number | null
  comment?: string
  onClose: () => void
}) {
  const text = comment?.trim()
  return (
    <FeedbackSheetFrame onClose={onClose} footer={<SheetButton onClick={onClose}>ปิด</SheetButton>}>
      <h2 className="text-xl font-extrabold text-gray-900 leading-snug px-2">{title}</h2>

      {rating !== null && (
        <div className="mt-5 flex justify-center">
          <StarsDisplay value={rating} size="lg" />
        </div>
      )}

      {(leadName || dateText) && (
        <p className="mt-3 text-sm text-gray-400">{[leadName, dateText].filter(Boolean).join(' · ')}</p>
      )}

      {(person || courseTitle) && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {person && <Chip>{person.name}</Chip>}
          {courseTitle && <Chip>{courseTitle}</Chip>}
        </div>
      )}

      {text ? (
        <div className="mt-6 rounded-2xl bg-gray-50 px-4 py-4 text-left">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>
      ) : rating !== null ? (
        <p className="mt-6 text-sm text-gray-400">ไม่มีข้อความเพิ่มเติม</p>
      ) : null}
    </FeedbackSheetFrame>
  )
}
