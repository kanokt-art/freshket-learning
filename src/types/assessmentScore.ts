// Pre/Post assessment attempts imported from the Google-Forms CSV export and
// mapped to an employee by email. Stored in the `assessmentScores` collection.
export interface AssessmentScore {
  id: string
  uid: string          // resolved employee uid
  email: string
  subject: string      // e.g. 'Product Knowledge'
  type: 'pre' | 'post'
  score: number        // correct answers
  total: number        // total questions
  pct: number          // 0–100
  takenAt: Date        // when the attempt was submitted
  createdAt: Date      // when it was imported
}
