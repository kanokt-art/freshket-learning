import { getDemoMode } from '@/lib/demo/demoMode'

const DEMO_MODE = getDemoMode()

/**
 * Announce a training event to the Slack channel.
 *
 * Replaces pushNotification, which wrote a row per recipient for an in-app
 * bell. Two differences follow from the channel being shared rather than
 * personal:
 *
 *  · ONE CALL PER EVENT. The old helper was invoked inside a loop over the
 *    audience; this one is called once with a headcount. Publishing a course
 *    to fifty people posts once, not fifty times.
 *  · NO MESSAGE TEXT. The caller passes facts (a title, a count, a path) and
 *    the server composes the wording, so nothing the browser sends can become
 *    arbitrary text in a channel the whole company reads.
 *
 * Fire-and-forget: an announcement must never break the action that triggered
 * it, so failures are logged and swallowed. Callers do not await it.
 */
export type AnnounceEvent =
  | {
      kind: 'course_published'
      /** The course announced. The server reads its title from the database; super_admin only. */
      courseId: string
      /** The course's own title, the default of the preview (the server reads the real one). */
      courseTitle: string
      /** The course's own description, the default of the preview. */
      courseDescription?: string
      /**
       * What the admin changed in the preview, if anything (super_admin only; the server clamps
       * and escapes it). Left out when unchanged, so the course's own text is used.
       */
      customTitle?: string
      customDescription?: string
      recipientCount: number
      /** True when the course was already live and people were added to it. */
      isAddition?: boolean
    }
  | {
      kind: 'mandatory_published'
      /** The item announced. The server reads its title and departments from the database; super_admin only. */
      itemId: string
      /** For the confirmation dialog only: the server ignores it. */
      title: string
      /** The server messages these people privately (it re-checks the departments). */
      recipientUids?: string[]
      recipientCount: number
    }
  | {
      /**
       * The sender's name, position and department are NOT passed: the server
       * reads them from the caller's own HR record, which it can do because
       * the token already identifies them.
       */
      kind: 'shadow_submitted'
      /** The visit announced: must be the caller's own. The server writes the summary from it. */
      recordId: string
    }
  | {
      kind: 'shadow_acked'
      /** The visit reviewed: the caller must have given a review of it. The server looks up who to tell and what was given. */
      recordId: string
    }

/** What an announcement did: whether a channel post went out, and how many people got a Slack DM. */
export interface AnnounceResult {
  posted: boolean
  dmSent: number
  /** Person ids who received a Slack DM (Mandatory only), so the in-app bell can skip them. */
  dmUids?: string[]
}

export async function announce(event: AnnounceEvent): Promise<AnnounceResult> {
  const none: AnnounceResult = { posted: false, dmSent: 0 }
  if (DEMO_MODE) return none

  try {
    const { authedFetch } = await import('@/lib/api/authedFetch')
    const res = await authedFetch('/api/notifications/announce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
    if (!res.ok) {
      console.error('announce rejected', event.kind, res.status, await res.text())
      return none
    }
    const j = (await res.json().catch(() => null)) as { posted?: boolean; dmSent?: number; dmUids?: string[] } | null
    return {
      posted: j?.posted === true,
      dmSent: typeof j?.dmSent === 'number' ? j.dmSent : 0,
      dmUids: Array.isArray(j?.dmUids) ? j.dmUids.filter((x): x is string => typeof x === 'string') : [],
    }
  } catch (err) {
    console.error('announce failed', event.kind, err)
    return none
  }
}
