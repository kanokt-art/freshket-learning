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
  // Admin-picked tag: which of the course's quiz lessons (if any) counts as
  // the course's pre-test / post-test for reporting purposes. Purely a label
  // on top of an ordinary quiz lesson — it doesn't change how the lesson is
  // taken, only which column its score is surfaced under in the learner
  // roster (AssignedLearnersTable). At most one lesson per course should
  // carry each value, but that's enforced by the picker UI, not this type.
  quizRole?: 'pre_test' | 'post_test'
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
  file:       'Google Slide',
  link:       'ลิงก์ภายนอก',
  quiz:       'แบบฝึกหัด',
  assignment: 'การบ้าน',
}

export interface GradeBand {
  id: string
  minPercent: number
  maxPercent: number
  label: string
  color: string // key into the GRADE_COLORS palette (courses/page.tsx)
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
  hasKeyTakeAway?: boolean
  keyTakeAwayPrompt?: string
  // Master switch for the course's quiz lessons, toggled from the builder's
  // "แบบทดสอบ" tab. When false the quiz lessons still exist but no lesson
  // carries a pre/post role, so nothing is graded into the Pre-Test /
  // Post-Test columns. Absent on older documents, which are treated as
  // enabled when any lesson already holds a role (see formFromCourse).
  quizEnabled?: boolean
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

