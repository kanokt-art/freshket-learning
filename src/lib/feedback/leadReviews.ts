// A team lead's and a manager's comment and stars on a member's course.
//
// Each reviewer has their own record, so the team lead's and the manager's are both kept (it used to be one
// record per member and course, and whoever saved last replaced the other). New records are saved under
// "<member>_<course>__<reviewer>" with the reviewer's role; a record saved the old way
// ("<member>_<course>", no role) is still read, and counted as the team lead's.

export type LeadSlot = 'team_lead' | 'manager'

export interface LeadReview {
  id?: string
  memberUid?: string
  courseId?: string
  comment?: string
  score?: number | null
  leadUid?: string
  leadName?: string
  leadRole?: string
  updatedAt?: Date | string
}

/** The id a reviewer's own record is saved under. */
export const leadReviewId = (memberUid: string, courseId: string, leadUid: string) => `${memberUid}_${courseId}__${leadUid}`

/** Which box a review belongs in: a manager's (or anyone above) or a team lead's. */
export function slotOfReview(r: Pick<LeadReview, 'leadRole'>): LeadSlot {
  return r.leadRole === 'manager' || r.leadRole === 'super_admin' ? 'manager' : 'team_lead'
}

const time = (d?: Date | string) => {
  const t = d instanceof Date ? d.getTime() : d ? new Date(d).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

/** Does it say anything: stars or words. */
export const hasContent = (r: LeadReview) => (typeof r.score === 'number' && r.score > 0) || !!r.comment?.trim()

/** The latest review in each box (a member may have had more than one team lead comment). */
export function latestBySlot(reviews: readonly LeadReview[]): Record<LeadSlot, LeadReview | undefined> {
  const out: Record<LeadSlot, LeadReview | undefined> = { team_lead: undefined, manager: undefined }
  for (const r of reviews) {
    if (!hasContent(r)) continue
    const slot = slotOfReview(r)
    const cur = out[slot]
    if (!cur || time(r.updatedAt) > time(cur.updatedAt)) out[slot] = r
  }
  return out
}

/** The newest moment any review was saved (0 when there is none): what a "new feedback" signal compares. */
export function newestReviewTime(reviews: readonly LeadReview[]): number {
  return reviews.filter(hasContent).reduce((m, r) => Math.max(m, time(r.updatedAt) || 1), 0)
}
