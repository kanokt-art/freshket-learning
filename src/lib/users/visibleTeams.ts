// Validation for the `visibleTeamIds` field on a user document.
//
// Extracted from the save-assignments route so it can be unit-tested without
// pulling in the Firebase Admin SDK: that route runs on the Admin SDK, which
// bypasses firestore.rules entirely, so this function is the ONLY thing
// standing between a client payload and the field that drives team visibility
// across the app. It is worth testing directly.

/** A team id is a Firestore document id; anything else is a malformed client. */
const TEAM_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Generous upper bound — the org has ~12 teams. This exists only to stop a
 * single request from writing an unbounded array into a user document.
 */
export const MAX_VISIBLE_TEAMS = 200

/**
 * Normalize `visibleTeamIds` from an untrusted request body.
 *
 * - `null` → `null`, meaning "clear the override" (an explicit, valid choice).
 * - a clean array → the same ids, de-duplicated (order is not meaningful).
 * - anything else → `undefined`, meaning the caller must reject the assignment.
 *
 * The value previously went to Firestore exactly as sent, so a manager could
 * store non-strings, nested objects, or an arbitrarily long array here.
 */
export function cleanVisibleTeamIds(value: unknown): string[] | null | undefined {
  if (value === null) return null
  if (!Array.isArray(value) || value.length > MAX_VISIBLE_TEAMS) return undefined
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string' || !TEAM_ID_RE.test(v)) return undefined
    if (!out.includes(v)) out.push(v)
  }
  return out
}
