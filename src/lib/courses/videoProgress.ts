// How far a learner has watched a (YouTube) video lesson, kept in the browser so the
// lesson list can show "บทเรียน #1 · 60%" and a learner who leaves halfway comes back
// to where they were instead of starting from 0 (the player blocks skipping ahead, so
// without this they would have to sit through the start again).
//
// Display and resume only. Whether the lesson is PASSED is still decided by the player
// reaching 95% and ticking completedLessonIds — nothing here can pass a lesson.

export interface VideoProgress {
  /** Furthest point legitimately reached, in seconds. */
  seconds: number
  /** The same as a whole percent of the video, 0–100. */
  pct: number
}

export const NO_VIDEO_PROGRESS: VideoProgress = { seconds: 0, pct: 0 }

export function videoProgressKey(uid: string, courseId: string, lessonId: string): string {
  return `course_video_${uid}_${courseId}_${lessonId}`
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** What is stored, tolerating a missing, hand-edited or corrupt value. */
export function readVideoProgress(storage: Pick<Storage, 'getItem'>, key: string): VideoProgress {
  try {
    const raw = storage.getItem(key)
    if (!raw) return NO_VIDEO_PROGRESS
    const v = JSON.parse(raw) as Partial<VideoProgress>
    return { seconds: num(v.seconds), pct: Math.min(100, Math.round(num(v.pct))) }
  } catch {
    return NO_VIDEO_PROGRESS
  }
}

/** Progress only moves forward: rewatching the start must not shrink what was reached. */
export function furthest(prev: VideoProgress | undefined, next: VideoProgress): VideoProgress {
  if (!prev || next.seconds > prev.seconds) return next
  return prev
}
