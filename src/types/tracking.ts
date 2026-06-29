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
  startedAt?: Date
  completedAt?: Date
  dueDate?: Date
  attemptCount: number
  source: 'manual' | 'csv_import' | 'google_form'
  importBatchId?: string     // links to CSVImport batch
}

export interface CSVImportBatch {
  id: string
  importedBy: string         // admin uid
  importedAt: Date
  fileName: string
  totalRows: number
  successRows: number
  failedRows: number
  errors: CSVImportError[]
  type: 'employees' | 'training_results'
}

export interface CSVImportError {
  row: number
  field: string
  message: string
  rawValue: string
}

export interface TeamProgress {
  teamId: string
  teamName: string
  totalMembers: number
  completedCount: number
  inProgressCount: number
  notStartedCount: number
  averageScore: number
  completionRate: number     // 0-100
}

export interface SkillGap {
  courseId: string
  courseTitle: string
  category: string
  completionRate: number
  averageScore: number
  atRiskCount: number        // members who failed or scored below threshold
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
