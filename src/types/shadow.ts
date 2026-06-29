export type ShadowSegment = 'Mini Chain' | 'Stand alone' | 'Chain'
export type ShadowPersona = 'Chef' | 'Owner' | 'Purchasing' | 'Manager'

export interface ShadowAcknowledgment {
  reviewerUid: string
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
