// Direct messages from the Slack app to individual people.
//
// The channel webhook in ./slack.ts speaks to everyone; this speaks to one person —
// the team lead whose learner just submitted something, or the learner whose visit
// was just reviewed. It needs the app's bot token (manifest: docs/slack/manifest.json)
// and the person's Slack member id, which a super_admin records on their profile.
//
// SERVER ONLY — the bot token is a bearer credential. Best-effort by contract: a
// Slack failure, a missing token or a person without a member id returns false and
// never fails the action that triggered it.

import type { Store } from '@/lib/server/store'
import { getTeamLeadIds, getTeamManagerIds, type Team, type UserProfile } from '@/types/user'

export interface SlackDm {
  /** Plain text: the notification preview, and what clients that cannot draw blocks show. */
  text: string
  blocks?: unknown[]
}

/** Send one DM. Posting to a member id lands in the app's direct conversation with that person. */
export async function sendSlackDm(slackUserId: string, dm: SlackDm): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN?.trim()
  if (!token || !slackUserId) return false
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: slackUserId, text: dm.text, blocks: dm.blocks, unfurl_links: false }),
      // A hanging Slack must not hold the serverless function open.
      signal: AbortSignal.timeout(5_000),
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!json?.ok) {
      console.error('Slack DM rejected', json?.error ?? res.status)
      return false
    }
    return true
  } catch (err) {
    console.error('Slack DM failed', err)
    return false
  }
}

const MAX_DM_RECIPIENTS = 500
const DM_BATCH = 10

/**
 * DM each of these people (by person id) who has a Slack member id on file; returns how
 * many were sent. The people are read in one go, and only those an admin has given a Slack
 * link are messaged — capped, and sent in small batches, so a publish to a big audience
 * cannot run the function out of time.
 */
export async function dmPeople(
  store: Store,
  uids: readonly string[],
  dm: SlackDm,
  /** Narrow who is messaged. */
  keep: (u: Partial<UserProfile>) => boolean = () => true,
): Promise<number> {
  const unique = Array.from(new Set(uids)).filter(Boolean)
  if (unique.length === 0) return 0
  const people = (await store.getMany('users', unique)) as Array<Partial<UserProfile>>
  const targets = people.filter((u) => u.slackUserId && keep(u)).slice(0, MAX_DM_RECIPIENTS)
  let sent = 0
  for (let k = 0; k < targets.length; k += DM_BATCH) {
    const results = await Promise.all(targets.slice(k, k + DM_BATCH).map((u) => sendSlackDm(u.slackUserId as string, dm)))
    sent += results.filter(Boolean).length
  }
  return sent
}

/**
 * Who answers for this person: their line manager plus the leads and managers of
 * their team. Unlike the in-app bell there is no "everyone" fallback — an unassigned
 * learner must not DM two dozen people.
 */
export async function leadsOf(store: Store, person: Partial<UserProfile>): Promise<string[]> {
  const out = new Set<string>()
  if (person.managerId) out.add(person.managerId)
  if (person.teamId) {
    const team = (await store.get('teams', person.teamId)) as Partial<Team> | null
    if (team) {
      for (const id of [...getTeamLeadIds(team as Team), ...getTeamManagerIds(team as Team)]) out.add(id)
    }
  }
  return Array.from(out)
}
