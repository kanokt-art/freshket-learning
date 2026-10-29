// A Shadow visit can be reviewed by more than one person: the member's team lead AND
// their manager each give their own stars and feedback.
//
// It used to be one review per visit, because the review's id WAS the visit's id — so a
// manager reviewing after the team lead replaced the team lead's review. A review's id
// is now the visit AND the reviewer, which is also what stops one reviewer writing over
// another's (see the rule in lib/server/policies.ts).

export interface Review {
  recordId?: string
  reviewerUid: string
  reviewerName: string
  /** team_lead / manager / super_admin, so a reader can tell whose feedback it is. */
  reviewerRole?: string
  rating: number          // 1–5
  comment: string
  reviewedAt: Date
}

export type ReviewDoc = Review & { id: string }

/** The id of one reviewer's review of one visit. */
export function reviewId(recordId: string, reviewerUid: string): string {
  return `${recordId}__${reviewerUid}`
}

/** Which visit a stored review belongs to. A review kept under the old scheme has the visit id as its own id. */
export function recordIdOf(r: { id: string; recordId?: string }): string {
  return r.recordId || r.id
}

/** Reviews by visit, each list newest first. */
export function groupByRecord<T extends ReviewDoc>(reviews: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of reviews) {
    const key = recordIdOf(r)
    const list = out.get(key)
    if (list) list.push(r)
    else out.set(key, [r])
  }
  out.forEach((list) => list.sort((a, b) => time(b.reviewedAt) - time(a.reviewedAt)))
  return out
}

function time(d: Date | string | undefined): number {
  const t = d instanceof Date ? d.getTime() : d ? new Date(d).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

/** The one review to show in a compact spot: the viewer's own if they gave one, else the latest. */
export function primaryReview<T extends Review>(list: readonly T[] | undefined, viewerUid?: string): T | undefined {
  if (!list || list.length === 0) return undefined
  return list.find((r) => r.reviewerUid === viewerUid) ?? list[0]
}

/** Mean of the stars given, to one decimal, or null with no reviews. */
export function averageRating(list: readonly Pick<Review, 'rating'>[]): number | null {
  const stars = list.map((r) => r.rating).filter((n) => Number.isFinite(n) && n > 0)
  if (stars.length === 0) return null
  return Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10
}

const ROLE_LABEL: Record<string, string> = {
  team_lead: 'Team Lead',
  manager: 'Manager',
  super_admin: 'Super Admin',
}

/** Which of the two feedback boxes a review belongs in: managers (and above) have one, team leads the other. */
export type ReviewSlot = 'team_lead' | 'manager'
export function slotOf(role?: string): ReviewSlot {
  return role === 'manager' || role === 'super_admin' ? 'manager' : 'team_lead'
}

export function reviewerRoleLabel(role?: string): string {
  return (role && ROLE_LABEL[role]) || ''
}
