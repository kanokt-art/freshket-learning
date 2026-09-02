export type QuestionType = 'multiple_choice' | 'open_ended' | 'drag_drop'

// Moved here from Course.quizSettings — these are properties of the
// assessment being taken (how long you get, how questions are paged, whether
// tab-switching is policed), not of whichever course happens to link to it.
// A course can reuse the same assessment for pre- and post-test; the timer
// and anti-cheat behavior should follow the quiz, not be re-specified twice
// per course.
export type QuizAnswerViewMode = 'per_question' | 'per_topic' | 'all_in_one'

export const QUIZ_ANSWER_VIEW_LABELS: Record<QuizAnswerViewMode, string> = {
  per_question: 'หน้าละ 1 คำถาม',
  per_topic:    'หน้าละ 1 หัวข้อ',
  all_in_one:   'ทุกคำถามในหน้าเดียว',
}

export interface Choice {
  id: string
  text: string
  isCorrect: boolean
}

export interface DragPair {
  id: string
  left: string
  right: string
}

export interface Question {
  id: string
  order: number
  type: QuestionType
  text: string
  description?: string
  points: number
  choices?: Choice[]
  sampleAnswer?: string
  dragPairs?: DragPair[]
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  open_ended:      'Open-Ended',
  drag_drop:       'จับคู่',
}

export const QUESTION_TYPE_COLORS: Record<QuestionType, string> = {
  multiple_choice: 'bg-blue-100 text-blue-700',
  open_ended:      'bg-purple-100 text-purple-700',
  drag_drop:       'bg-amber-100 text-amber-700',
}

export interface Assessment {
  id: string
  title: string
  description: string
  questions: Question[]
  googleFormUrl?: string
  isPublished: boolean
  passingScore: number
  timeLimitMinutes?: number
  antiCheatEnabled?: boolean
  answerViewMode?: QuizAnswerViewMode
  createdAt: Date
  updatedAt: Date
  createdBy: string
}
