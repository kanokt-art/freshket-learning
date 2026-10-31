// Length of service as "X ปี Y เดือน Z วัน", worked out by calendar fields (years, months, days
// by subtraction) rather than dividing by an average year, so a joiner from last week reads
// "7 วัน" and a person who started on the 31st does not lose a day in a short month.

type DateLike = Date | string | null | undefined

function toDate(v: DateLike): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "2 ปี 3 เดือน 5 วัน"; "วันนี้" on the first day; "—" when there is no usable start date. */
export function formatTenure(startDate: DateLike, now: Date = new Date()): string {
  const d = toDate(startDate)
  if (!d) return '—'

  let years = now.getFullYear() - d.getFullYear()
  let months = now.getMonth() - d.getMonth()
  let days = now.getDate() - d.getDate()

  if (days < 0) {
    months -= 1
    // Days in the month before `now`: the right denominator for a negative day difference.
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years <= 0 && months <= 0 && days <= 0) return 'วันนี้'

  const parts: string[] = []
  if (years > 0) parts.push(`${years} ปี`)
  if (months > 0) parts.push(`${months} เดือน`)
  if (days > 0) parts.push(`${days} วัน`)
  return parts.join(' ')
}

/** The same text for a badge, or null when the start date is missing or still in the future. */
export function tenureLabel(startDate: DateLike, now: Date = new Date()): string | null {
  const d = toDate(startDate)
  if (!d || d.getTime() > now.getTime()) return null
  return formatTenure(d, now)
}
