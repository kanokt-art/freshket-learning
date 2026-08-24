// localStorage keys for a learner's in-browser course progress.
//
// These keys used to be `course_prog_{courseId}` with no user in them, so every
// account signing in on the same browser profile shared one slot: two people on
// a shared machine saw each other's progress and overwrote it, and an admin
// previewing a course polluted their own record. They are now namespaced by uid.
//
// Read/write goes through these helpers (plus readScoped/writeScoped) so the
// course page and the assessment page can never drift apart on the key format —
// the assessment page writes the score into the same slot the course page reads.

export function progKey(uid: string, courseId: string)     { return `course_prog_${uid}_${courseId}` }
export function statusKey(uid: string, courseId: string)   { return `course_status_${uid}_${courseId}` }
export function takeawayKey(uid: string, courseId: string) { return `course_takeaway_${uid}_${courseId}` }

// ── Legacy adoption ──────────────────────────────────────────────────────────
// Pre-namespacing values are still on disk for anyone mid-course. We can adopt
// them, but only for ONE account per browser profile: the legacy slot has no
// owner recorded, so handing it to whoever signs in next could credit one
// person's completed lessons to another — and because progress mirrors into
// trainingRecords, that would fabricate a training record. So the first account
// to look claims the legacy data (it is almost certainly theirs — the shared-
// browser case is the rare one), and every later account starts clean instead.
const OWNER_KEY = 'course_prog_legacy_owner'

function legacyOwnerAllows(uid: string): boolean {
  try {
    const owner = localStorage.getItem(OWNER_KEY)
    if (owner === null) { localStorage.setItem(OWNER_KEY, uid); return true }
    return owner === uid
  } catch {
    return false
  }
}

/**
 * Value for `scopedKey`, falling back once to the un-namespaced `legacyKey`.
 * On a successful fallback the value is copied into the scoped key so the next
 * read is direct, and the legacy key is dropped.
 */
export function readScoped(uid: string, scopedKey: string, legacyKey: string): string | null {
  try {
    const scoped = localStorage.getItem(scopedKey)
    if (scoped !== null) return scoped

    const legacy = localStorage.getItem(legacyKey)
    if (legacy === null) return null
    if (!legacyOwnerAllows(uid)) return null

    localStorage.setItem(scopedKey, legacy)
    localStorage.removeItem(legacyKey)
    return legacy
  } catch {
    return null
  }
}
