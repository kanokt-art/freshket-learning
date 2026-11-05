// Where a member's Shadow visits stand in the chain: the member records a visit, their team lead
// reviews it, then their manager does. Counted per member over all of their visits.

import { slotOf, type Review } from '@/lib/shadow/reviews'

export interface ShadowStages {
  /** Visits the member has recorded. */
  visits: number
  /** Visits a team lead has reviewed. */
  teamLead: number
  /** Visits a manager (or above) has reviewed. */
  manager: number
}

export type StageState = 'none' | 'some' | 'all'

export function memberStages(
  visitIds: readonly string[],
  reviewsByRecord: ReadonlyMap<string, readonly Pick<Review, 'reviewerRole'>[]>,
): ShadowStages {
  let teamLead = 0
  let manager = 0
  for (const id of visitIds) {
    const slots = new Set((reviewsByRecord.get(id) ?? []).map((r) => slotOf(r.reviewerRole)))
    if (slots.has('team_lead')) teamLead++
    if (slots.has('manager')) manager++
  }
  return { visits: visitIds.length, teamLead, manager }
}

/** Whether none, some or every one of a member's visits has reached a stage. */
export function stageState(done: number, visits: number): StageState {
  if (visits <= 0 || done <= 0) return 'none'
  return done >= visits ? 'all' : 'some'
}
