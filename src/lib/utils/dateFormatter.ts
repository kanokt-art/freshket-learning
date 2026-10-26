export type DateLike = Date | string | undefined | null

// Exported so callers that need the underlying Date (not just a formatted
// string) — e.g. a table's sort comparator — normalize the same way this
// module's own formatters do. A user's startDate is a real Date once it comes
// from the data client, but a record still sitting in the localStorage
// import overlay round-trips through JSON.stringify/parse first, which turns
// it into a plain ISO string. A comparator that only accepted `instanceof
// Date` silently treated every such row as epoch 0 (sorting it as if newer
// than everyone, or older, depending on direction) while this same value
// still *displayed* correctly via formatDate/formatDateEN below — sort and
// display disagreeing is far more confusing than either being wrong outright.
export function toDate(date: DateLike): Date | null {
  if (!date) return null
  if (date instanceof Date) return date
  // ISO string from JSON.parse
  const d = new Date(date)
  return isNaN(d.getTime()) ? null : d
}

export function formatDate(date: DateLike): string {
  const d = toDate(date)
  if (!d) return '-'
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Returns English format e.g. "07 Jan 2026" */
export function formatDateEN(date: DateLike): string {
  const d = toDate(date)
  if (!d) return '—'
  const day  = String(d.getDate()).padStart(2, '0')
  const mon  = d.toLocaleDateString('en-GB', { month: 'short' })
  const year = d.getFullYear()
  return `${day} ${mon} ${year}`
}

/**
 * "เมื่อกี้" / "3 นาทีที่แล้ว" / "เมื่อวาน" / "12 ม.ค."
 *
 * Lived in the notification list until that feature was replaced by Slack;
 * it is a plain date helper and nothing about it was notification-specific.
 */
export function relativeTime(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return 'เมื่อกี้'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`
  if (diff < 172800) return 'เมื่อวาน'
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}
