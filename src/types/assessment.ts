export type QuestionType = 'multiple_choice' | 'open_ended' | 'drag_drop'

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
  createdAt: Date
  updatedAt: Date
  createdBy: string
}
