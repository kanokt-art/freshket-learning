export type TrainingStatus = 'not_started' | 'in_progress' | 'completed' | 'failed'

export interface TrainingRecord {
  id: string
  userId: string
  memberName?: string
  courseId: string
  courseTitle: string
  status: TrainingStatus
  score?: number             // 0-100
  passScore?: number         // minimum pass threshold
  // Scores for the course's designated pre-test/post-test quiz lessons (see
  // CourseLesson.quizRole) — separate from `score`, which is whichever
  // assessment's own take-flow last graded (a lesson quiz with no pre/post
  // role, or the legacy course-level assessment before that concept was
  // removed). Set only by a super_admin manual override today
  // (POST /api/training-records/override); nothing else writes them yet.
  preTestScore?: number
  postTestScore?: number
  startedAt?: Date
  completedAt?: Date
  updatedAt?: Date           // last write (set by CSV import / status change)
  dueDate?: Date
  attemptCount: number
  source: 'manual' | 'csv_import' | 'google_form'
  importBatchId?: string     // links to CSVImport batch
  // Per-lesson progress — written by the learner as they work through a course.
  // Powers the "12/16 Lessons" counts and progress rings on the learner dashboard,
  // and lets admins see real progress instead of only a coarse status.
  completedLessonIds?: string[]
  totalLessons?: number
}

// Fraction of a course's lessons the learner has completed (0-100).
// Falls back to the coarse status when a course has no lessons defined.
export function recordProgressPercent(record?: TrainingRecord): number {
  if (!record) return 0
  if (record.status === 'completed') return 100
  const total = record.totalLessons ?? 0
  if (total > 0) {
    const done = record.completedLessonIds?.length ?? 0
    return Math.min(100, Math.round((done / total) * 100))
  }
  return record.status === 'in_progress' ? 50 : 0
}

export interface CSVImportError {
  row: number
  field: string
  message: string
  rawValue: string
}

export const STATUS_LABELS: Record<TrainingStatus, string> = {
  not_started: 'ยังไม่เริ่ม',
  in_progress: 'กำลังเรียน',
  completed: 'ผ่านแล้ว',
  failed: 'ไม่ผ่าน',
}

export const STATUS_COLORS: Record<TrainingStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-brand-green',
  failed: 'bg-red-100 text-red-700',
}
