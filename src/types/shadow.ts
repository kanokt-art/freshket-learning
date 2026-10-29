export type ShadowSegment = 'Mini Chain' | 'Stand alone' | 'Chain'
export type ShadowPersona = 'Chef' | 'Owner' | 'Purchasing' | 'Manager'

export interface ShadowAcknowledgment {
  /** The visit this review is of. Absent on a review saved before there could be several per visit. */
  recordId?: string
  reviewerUid: string
  /** team_lead / manager / super_admin — in what role the review was given. */
  reviewerRole?: string
  reviewerName: string
  rating: number   // 1–5
  comment: string
  reviewedAt: Date
}

export interface ShadowRecord {
  id: string
  createdAt: Date
  updatedAt: Date
  observerUid: string
  observerEmail: string
  observerName: string
  mentorName: string
  mentorPosition: string
  storeName: string
  segment: ShadowSegment
  persona: ShadowPersona
  // 7 evaluation criteria
  opening: string
  interestPoint: string
  customerPain: string
  diagnosticApproach: string
  closingNextStep: string
  bestPractice: string
  beyondClassroom: string
  // Optional evaluator feedback
  evaluatorEmail?: string
  ratingScore?: number
  evaluationFeedback?: string
}
