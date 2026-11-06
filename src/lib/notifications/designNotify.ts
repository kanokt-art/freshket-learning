import { isInCourseTarget } from '@/lib/courses/audience'
import { isCurrentOrIncoming } from '@/lib/users/active'
import { pushNotification } from '@/lib/notifications/push'
import { confirmAndAnnounce } from '@/lib/notifications/confirmAnnounce'
import type { CoursePackage } from '@/types/coursePackage'
import type { UserProfile } from '@/types/user'

// Telling learners when a Course Design is launched. Launching is the step that used to be "publish a course", so
// the same two channels apply and the same rule: the bell is a personal feed (one item per learner), Slack is one
// post carrying the headcount. People who already have a record in one of the package's courses are not told again,
// and when a live package gains people, only the new ones are told.

/** Who is told: people on the audience, still with the company, not the admin, with nothing started in the package yet. */
export function designRecipients(
  pkg: Pick<CoursePackage, 'assignedUserIds' | 'assignedDepartments' | 'assignedTeamIds' | 'targetRoles' | 'courseIds'>,
  users: readonly UserProfile[],
  records: ReadonlyArray<{ userId: string; courseId: string }>,
  currentUid: string | undefined,
  alreadyTold?: ReadonlySet<string>,
): UserProfile[] {
  const inPackage = new Set(pkg.courseIds)
  const started = new Set(records.filter((r) => inPackage.has(r.courseId)).map((r) => r.userId))
  return users.filter((u) =>
    isCurrentOrIncoming(u) && isInCourseTarget(pkg, u) && u.uid !== currentUid && !started.has(u.uid) && !alreadyTold?.has(u.uid),
  )
}

export function notifyDesignLaunch(opts: {
  pkg: Pick<CoursePackage, 'id' | 'title' | 'courseIds' | 'assignedUserIds' | 'assignedDepartments' | 'assignedTeamIds' | 'targetRoles'>
  wasPublished: boolean
  /** Who could already see the package before this save (so only the newly added are told). */
  previousAudienceUids?: ReadonlySet<string>
  users: readonly UserProfile[]
  records: ReadonlyArray<{ userId: string; courseId: string }>
  currentUid: string | undefined
}): { recipients: number } {
  const { pkg, wasPublished, previousAudienceUids, users, records, currentUid } = opts
  const recipients = designRecipients(pkg, users, records, currentUid, wasPublished ? previousAudienceUids : undefined)
  if (recipients.length === 0) return { recipients: 0 }

  recipients.forEach((u) => {
    void pushNotification(u.uid, {
      type: 'new_course',
      title: wasPublished ? `Course Design: ${pkg.title}` : `Course Design ใหม่: ${pkg.title}`,
      body: wasPublished ? 'คุณถูกเพิ่มเข้า Course Design — คลิกเพื่อดูรายละเอียด' : 'มีชุดหลักสูตรใหม่สำหรับคุณ — คลิกเพื่อดูรายละเอียด',
      refId: pkg.id,
      refPath: `/courses/design/${pkg.id}`,
    })
  })
  void confirmAndAnnounce({
    kind: 'design_published',
    packageId: pkg.id,
    title: pkg.title,
    courseCount: pkg.courseIds.length,
    recipientCount: recipients.length,
    ...(wasPublished ? { isAddition: true } : {}),
  })
  return { recipients: recipients.length }
}
