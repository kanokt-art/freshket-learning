import { Timestamp } from 'firebase/firestore'

export type DateLike = Date | Timestamp | string | undefined | null

// Exported so callers that need the underlying Date (not just a formatted
// string) — e.g. a table's sort comparator — normalize the same way this
// module's own formatters do. A user's startDate is a real Date once it comes
// through convertTimestamps(), but a record still sitting in the localStorage
// import overlay round-trips through JSON.stringify/parse first, which turns
// it into a plain ISO string. A comparator that only accepted `instanceof
// Date` silently treated every such row as epoch 0 (sorting it as if newer
// than everyone, or older, depending on direction) while this same value
// still *displayed* correctly via formatDate/formatDateEN below — sort and
// display disagreeing is far more confusing than either being wrong outright.
export function toDate(date: DateLike): Date | null {
  if (!date) return null
  if (date instanceof Timestamp) return date.toDate()
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

