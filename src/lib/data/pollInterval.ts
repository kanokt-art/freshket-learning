// How often a live query looks for OTHER people's changes.
//
// Choose by how fast the data changes, because the cost is per open tab: the
// employee list alone is ~450 kB and every open page asks for it again each time
// round. A person's own saves never wait for this — they refresh at once.

const SECOND = 1_000

export const POLL_NOTIFICATIONS_MS = 30 * SECOND   // someone is waiting to see these
export const POLL_DEFAULT_MS = 60 * SECOND         // courses, results, progress, …
export const POLL_SLOW_MS = 5 * 60 * SECOND        // changes a few times a day at most

// The employee list, org structure and app configuration. HR data moves with an
// import, not minute to minute.
const SLOW_COLLECTIONS = new Set(['users', 'teams', 'departments', 'appConfig'])

/** `path` is a collection path, e.g. `courses` or `notifications/{uid}/items`. */
export function pollIntervalFor(path: string): number {
  if (path.startsWith('notifications/')) return POLL_NOTIFICATIONS_MS
  return SLOW_COLLECTIONS.has(path) ? POLL_SLOW_MS : POLL_DEFAULT_MS
}
