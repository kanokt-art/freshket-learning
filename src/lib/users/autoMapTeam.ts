// Auto-assigns a team to any employee who has none yet, by matching their
// `lineManager` field against a team's team lead.
//
// Scope, both deliberate:
// - Additive only — a person who already has a teamId is never touched, even
//   if their lineManager now points at a different team's lead. Reassigning
//   someone automatically risks moving them out of a team a human placed them
//   in on purpose; adding a team to someone who has none is much lower risk.
// - Matches on lineManager, ignoring the person's own `department` string.
//   Org department labels and team department labels drift apart in practice
//   (e.g. several "Portfolio Management" people report to the lead of the
//   "SA MC" team, which is filed under Key Account Management) — the line
//   manager relationship is the more reliable signal of which team someone
//   actually belongs to.

import type { Team, UserProfile } from '@/types/user'
import { getTeamLeadIds } from '@/types/user'

/**
 * The HR export's `lineManager` field is written as "FirstNameEN (Nickname)"
 * — e.g. "Pataranuch (Tao)" for ภัทรนุช สุยะเวช, nickname Tao. This builds the
 * same string for a team lead's own profile so the two can be compared
 * directly, rather than trying to fuzzy-match Thai display names.
 */
export function lineManagerKey(u: Pick<UserProfile, 'displayNameEN' | 'nickname'>): string | null {
  const firstEN = (u.displayNameEN ?? '').trim().split(/\s+/)[0]
  const nick = (u.nickname ?? '').trim()
  if (!firstEN || !nick) return null
  return `${firstEN} (${nick})`
}

export interface AutoMapTarget {
  uid: string
  teamId: string
}

/**
 * Compute the teamId assignments this rule would make, without writing
 * anything. Two kinds of target, both only for people with no teamId yet:
 *
 * 1. A team's own lead, if they aren't already on their own team.
 * 2. Anyone else whose lineManager string matches a known team lead.
 */
export function computeAutoTeamMappings(
  users: UserProfile[],
  teams: Team[],
): AutoMapTarget[] {
  const byUid = new Map(users.map(u => [u.uid, u]))
  const isActive = (u: UserProfile) => !u.employmentStatus || u.employmentStatus === 'Active'

  // lineManager string -> team, built from each team's lead(s).
  const leadIndex = new Map<string, Team>()
  for (const team of teams) {
    for (const uid of getTeamLeadIds(team)) {
      const lead = byUid.get(uid)
      if (!lead) continue
      const key = lineManagerKey(lead)
      if (key) leadIndex.set(key, team)
    }
  }

  const targets: AutoMapTarget[] = []

  // 1. Team leads onto their own team.
  for (const team of teams) {
    for (const uid of getTeamLeadIds(team)) {
      const lead = byUid.get(uid)
      if (lead && isActive(lead) && !lead.teamId) {
        targets.push({ uid, teamId: team.id })
      }
    }
  }

  // 2. Everyone else matched by lineManager.
  for (const u of users) {
    if (!isActive(u) || u.teamId) continue
    const key = u.lineManager?.trim()
    if (!key) continue
    const team = leadIndex.get(key)
    if (team) targets.push({ uid: u.uid, teamId: team.id })
  }

  return targets
}
