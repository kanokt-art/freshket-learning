// Learner progress → Firestore.
//
// Course progress used to live ONLY in localStorage (course_prog_*), which meant
// nothing a learner did ever reached the database: admins saw "ผู้เรียน 0" and
// "ยังไม่เริ่ม" for everyone, team leads saw no scores, and the learner's own
// dashboard had nothing to read on another device. This module is the bridge —
// every progress change is mirrored to trainingRecords/{uid}_{courseId}, which
// is the same doc id the CSV importer writes, so imported and self-reported
// progress converge on one record per learner per course.
//
// Best-effort: a failed write never blocks the learner (localStorage still holds
// their state), it just logs.

import type { Course } from '@/types/course'
import type { TrainingStatus } from '@/types/tracking'
import { getDemoMode } from '@/lib/demo/demoMode'
import { recomputeMyStats } from '@/lib/stats'
import { get, save } from '@/lib/data/collection'
import { statusTheBrowserMayWrite } from '@/lib/courses/completion'

const DEMO_MODE = getDemoMode()

export interface ProgressSnapshot {
  status: TrainingStatus
  score?: number
  completedLessonIds: string[]
  totalLessons: number
}

export function countCourseLessons(course: Pick<Course, 'topics'>): number {
  return (course.topics ?? []).reduce((sum, t) => sum + t.lessons.length, 0)
}

export async function syncTrainingRecord(
  uid: string,
  displayName: string | undefined,
  course: Course,
  snap: ProgressSnapshot,
): Promise<void> {
  if (DEMO_MODE || !uid) return
  try {

    // Rules require userId == request.auth.uid on both create and update, and the
    // doc id is deterministic so repeated saves update rather than duplicate.
    //
    // `score`, `passScore` and `attemptCount` are deliberately ABSENT: those are
    // assessment results, and they are written only by POST /api/assessment/submit
    // after the server grades the answers. firestore.rules rejects a client write
    // that touches them — previously a learner could put any score here (or edit
    // the localStorage the score came from) and it was accepted as fact.
    const payload: Record<string, unknown> = {
      userId: uid,
      memberName: displayName ?? '',
      courseId: course.id,
      courseTitle: course.title,
      completedLessonIds: snap.completedLessonIds,
      totalLessons: snap.totalLessons,
      source: 'manual',
      updatedAt: new Date(),
    }
    if (course.endDate) payload.dueDate = new Date(course.endDate)

    const recordId = `${uid}_${course.id}`

    // startedAt / completedAt are FIRST-TIME stamps, not "last activity". They used
    // to be written on every sync, so `startedAt` silently became the last-touch
    // time and `completedAt` crept forward every time a finished course was
    // reopened — which is the date HR reports on. Only set each one if it isn't
    // already stored.
    const prev = await get<Record<string, unknown>>('trainingRecords', recordId)
    const now = new Date()

    // On a course with a graded post-test the browser cannot declare "completed":
    // the server sets that when the test is graded and passed. So it reports
    // progress only, and leaves a recorded result as it is.
    const status = statusTheBrowserMayWrite(course, prev?.status as string | undefined, snap.status)
    if (status !== undefined) payload.status = status

    if (snap.status !== 'not_started' && !prev?.startedAt) {
      payload.startedAt = now
    }
    if (status === 'completed' && !prev?.completedAt) {
      payload.completedAt = now
    }

    await save('trainingRecords', { ...payload, id: recordId })

    // Keep this learner's aggregate summary (userStats/{uid}) in step so the
    // dashboards/leaderboard don't need to scan the whole trainingRecords
    // collection. Recomputed from the user's own records → always consistent.
    //
    // But ONLY when something the summary actually depends on changed.
    // computeUserStats (src/types/stats.ts) is a function of {record count, status,
    // score} — nothing else. This used to run on EVERY sync, and a sync fires on
    // every single lesson tick, so finishing a 20-lesson course cost ~20 full
    // per-user record scans (~4,000 document reads) to produce an identical summary.
    // Score changes no longer originate here (the submit route recomputes the
    // rollup itself after grading), so only a new record or a status change can
    // invalidate the summary from this path.
    const isNewRecord = prev === null
    const statusChanged = status !== undefined && prev?.status !== status
    if (isNewRecord || statusChanged) {
      await recomputeMyStats(uid)
    }
  } catch (e) {
    console.error('syncTrainingRecord failed', e)
  }
}
