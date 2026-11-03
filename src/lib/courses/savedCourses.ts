// "Save for later": the courses a learner bookmarked in the Library. Kept in this browser only (per
// person), so it is a convenience, not a record — it does not follow them to another device.

const key = (uid: string) => `fk_saved_courses_${uid}`

export function readSaved(uid: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(uid)) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function writeSaved(uid: string, ids: string[]): void {
  try { localStorage.setItem(key(uid), JSON.stringify(ids)) } catch { /* storage blocked: stays for this visit only */ }
}

export function toggleSaved(ids: readonly string[], courseId: string): string[] {
  return ids.includes(courseId) ? ids.filter((i) => i !== courseId) : [...ids, courseId]
}
