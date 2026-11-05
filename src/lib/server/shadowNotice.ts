import type { Store } from '@/lib/server/store'
import { formatPersonName } from '@/lib/users/displayName'
import { slackText } from '@/lib/notifications/slackText'
import { isSalesDepartment, postShadowSubmittedToSlack } from '@/lib/notifications/slack'
import { teamLeadsOf, teamManagersOf } from '@/lib/server/teamLeads'
import { saleTrainers } from '@/lib/server/saleTrainers'
import { getTeamLeadIds, type UserProfile } from '@/types/user'

// Telling people about a new Shadow Visit, whichever way it arrived: logged in the app
// (/api/notifications/announce) or sent in through the Google Form and its sheet (/api/sheets/shadow-sync).
// The bell rings for everyone who looks after the sender; sales visits also go to the trainer × team-lead
// Slack group, tagging the sender's Team Lead. Each happens once per visit, whatever calls it.

type Doc = Record<string, unknown>
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/** A link into this app from a path chosen by the server; none when the app URL is not configured. */
export function appUrl(path: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (!base || !path.startsWith('/') || path.startsWith('//')) return undefined
  return `${base}${path}`
}

/**
 * Who looks after a learner: their own manager on file, and their team's lead(s) and manager as team
 * management has them. The learner themself is left out.
 */
export async function supervisorsOf(store: Pick<Store, 'get'>, person: Partial<UserProfile>, selfUid: string): Promise<string[]> {
  const ids = new Set<string>()
  if (person.managerId) ids.add(person.managerId)
  if (person.teamId) {
    const team = (await store.get('teams', person.teamId)) as (Doc & { managerId?: string }) | null
    if (team) {
      for (const id of getTeamLeadIds(team as never)) ids.add(id)
      if (typeof team.managerId === 'string' && team.managerId) ids.add(team.managerId)
    }
  }
  ids.delete(selfUid)
  return Array.from(ids).filter((id) => ID_RE.test(id))
}

/** Ring the bells and post to Slack for one new visit. Returns whether the Slack post went out. */
export async function announceNewShadowVisit(
  store: Store,
  v: {
    recordId: string; senderUid: string; sender: Partial<UserProfile>; storeName?: string; segment?: string
    /**
     * A super_admin pushing it by hand: not once-only (the bells ring again, the group is posted to again),
     * and posted whatever the sender's department. `byUid` is who pushed it.
     */
    force?: { byUid: string }
  },
): Promise<boolean> {
  const parts = [v.storeName ? `ร้าน ${v.storeName}` : null, v.segment || null].filter(Boolean) as string[]
  const visitPath = `/shadow?visit=${encodeURIComponent(v.recordId)}`
  const who = formatPersonName(v.sender) || 'พนักงาน'
  const once = async (key: string, kind: string) =>
    v.force ? true : store.claim('slackPosts', key, { kind, refId: v.recordId, postedAt: new Date() })

  if (await once(`shadow_submitted_bell:${v.recordId}`, 'shadow_submitted_bell')) {
    const now = new Date()
    await Promise.all((await supervisorsOf(store, v.sender, v.senderUid)).map((uid) =>
      store.set(`notifications/${uid}/items`, `shadow_pending_ack_${v.recordId}`, {
        type: 'shadow_pending_ack',
        title: `${who} ส่ง Shadow Visit ใหม่`,
        body: [...parts, 'รอการประเมิน'].join(' · '),
        refId: v.recordId,
        refPath: visitPath,
        read: false,
        createdAt: now,
        createdByUid: v.force?.byUid ?? v.senderUid,
      }, { merge: false }),
    ))
  }

  // Only sales visits go to the channel, once per visit — unless a super_admin sends it themselves.
  if (!v.force && !isSalesDepartment(v.sender.department)) return false
  if (!(await once(`shadow_submitted:${v.recordId}`, 'shadow_submitted'))) return false

  const learner = { teamId: v.sender.teamId, uid: v.senderUid }
  const [teamLeads, managers, trainers] = await Promise.all([teamLeadsOf(store, learner), teamManagersOf(store, learner), saleTrainers()])
  return postShadowSubmittedToSlack({
    observerName: who,
    position: v.sender.position,
    department: v.sender.department,
    visitSummary: slackText([...parts, 'รอการประเมิน'].join(' · ')),
    shadowUrl: appUrl(visitPath),
    teamLeads, managers, trainers,
    // Where the post is, so the team lead's and the manager's reviews can reply under it.
    onPosted: (ref) => store.set('slackPosts', `shadow_submitted:${v.recordId}`, { channel: ref.channel, payload: { ts: ref.ts } }, { merge: true }),
  })
}
