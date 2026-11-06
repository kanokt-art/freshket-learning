import type { Store } from '@/lib/server/store'
import { projectCourse, sameProjection, DRAFT_PROJECTION, type CourseProjection, type DesignLike } from '@/lib/courses/designProjection'

// Keeping courses in step with the Course Designs that launch them (lib/courses/designProjection.ts), and
// wrapping a course that is already live in a Course Design of its own.
//
// A course the designs have never touched is left exactly as it is, so a course that is still live under its
// old settings keeps working until it is converted. A course the designs DO manage is marked (`designManaged`),
// and goes back to a draft when no live design holds it any more.

type Doc = Record<string, unknown> & { id: string }
type Reader = Pick<Store, 'query'>
type Writer = Pick<Store, 'query' | 'set'>

export interface SyncResult {
  /** Courses whose audience, dates or published state were rewritten. */
  updated: string[]
}

function patchOf(p: CourseProjection, managed: boolean): Record<string, unknown> {
  return {
    isPublished: p.isPublished,
    assignedUserIds: p.assignedUserIds,
    assignedDepartments: p.assignedDepartments,
    assignedTeamIds: p.assignedTeamIds,
    targetRoles: p.targetRoles,
    startDate: p.startDate,
    endDate: p.endDate,
    designManaged: managed,
  }
}

/** Recompute every managed course from the live Course Designs and write the ones that changed. */
export async function syncCourseDesigns(store: Writer): Promise<SyncResult> {
  const [designs, courses] = await Promise.all([store.query('coursePackages'), store.query('courses')])
  const updated: string[] = []
  for (const course of courses as Doc[]) {
    const projection = projectCourse(course.id, designs as unknown as DesignLike[])
    const managed = course.designManaged === true
    // Not held by a live design, and never managed by one: an older course, left alone.
    if (!projection && !managed) continue
    const target = projection ?? DRAFT_PROJECTION
    if (sameProjection(target, course as never) && managed === !!projection) continue
    await store.set('courses', course.id, patchOf(target, !!projection), { merge: true })
    updated.push(course.id)
  }
  return { updated }
}

export interface ConvertResult {
  /** The courses that now have a Course Design of their own. */
  converted: string[]
}

/**
 * Give every course that is live but not yet in any Course Design a Course Design of its own — the same
 * audience, the same dates — so nothing changes for the learners. Courses already in a design, or already
 * managed, are skipped, so running it twice does nothing the second time.
 */
export async function convertLiveCoursesToDesigns(
  store: Writer,
  byUid: string,
  newId: () => string,
  now: Date = new Date(),
): Promise<ConvertResult> {
  const [designs, courses] = await Promise.all([store.query('coursePackages'), store.query('courses')])
  const held = new Set((designs as Doc[]).flatMap((d) => (Array.isArray(d.courseIds) ? (d.courseIds as string[]) : [])))
  const converted: string[] = []
  for (const c of courses as Doc[]) {
    if (c.isPublished !== true || c.designManaged === true || held.has(c.id)) continue
    await store.set('coursePackages', newId(), {
      title: String(c.title ?? ''),
      description: typeof c.description === 'string' ? c.description : '',
      courseIds: [c.id],
      sequential: false,
      isPublished: true,
      assignedUserIds: (c.assignedUserIds as string[] | undefined) ?? [],
      assignedDepartments: (c.assignedDepartments as string[] | undefined) ?? [],
      assignedTeamIds: (c.assignedTeamIds as string[] | undefined) ?? [],
      targetRoles: (c.targetRoles as string[] | undefined) ?? [],
      startDate: c.startDate ?? undefined,
      endDate: c.endDate ?? undefined,
      createdBy: byUid,
      createdAt: now,
      updatedAt: now,
    }, { merge: false })
    converted.push(c.id)
  }
  return { converted }
}

export type { Reader }
