import { formatPersonName } from '@/lib/users/displayName'
import { isActiveEmployee } from '@/lib/users/active'
import { getTeamLeadIds, type UserProfile } from '@/types/user'

// The Team Lead(s) of a learner's team as team management has them. Used to tag them in the Slack
// group when the learner finishes something. A lead with a Slack id on file is mentioned; one without
// is named in plain text.

type Doc = Record<string, unknown>

interface TeamStore {
  get(path: string, id: string): Promise<Doc | null>
  getMany(path: string, ids: string[]): Promise<Doc[]>
}

export interface TeamLeadRef {
  name: string
  /** The Slack member id (U…/W…) when it is on file and well-formed. */
  slackUserId?: string
}

const SLACK_ID = /^[UW][A-Z0-9]{6,}$/

export async function teamLeadsOf(store: TeamStore, learner: { teamId?: string; uid?: string }): Promise<TeamLeadRef[]> {
  try {
    if (!learner.teamId) return []
    const team = await store.get('teams', learner.teamId)
    if (!team) return []
    const ids = getTeamLeadIds(team as never).filter((id) => id !== learner.uid)
    if (ids.length === 0) return []
    const people = (await store.getMany('users', ids)) as unknown as UserProfile[]
    return people
      .filter((p) => isActiveEmployee(p))
      .map((p) => ({
        name: formatPersonName(p),
        ...(typeof p.slackUserId === 'string' && SLACK_ID.test(p.slackUserId) ? { slackUserId: p.slackUserId } : {}),
      }))
  } catch {
    return []
  }
}
