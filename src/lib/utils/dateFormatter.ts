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

export function formatDateTime(date: DateLike): string {
  const d = toDate(date)
  if (!d) return '-'
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(date: DateLike): string {
  const d = toDate(date)
  if (!d) return '-'
  const diffMs = Date.now() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffDays === 0) return 'วันนี้'
  if (diffDays === 1) return 'เมื่อวาน'
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} สัปดาห์ที่แล้ว`
  return formatDate(d)
}

export function toFirestoreTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}
