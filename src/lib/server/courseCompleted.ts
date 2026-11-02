import { isSalesDepartment, postCourseCompletedToSlack } from '@/lib/notifications/slack'
import { formatPersonName } from '@/lib/users/displayName'
import { teamLeadsOf } from './teamLeads'
import { isActiveEmployee } from '@/lib/users/active'
import type { UserProfile } from '@/types/user'

// Tells the trainer × team-lead group that someone finished a course, the first time only. Called after
// a training record is saved as completed through the data door — which is how a course without a graded
// post-test finishes. (A graded course is finished by the grading route, which posts its own card with
// the score.) Best effort: a Slack problem must never turn a saved record into an error.

type Doc = Record<string, unknown>

interface CompletionStore {
  get(path: string, id: string): Promise<Doc | null>
  getMany(path: string, ids: string[]): Promise<Doc[]>
  claim(path: string, id: string, data: Doc): Promise<boolean>
}

function appUrl(path: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  return base && path.startsWith('/') ? `${base}${path}` : undefined
}

export async function announceCourseCompleted(store: CompletionStore, userId: string, courseId: string): Promise<boolean> {
  try {
    const [person, course] = await Promise.all([store.get('users', userId), store.get('courses', courseId)])
    if (!person || !course || typeof course.title !== 'string') return false
    const learner = person as unknown as UserProfile
    // Only the sales organisation lives in that channel, and only people still working here.
    if (!isSalesDepartment(learner.department) || !isActiveEmployee(learner)) return false

    // Once per person and course: a replay, a retry or a second tick posts nothing more.
    const first = await store.claim('slackPosts', `course_completed:${userId}:${courseId}`, {
      kind: 'course_completed', refId: courseId, userId, postedAt: new Date(),
    })
    if (!first) return false

    return await postCourseCompletedToSlack({
      learnerName: formatPersonName(learner),
      position: learner.position,
      department: learner.department,
      courseTitle: course.title,
      teamLeads: await teamLeadsOf(store, { teamId: learner.teamId, uid: userId }),
      memberUrl: appUrl(`/manager?user=${encodeURIComponent(userId)}`),
    })
  } catch (e) {
    console.error('course completed announcement failed', e)
    return false
  }
}
