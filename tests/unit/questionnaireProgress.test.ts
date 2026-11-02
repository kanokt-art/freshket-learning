import { describe, it, expect } from 'vitest'
import { questionnaireProgress } from '@/lib/server/questionnaireProgress'

const course = (over: Record<string, unknown> = {}) => ({
  id: 'mbti_personality', title: 'MBTI', isPublished: true,
  topics: [{ lessons: [{ id: 'personality_mbti', type: 'personality', bucketAssessmentId: 'mbti' }] }],
  ...over,
})
const now = new Date('2026-11-02T10:00:00Z')

describe('questionnaireProgress', () => {
  it('finishes a course whose only lesson is the questionnaire, and says it finished it now', () => {
    const r = questionnaireProgress(course(), 'personality_mbti', 'mbti', null, 'u1', 'Somchai', now)!
    expect(r.completedNow).toBe(true)
    expect(r.record).toMatchObject({ userId: 'u1', courseId: 'mbti_personality', status: 'completed', completedLessonIds: ['personality_mbti'], totalLessons: 1 })
    expect(r.record.startedAt).toEqual(now)
    expect(r.record.completedAt).toEqual(now)
  })

  it('is in progress while other lessons are still to do', () => {
    const c = course({ topics: [{ lessons: [{ id: 'v1', type: 'video' }, { id: 'personality_mbti', type: 'personality' }] }] })
    const r = questionnaireProgress(c, 'personality_mbti', 'mbti', null, 'u1', 'S', now)!
    expect(r.completedNow).toBe(false)
    expect(r.record.status).toBe('in_progress')
    expect(r.record.completedAt).toBeUndefined()
  })

  it('leaves a graded course to the grading, and waits for a take-away when the course asks for one', () => {
    const graded = course({ topics: [{ lessons: [{ id: 'personality_mbti', type: 'personality' }, { id: 'q', type: 'quiz', quizRole: 'post_test' }] }] })
    expect(questionnaireProgress(graded, 'personality_mbti', 'mbti', null, 'u1', 'S', now)!.record.status).toBe('in_progress')
    expect(questionnaireProgress(course({ hasKeyTakeAway: true }), 'personality_mbti', 'mbti', null, 'u1', 'S', now)!.record.status).toBe('in_progress')
  })

  it('does not announce a completion twice', () => {
    const r = questionnaireProgress(course(), 'personality_mbti', 'mbti', { status: 'completed', completedLessonIds: ['personality_mbti'], completedAt: now }, 'u1', 'S', now)!
    expect(r.completedNow).toBe(false)
  })

  it('keeps earlier ticks and the first start time', () => {
    const c = course({ topics: [{ lessons: [{ id: 'v1', type: 'video' }, { id: 'personality_mbti', type: 'personality' }] }] })
    const started = new Date('2026-10-30T00:00:00Z')
    const r = questionnaireProgress(c, 'personality_mbti', 'mbti', { status: 'in_progress', completedLessonIds: ['v1'], startedAt: started }, 'u1', 'S', now)!
    expect(r.record.completedLessonIds).toEqual(['v1', 'personality_mbti'])
    expect(r.record).not.toHaveProperty('startedAt')
    expect(r.record.totalLessons).toBe(2)
    expect(r.record.status).toBe('completed')
  })

  it('never takes back a result already recorded', () => {
    expect(questionnaireProgress(course(), 'personality_mbti', 'mbti', { status: 'completed', completedLessonIds: [] }, 'u1', 'S', now)!.record).not.toHaveProperty('status')
    expect(questionnaireProgress(course(), 'personality_mbti', 'mbti', { status: 'failed', completedLessonIds: [] }, 'u1', 'S', now)!.record).not.toHaveProperty('status')
  })

  it('ticking the same lesson twice changes nothing', () => {
    const r = questionnaireProgress(course(), 'personality_mbti', 'mbti', { status: 'in_progress', completedLessonIds: ['personality_mbti'], startedAt: now }, 'u1', 'S', now)!
    expect(r.record.completedLessonIds).toEqual(['personality_mbti'])
  })

  it('ticks nothing it was not asked about: unknown lesson, another kind of lesson, another questionnaire, a draft course', () => {
    expect(questionnaireProgress(course(), 'nope', 'mbti', null, 'u1', 'S', now)).toBeNull()
    expect(questionnaireProgress(course({ topics: [{ lessons: [{ id: 'v1', type: 'video' }] }] }), 'v1', 'mbti', null, 'u1', 'S', now)).toBeNull()
    expect(questionnaireProgress(course(), 'personality_mbti', 'selling_style', null, 'u1', 'S', now)).toBeNull()
    expect(questionnaireProgress(course({ isPublished: false }), 'personality_mbti', 'mbti', null, 'u1', 'S', now)).toBeNull()
    expect(questionnaireProgress(null, 'personality_mbti', 'mbti', null, 'u1', 'S', now)).toBeNull()
  })
})
