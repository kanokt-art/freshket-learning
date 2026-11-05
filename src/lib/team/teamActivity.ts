// What the people a lead looks after have done lately, newest first, for the lead's home page: a Key Take
// Away written, a course finished with a score (or failed), a Shadow Visit logged. Each item links to where
// the lead reads it in full and responds — the member's history on the Team page, or the visit itself.

export type TeamActivityKind = 'takeaway' | 'score' | 'shadow'

export interface TeamActivity {
  id: string
  kind: TeamActivityKind
  uid: string
  at: Date
  /** The course, or the store visited. */
  title: string
  /** The Key Take Away text. */
  text?: string
  score?: number
  /** A finished course was failed. */
  failed?: boolean
  /** A Shadow Visit the viewer has already reviewed. */
  reviewed?: boolean
  href: string
}

type When = Date | string | number | null | undefined

export interface ActivityRecord { userId: string; courseId: string; courseTitle?: string; status?: string; score?: number; completedAt?: When; updatedAt?: When }
export interface ActivityTakeaway { uid?: string; courseId?: string; courseTitle?: string; text?: string; updatedAt?: When }
export interface ActivityShadow { id: string; observerUid: string; storeName?: string; createdAt?: When }
export interface ActivityReview { id: string; recordId?: string; reviewerUid?: string }

const toDate = (w: When): Date | null => {
  if (w === null || w === undefined || w === '') return null
  const d = w instanceof Date ? w : new Date(w)
  return isNaN(d.getTime()) ? null : d
}

export const memberHistoryHref = (uid: string) => `/manager?user=${encodeURIComponent(uid)}&tab=history`

/** A review belongs to a visit by its recordId, or by its id: "<visit>" (the old one) or "<visit>__<reviewer>". */
const reviewOf = (r: ActivityReview) => r.recordId || r.id.split('__')[0]

export function buildTeamActivity({ memberUids, records, takeaways, shadows, reviews, viewerUid, courseTitles }: {
  memberUids: readonly string[]
  records: readonly ActivityRecord[]
  takeaways: readonly ActivityTakeaway[]
  shadows: readonly ActivityShadow[]
  reviews: readonly ActivityReview[]
  viewerUid: string
  /** courseId → title, for a record or take-away saved without one. */
  courseTitles?: ReadonlyMap<string, string>
}): TeamActivity[] {
  const members = new Set(memberUids)
  const titleOf = (courseId: string, own?: string) => own?.trim() || courseTitles?.get(courseId) || 'หลักสูตร'
  const out: TeamActivity[] = []

  for (const r of records) {
    if (!members.has(r.userId)) continue
    if (r.status !== 'completed' && r.status !== 'failed') continue
    if (typeof r.score !== 'number' || r.score <= 0) continue
    const at = toDate(r.completedAt) ?? toDate(r.updatedAt)
    if (!at) continue
    out.push({
      id: `score:${r.userId}_${r.courseId}`, kind: 'score', uid: r.userId, at,
      title: titleOf(r.courseId, r.courseTitle), score: r.score, failed: r.status === 'failed',
      href: memberHistoryHref(r.userId),
    })
  }

  for (const t of takeaways) {
    if (!t.uid || !t.courseId || !members.has(t.uid) || !t.text?.trim()) continue
    const at = toDate(t.updatedAt)
    if (!at) continue
    out.push({
      id: `takeaway:${t.uid}_${t.courseId}`, kind: 'takeaway', uid: t.uid, at,
      title: titleOf(t.courseId, t.courseTitle), text: t.text.trim(),
      href: memberHistoryHref(t.uid),
    })
  }

  const reviewedByMe = new Set(reviews.filter((r) => r.reviewerUid === viewerUid).map(reviewOf))
  for (const s of shadows) {
    if (!members.has(s.observerUid)) continue
    const at = toDate(s.createdAt)
    if (!at) continue
    out.push({
      id: `shadow:${s.id}`, kind: 'shadow', uid: s.observerUid, at,
      title: s.storeName?.trim() || 'Shadow Visit', reviewed: reviewedByMe.has(s.id),
      href: `/shadow?visit=${encodeURIComponent(s.id)}`,
    })
  }

  return out.sort((a, b) => b.at.getTime() - a.at.getTime())
}
