import { describe, it, expect } from 'vitest'
import {
  requiresPostTest, statusTheBrowserMayWrite, refusesClientStatus, statusAfterPostTest,
} from '@/lib/courses/completion'

const lesson = (type: string, quizRole?: string) => ({ type, quizRole })
const course = (...lessons: Array<{ type: string; quizRole?: string }>) => ({ topics: [{ lessons }] })

const withPost = course(lesson('video'), lesson('quiz', 'post_test'))
const withPre = course(lesson('quiz', 'pre_test'), lesson('video'))
const practiceOnly = course(lesson('video'), lesson('quiz'))
const lessonsOnly = course(lesson('video'), lesson('article'))

describe('requiresPostTest', () => {
  it('is true for a course with a post-test lesson', () => expect(requiresPostTest(withPost)).toBe(true))
  it('is true for a pre-test lesson, whose second sitting is the post-test', () => expect(requiresPostTest(withPre)).toBe(true))
  it('is false for an untagged quiz — that is practice', () => expect(requiresPostTest(practiceOnly)).toBe(false))
  it('is false for a course of lessons only', () => expect(requiresPostTest(lessonsOnly)).toBe(false))
  it('is false for a quiz tag on a lesson that is not a quiz', () => {
    expect(requiresPostTest(course(lesson('video', 'post_test')))).toBe(false)
  })
  it('is false when there is nothing to look at', () => {
    expect(requiresPostTest(null)).toBe(false)
    expect(requiresPostTest(undefined)).toBe(false)
    expect(requiresPostTest({})).toBe(false)
    expect(requiresPostTest({ topics: [{}] })).toBe(false)
  })
  it('looks across every topic', () => {
    expect(requiresPostTest({ topics: [{ lessons: [lesson('video')] }, { lessons: [lesson('quiz', 'post_test')] }] })).toBe(true)
  })
})

describe('statusTheBrowserMayWrite', () => {
  it('lets a course without a graded test finish on lesson ticks, as before', () => {
    expect(statusTheBrowserMayWrite(lessonsOnly, undefined, 'completed')).toBe('completed')
    expect(statusTheBrowserMayWrite(lessonsOnly, 'in_progress', 'completed')).toBe('completed')
  })

  it('never says "completed" for a course with a graded test: it says in progress', () => {
    expect(statusTheBrowserMayWrite(withPost, undefined, 'completed')).toBe('in_progress')
    expect(statusTheBrowserMayWrite(withPost, 'in_progress', 'completed')).toBe('in_progress')
  })

  it('never says "failed" either', () => {
    expect(statusTheBrowserMayWrite(withPost, 'in_progress', 'failed')).toBe('in_progress')
  })

  it('reports not started and in progress as they are', () => {
    expect(statusTheBrowserMayWrite(withPost, undefined, 'not_started')).toBe('not_started')
    expect(statusTheBrowserMayWrite(withPost, 'not_started', 'in_progress')).toBe('in_progress')
  })

  it('leaves a result the server recorded alone — a lesson tick must not undo it', () => {
    expect(statusTheBrowserMayWrite(withPost, 'completed', 'in_progress')).toBeUndefined()
    expect(statusTheBrowserMayWrite(withPost, 'failed', 'in_progress')).toBeUndefined()
    expect(statusTheBrowserMayWrite(withPost, 'completed', 'completed')).toBeUndefined()
  })
})

describe('refusesClientStatus', () => {
  it('refuses setting "completed" on a course with a graded test', () => {
    expect(refusesClientStatus(withPost, 'in_progress', 'completed')).toBe(true)
    expect(refusesClientStatus(withPost, undefined, 'completed')).toBe(true)
  })

  it('refuses setting "failed" too', () => {
    expect(refusesClientStatus(withPost, 'in_progress', 'failed')).toBe(true)
  })

  it('allows reporting progress', () => {
    expect(refusesClientStatus(withPost, undefined, 'in_progress')).toBe(false)
    expect(refusesClientStatus(withPost, 'not_started', 'in_progress')).toBe(false)
  })

  it('allows a write that does not change the status, even when it is "completed"', () => {
    // Re-saving lesson ticks on a record the server already completed.
    expect(refusesClientStatus(withPost, 'completed', 'completed')).toBe(false)
  })

  it('allows a course without a graded test to finish by lessons', () => {
    expect(refusesClientStatus(lessonsOnly, 'in_progress', 'completed')).toBe(false)
    expect(refusesClientStatus(practiceOnly, undefined, 'completed')).toBe(false)
  })

  it('allows it when the course is not known', () => {
    expect(refusesClientStatus(null, 'in_progress', 'completed')).toBe(false)
  })
})

describe('statusAfterPostTest', () => {
  it('passing completes the course', () => {
    expect(statusAfterPostTest(undefined, true)).toBe('completed')
    expect(statusAfterPostTest('in_progress', true)).toBe('completed')
    expect(statusAfterPostTest('failed', true)).toBe('completed')
  })

  it('failing marks it failed', () => {
    expect(statusAfterPostTest(undefined, false)).toBe('failed')
    expect(statusAfterPostTest('in_progress', false)).toBe('failed')
  })

  it('a worse retake does not take away a pass', () => {
    expect(statusAfterPostTest('completed', false)).toBeUndefined()
  })
})
