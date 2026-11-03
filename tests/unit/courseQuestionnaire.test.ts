import { describe, it, expect } from 'vitest'
import { courseQuestionnaireId } from '@/lib/courses/questionnaire'

describe('courseQuestionnaireId', () => {
  it('is the questionnaire of the course, and MBTI when the lesson names none', () => {
    expect(courseQuestionnaireId({ topics: [{ lessons: [{ type: 'personality', bucketAssessmentId: 'selling_style' }] }] })).toBe('selling_style')
    expect(courseQuestionnaireId({ topics: [{ lessons: [{ type: 'video' }, { type: 'personality' }] }] })).toBe('mbti')
  })

  it('is null for a course without one, or no course', () => {
    expect(courseQuestionnaireId({ topics: [{ lessons: [{ type: 'quiz' }] }] })).toBeNull()
    expect(courseQuestionnaireId({ topics: [] })).toBeNull()
    expect(courseQuestionnaireId(null)).toBeNull()
  })
})
