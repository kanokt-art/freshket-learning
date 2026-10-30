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
import type { UserProfile } from '@/types/user'

export interface SlackDm {
  /** Plain text: the notification preview, and what clients that cannot draw blocks show. */
  text: string
  blocks?: unknown[]
}

export interface SlackLookup {
  id?: string
  /** Why there is no id: not in this workspace, a missing scope, rate limited, or a failure. */
  reason?: 'not_found' | 'missing_scope' | 'rate_limited' | 'error' | 'no_token'
}

/**
 * Find someone's Slack member id from their email (users.lookupByEmail). Needs the app's
 * users:read and users:read.email scopes. Never throws.
 */
export async function findSlackIdByEmail(email: string): Promise<SlackLookup> {
  const token = process.env.SLACK_BOT_TOKEN?.trim()
  if (!token) return { reason: 'no_token' }
  try {
    const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email.trim())}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (res.status === 429) return { reason: 'rate_limited' }
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; user?: { id?: string } } | null
    if (json?.ok && json.user?.id) return { id: json.user.id }
    if (json?.error === 'users_not_found') return { reason: 'not_found' }
    if (json?.error === 'missing_scope') return { reason: 'missing_scope' }
    if (json?.error === 'ratelimited') return { reason: 'rate_limited' }
    console.error('Slack lookupByEmail rejected', json?.error ?? res.status)
    return { reason: 'error' }
  } catch (err) {
    console.error('Slack lookupByEmail failed', err)
    return { reason: 'error' }
  }
}

// People Slack could not find, remembered for a while so every event does not ask again.
const MISS_TTL_MS = 10 * 60 * 1000
const misses = new Map<string, number>()

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
  const people = ((await store.getMany('users', unique)) as unknown as Array<Partial<UserProfile> & { id: string }>).filter(keep)

  // Someone with no Slack id yet is looked up by email, and remembered if found. Stops
  // asking for the rest of this call once Slack says to slow down or the scope is missing.
  let lookupsOpen = true
  async function slackIdOf(u: Partial<UserProfile> & { id: string }): Promise<string | null> {
    if (u.slackUserId) return u.slackUserId
    if (!lookupsOpen || !u.email) return null
    const missedAt = misses.get(u.email)
    if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null
    const found = await findSlackIdByEmail(u.email)
    if (found.id) {
      try { await store.update('users', u.id, { slackUserId: found.id }) } catch (err) { console.error('could not save Slack id', err) }
      return found.id
    }
    if (found.reason === 'not_found') misses.set(u.email, Date.now())
    if (found.reason === 'missing_scope' || found.reason === 'rate_limited' || found.reason === 'no_token') lookupsOpen = false
    return null
  }

  let sent = 0
  const capped = people.slice(0, MAX_DM_RECIPIENTS)
  for (let k = 0; k < capped.length; k += DM_BATCH) {
    const results = await Promise.all(capped.slice(k, k + DM_BATCH).map(async (u) => {
      const id = await slackIdOf(u)
      return id ? sendSlackDm(id, dm) : false
    }))
    sent += results.filter(Boolean).length
  }
  return sent
}
