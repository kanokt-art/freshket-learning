export type CourseCategory = 'product' | 'sales_skill' | 'compliance' | 'onboarding' | 'leadership'

export type ResourceType = 'pdf' | 'video' | 'link' | 'document' | 'playbook' | 'sop'

export interface Course {
  id: string
  title: string
  description: string
  category: CourseCategory
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
  // Assessment config
  assessmentType?: 'self' | 'google_form'
  hasPreAssessment?: boolean
  hasPostAssessment?: boolean
  preAssessmentId?: string
  postAssessmentId?: string
  preFormUrl?: string
  postFormUrl?: string
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

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  pdf:      'PDF',
  video:    'Video',
  link:     'Link',
  document: 'Document',
  playbook: 'Playbook',
  sop:      'SOP',
}

export const RESOURCE_TYPE_COLORS: Record<ResourceType, string> = {
  pdf:      'bg-red-100 text-red-700',
  video:    'bg-rose-100 text-rose-700',
  link:     'bg-blue-100 text-blue-700',
  document: 'bg-slate-100 text-slate-700',
  playbook: 'bg-freshket-100 text-freshket-700',
  sop:      'bg-amber-100 text-amber-700',
}
