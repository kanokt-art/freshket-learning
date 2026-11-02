import { describe, it, expect } from 'vitest'
import { canDismissCourse } from '@/lib/courses/dismiss'

describe('canDismissCourse', () => {
  it('lets a finished course without a quiz go (MBTI)', () => {
    expect(canDismissCourse({ status: 'completed' }, [])).toEqual({ ok: true })
  })

  it('lets a course go when the first attempt passed', () => {
    expect(canDismissCourse({ status: 'completed' }, [{ attemptNumber: 1, passed: true }])).toEqual({ ok: true })
  })

  it('refuses when the first attempt failed, even after a later pass', () => {
    const r = canDismissCourse({ status: 'completed' }, [{ attemptNumber: 1, passed: false }, { attemptNumber: 2, passed: true }])
    expect(r).toEqual({ ok: false, reason: 'failed_first_attempt' })
  })

  it('refuses a course that is not finished, or has no record', () => {
    expect(canDismissCourse({ status: 'in_progress' }, [])).toEqual({ ok: false, reason: 'not_completed' })
    expect(canDismissCourse({ status: 'failed' }, [])).toEqual({ ok: false, reason: 'not_completed' })
    expect(canDismissCourse(null, [])).toEqual({ ok: false, reason: 'not_completed' })
  })
})
