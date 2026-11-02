import { formatPersonName } from '@/lib/users/displayName'
import { isActiveEmployee } from '@/lib/users/active'
import { findSlackIdByEmail, type SlackLookup } from '@/lib/notifications/slackDm'
import { getTeamLeadIds, type UserProfile } from '@/types/user'

// The Team Lead(s) of a learner's team as team management has them. Used to tag them in the Slack
// group when the learner finishes something. A lead with a Slack id on file is mentioned; one without is
// looked up in Slack by their company email (users.lookupByEmail); only if Slack cannot find them either
// are they named in plain text. The name is "First (Nickname) Surname", or the email when there is no name.

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

// Emails Slack could not match, remembered for a while so every completion does not ask again.
const MISS_TTL_MS = 10 * 60 * 1000
const misses = new Map<string, number>()

/** For tests: forget what was remembered. */
export function resetTeamLeadLookups(): void {
  misses.clear()
}

async function slackIdFor(p: UserProfile, lookup: (email: string) => Promise<SlackLookup>): Promise<string | undefined> {
  if (typeof p.slackUserId === 'string' && SLACK_ID.test(p.slackUserId)) return p.slackUserId
  const email = (p.email ?? '').trim().toLowerCase()
  if (!email) return undefined
  const missedAt = misses.get(email)
  if (missedAt !== undefined && Date.now() - missedAt < MISS_TTL_MS) return undefined
  const found = await lookup(email)
  if (found.id && SLACK_ID.test(found.id)) return found.id
  misses.set(email, Date.now())
  return undefined
}

export async function teamLeadsOf(
  store: TeamStore,
  learner: { teamId?: string; uid?: string },
  lookup: (email: string) => Promise<SlackLookup> = findSlackIdByEmail,
): Promise<TeamLeadRef[]> {
  try {
    if (!learner.teamId) return []
    const team = await store.get('teams', learner.teamId)
    if (!team) return []
    const ids = getTeamLeadIds(team as never).filter((id) => id !== learner.uid)
    if (ids.length === 0) return []
    const people = (await store.getMany('users', ids)) as unknown as UserProfile[]
    const leads: TeamLeadRef[] = []
    for (const p of people.filter((x) => isActiveEmployee(x))) {
      const slackUserId = await slackIdFor(p, lookup)
      leads.push({ name: formatPersonName(p), ...(slackUserId ? { slackUserId } : {}) })
    }
    return leads
  } catch {
    return []
  }
}
