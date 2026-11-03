import { ROLEPLAY_TOPICS, type RoleplayAssessment, type RoleplayTopicScore } from '@/types/roleplay'
import type { UserRole } from '@/types/user'

// The Role Play assessor form on a member's profile: one tab per category (group), a rating for every
// topic of it (required) and one optional comment for the category. The pure part is here so it is
// tested without a screen.

export const RATING_MAX = 10

export interface RoleplayGroup {
  name: string
  topics: Array<{ key: string; label: string }>
}

/** The categories in the order the radar draws them, each with its topics. */
export function roleplayGroups(): RoleplayGroup[] {
  const out: RoleplayGroup[] = []
  for (const t of ROLEPLAY_TOPICS) {
    let g = out.find((x) => x.name === t.group)
    if (!g) { g = { name: t.group, topics: [] }; out.push(g) }
    g.topics.push({ key: t.key, label: t.label })
  }
  return out
}

/** A rating counts only if it is a whole number from 1 to 10. */
export const validRating = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= RATING_MAX

/** How many topics of a group still have no rating. */
export function missingInGroup(group: RoleplayGroup, ratings: Readonly<Record<string, number>>): number {
  return group.topics.filter((t) => !validRating(ratings[t.key])).length
}

/** The first category that still needs ratings, or null when every topic has one. */
export function firstIncomplete(groups: readonly RoleplayGroup[], ratings: Readonly<Record<string, number>>): string | null {
  return groups.find((g) => missingInGroup(g, ratings) > 0)?.name ?? null
}

/** Round = how many of this kind (pre / post) the member already has, plus one. */
export function nextRound(existing: ReadonlyArray<{ type: string; subjectUid?: string }>, type: 'pre' | 'post', subjectUid: string): number {
  return existing.filter((a) => a.type === type && (a.subjectUid === undefined || a.subjectUid === subjectUid)).length + 1
}

export interface AssessInput {
  subject: { uid: string; name: string; team: string }
  assessor: { uid: string; name: string; role: UserRole }
  type: 'pre' | 'post'
  round: number
  ratings: Readonly<Record<string, number>>
  /** One optional comment per category, keyed by the category name. */
  groupComments: Readonly<Record<string, string>>
  overallNote: string
  now?: Date
}

/** The record to save, or null when a rating is missing or the assessor would be grading themselves. */
export function buildRoleplayAssessment(i: AssessInput): Omit<RoleplayAssessment, 'id'> | null {
  if (i.subject.uid === i.assessor.uid) return null
  if (firstIncomplete(roleplayGroups(), i.ratings)) return null
  const topics: RoleplayTopicScore[] = ROLEPLAY_TOPICS.map((t) => ({ key: t.key, rating: i.ratings[t.key], comment: '' }))
  const groupComments: Record<string, string> = {}
  for (const g of roleplayGroups()) {
    const c = (i.groupComments[g.name] ?? '').trim()
    if (c) groupComments[g.name] = c
  }
  return {
    createdAt: i.now ?? new Date(),
    assessorUid: i.assessor.uid,
    assessorName: i.assessor.name,
    assessorRole: i.assessor.role,
    subjectUid: i.subject.uid,
    subjectName: i.subject.name,
    subjectTeam: i.subject.team,
    round: i.round,
    type: i.type,
    overallNote: i.overallNote.trim(),
    topics,
    groupComments,
  }
}
