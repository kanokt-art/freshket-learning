export type CourseCategory = 'product' | 'sales_skill' | 'compliance' | 'onboarding' | 'leadership'

// Difficulty level — set by admin on the course form, surfaced to learners in the
// "My Course" table on their dashboard.
export type CourseLevel = 'beginner' | 'intermediate' | 'expert'

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner:     'Beginner',
  intermediate: 'Intermediate',
  expert:       'Expert',
}

export const LEVEL_COLORS: Record<CourseLevel, string> = {
  beginner:     'bg-freshket-100 text-freshket-700',
  intermediate: 'bg-amber-100 text-amber-700',
  expert:       'bg-rose-100 text-rose-700',
}

export type ResourceType = 'pdf' | 'video' | 'link' | 'document' | 'playbook' | 'sop'

export type LessonType = 'video' | 'article' | 'file' | 'link' | 'quiz' | 'assignment'

export interface CourseLesson {
  id: string
  title: string
  type: LessonType
  order: number
  description?: string
  // video
  videoProvider?: 'youtube' | 'google_drive'
  videoUrl?: string
  // article
  articleBody?: string
  // file (URL only — no direct upload support; use Google Slides or a shared file link)
  fileUrl?: string
  // link
  linkUrl?: string
  // quiz — links an existing Assessment
  assessmentId?: string
  // assignment / homework
  assignmentPrompt?: string
}

export interface CourseTopic {
  id: string
  title: string
  order: number
  lessons: CourseLesson[]
}

export const LESSON_TYPE_LABELS: Record<LessonType, string> = {
  video:      'วิดีโอ',
  article:    'บทความ',
  file:       'ไฟล์',
  link:       'ลิงก์ภายนอก',
  quiz:       'แบบฝึกหัด',
  assignment: 'การบ้าน',
}

export type QuizAnswerViewMode = 'per_question' | 'per_topic' | 'all_in_one'

export interface GradeBand {
  id: string
  minPercent: number
  maxPercent: number
  label: string
  color: string // key into the GRADE_COLORS palette (courses/page.tsx)
}

// Course-level quiz settings.
//
// ENFORCED:
//  - timeLimitMinutes — anchored server-side. POST /api/assessment/start stamps the
//    start time in `assessmentSessions`; the browser counts down against that
//    deadline and auto-submits, and POST /api/assessment/submit refuses anything
//    arriving after it (plus a short network grace).
//  - antiCheatEnabled — fullscreen is forced, tab/window switches are detected via
//    the Page Visibility API, and the quiz auto-submits after 3 warnings.
//  - passThresholdPercent — gates the certificate and is copied to
//    TrainingRecord.passScore.
//
// STORED BUT NOT ENFORCED — do not assume these do anything:
//  - cameraRequired: no proctoring exists. The admin toggle was REMOVED so it can
//    no longer be switched on; the field remains only for documents already saved.
//  - retryEnabled / retryAfterDays / maxRetries: retakes are neither blocked nor
//    limited. (attemptCount IS now counted correctly, from real attempt records.)
//  - rewardEnabled / rewardWithinAttempts / rewardThresholdPercent: no award engine.
//  - gradeBands / answerViewMode: affect the admin preview modal only.
export interface QuizSettings {
  title?: string
  timeLimitMinutes?: number
  antiCheatEnabled?: boolean
  cameraRequired?: boolean
  description?: string
  answerViewMode?: QuizAnswerViewMode
  passThresholdPercent?: number
  retryEnabled?: boolean
  retryAfterDays?: number
  maxRetries?: number
  rewardEnabled?: boolean
  rewardWithinAttempts?: number
  rewardThresholdPercent?: number
  gradeBands?: GradeBand[]
}

export const QUIZ_ANSWER_VIEW_LABELS: Record<QuizAnswerViewMode, string> = {
  per_question: 'หน้าละ 1 คำถาม',
  per_topic:    'หน้าละ 1 หัวข้อ',
  all_in_one:   'ทุกคำถามในหน้าเดียว',
}

export interface Course {
  id: string
  title: string
  description: string
  category: CourseCategory
  level?: CourseLevel
  durationMinutes: number
  thumbnailUrl?: string
  isRequired: boolean
  targetRoles: string[]
  assignedUserIds?: string[]  // specific user assignment (empty = all target roles)
  startDate?: Date            // null = publish immediately
  endDate?: Date              // null = no deadline
  slideUrl?: string
  formUrl?: string
  isPublished: boolean
  instructorId?: string
  courseAdminIds?: string[]
  introVideoUrl?: string
  hasCertificate?: boolean
  allowRetake?: boolean
  topics?: CourseTopic[]
  // Assessment config
  assessmentType?: 'self' | 'google_form'
  hasPreAssessment?: boolean
  hasPostAssessment?: boolean
  preAssessmentId?: string
  postAssessmentId?: string
  preFormUrl?: string
  postFormUrl?: string
  quizSettings?: QuizSettings
  hasKeyTakeAway?: boolean
  keyTakeAwayPrompt?: string
  // Challenge course settings
  isChallenge?: boolean
  challengeWindowStart?: Date
  challengeWindowEnd?: Date
  challengeMultiplier?: number   // default 2.0 — points multiplier for challenge courses
  createdAt: Date
  updatedAt: Date
  createdBy: string
}

export interface Resource {
  id: string
  title: string
  description: string
  type: ResourceType
  url: string
  imageUrl?: string      // cover image for card display
  category: string
  tags: string[]
  isPublic: boolean
  isPublished: boolean   // admin publish control
  targetRoles: string[]
  createdAt: Date
  updatedAt: Date
  createdBy: string
}

export const CATEGORY_LABELS: Record<CourseCategory, string> = {
  product:     'Product Knowledge',
  sales_skill: 'Sales Skill',
  compliance:  'Compliance',
  onboarding:  'Onboarding',
  leadership:  'Leadership',
}

export const CATEGORY_COLORS: Record<CourseCategory, string> = {
  product:     'bg-blue-100 text-blue-700',
  sales_skill: 'bg-freshket-100 text-freshket-700',
  compliance:  'bg-amber-100 text-amber-700',
  onboarding:  'bg-purple-100 text-purple-700',
  leadership:  'bg-rose-100 text-rose-700',
}

