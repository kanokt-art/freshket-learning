import { describe, it, expect } from 'vitest'
import { canDismissCourse } from '@/lib/courses/dismiss'

describe('canDismissCourse', () => {
  it('lets a finished course go, whether or not it has a quiz (a retake that passed is finished too)', () => {
    expect(canDismissCourse({ status: 'completed' })).toEqual({ ok: true })
  })

  it('refuses a course that is not finished: in progress, failed, not started, or no record', () => {
    expect(canDismissCourse({ status: 'in_progress' })).toEqual({ ok: false, reason: 'not_completed' })
    expect(canDismissCourse({ status: 'failed' })).toEqual({ ok: false, reason: 'not_completed' })
    expect(canDismissCourse({ status: 'not_started' })).toEqual({ ok: false, reason: 'not_completed' })
    expect(canDismissCourse(null)).toEqual({ ok: false, reason: 'not_completed' })
  })
})
