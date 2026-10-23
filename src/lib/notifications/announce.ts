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
      courseTitle: string
      recipientCount: number
      /** True when the course was already live and people were added to it. */
      isAddition?: boolean
      path?: string
    }
  | {
      kind: 'mandatory_published'
      title: string
      departments: string[]
      recipientCount: number
      path?: string
    }
  | {
      kind: 'shadow_submitted'
      observerName: string
      visitSummary: string
      position?: string
      department?: string
      path?: string
    }
  | {
      kind: 'shadow_acked'
      reviewerName: string
      observerName: string
      rating?: number
      path?: string
    }

export async function announce(event: AnnounceEvent): Promise<void> {
  if (DEMO_MODE) return

  try {
    const { authedFetch } = await import('@/lib/api/authedFetch')
    const res = await authedFetch('/api/notifications/announce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
    if (!res.ok) {
      console.error('announce rejected', event.kind, res.status, await res.text())
    }
  } catch (err) {
    console.error('announce failed', event.kind, err)
  }
}
