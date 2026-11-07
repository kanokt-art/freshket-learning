// "For You" on the learner's home: the newest few things launched for them, newest first. A launched Course
// Design shows as one card of its own, and the courses inside it are not listed again beside it; a course that
// belongs to no launched Course Design shows on its own. Only the newest few are shown, so as something new is
// launched the oldest drops off.

type When = Date | string | number | null | undefined
const timeOf = (w: When): number => {
  if (w === null || w === undefined || w === '') return 0
  const t = (w instanceof Date ? w : new Date(w)).getTime()
  return Number.isFinite(t) ? t : 0
}

export const FOR_YOU_LIMIT = 5

export type ForYouItem<C, P> =
  | { kind: 'design'; design: P; at: number }
  | { kind: 'course'; course: C; at: number }

export function buildForYou<
  C extends { id: string; createdAt?: When; updatedAt?: When },
  P extends { courseIds?: readonly string[]; createdAt?: When; updatedAt?: When },
>(
  /** The courses on the learner's list (already theirs, published, not taken off the list). */
  courses: readonly C[],
  /** The launched Course Designs the learner may see. */
  designs: readonly P[],
  limit = FOR_YOU_LIMIT,
): ForYouItem<C, P>[] {
  const inDesign = new Set(designs.flatMap((d) => d.courseIds ?? []))
  const items: ForYouItem<C, P>[] = [
    ...designs.map((design) => ({ kind: 'design' as const, design, at: timeOf(design.updatedAt ?? design.createdAt) })),
    ...courses.filter((c) => !inDesign.has(c.id)).map((course) => ({ kind: 'course' as const, course, at: timeOf(course.updatedAt ?? course.createdAt) })),
  ]
  return items.sort((a, b) => b.at - a.at).slice(0, limit)
}
