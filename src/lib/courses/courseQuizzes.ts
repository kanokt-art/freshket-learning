import type { Course } from '@/types/course'

/**
 * Whether a course carries a before / after test. A course with a pre-test is also sat again after it
 * (the same quiz, for a before/after score), so it counts as having a post-test too.
 */
export function courseQuizzes(c: Pick<Course, 'topics'>): { pre: boolean; post: boolean } {
  const lessons = (c.topics ?? []).flatMap((t) => t.lessons ?? [])
  const pre = lessons.some((l) => l.type === 'quiz' && l.quizRole === 'pre_test')
  const post = pre || lessons.some((l) => l.type === 'quiz' && l.quizRole === 'post_test')
  return { pre, post }
}
