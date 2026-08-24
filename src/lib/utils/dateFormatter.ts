import { Timestamp } from 'firebase/firestore'

type DateLike = Date | Timestamp | string | undefined | null

function toDate(date: DateLike): Date | null {
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

