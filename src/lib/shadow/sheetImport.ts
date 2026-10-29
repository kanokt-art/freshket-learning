// One row of the Shadow Google Form → one shadowRecords document.
//
// The form's columns are Timestamp, Observer Email, Mentor Fullname, Mentor Name,
// Mentor Position, Mentor Email, Store Name, Segment, Persona, Opening/Hook, Interest
// Point, Customer Pain, Diagnostic Approach, Closing/Next Step, Slack Status.
//
// The id is derived from WHO observed and WHEN (the form's timestamp), so sending the
// same sheet again updates the same records instead of making duplicates, and the
// reviews attached to a record (keyed by its id) stay attached.
//
// What has no home, and what is done with it:
//   · Mentor Email, Mentor Name  → kept in extra fields (mentorEmail, mentorNickname)
//   · Slack Status               → not imported: it is the form's own bookkeeping
//   · bestPractice, beyondClassroom → the form has no such question, so they are blank
//   · Timestamp                  → read as written (d/m/yyyy, Buddhist year); see parseSheetTimestamp
//   · Segment / Persona          → kept as typed; values outside the app's lists are
//                                  reported (see unknownChoices) rather than changed

export const SEGMENTS = ['Mini Chain', 'Stand alone', 'Chain']
export const PERSONAS = ['Chef', 'Owner', 'Purchasing', 'Manager']

export interface ShadowSheetRow {
  timestamp?: string
  observerEmail?: string
  mentorFullname?: string
  mentorName?: string
  mentorPosition?: string
  mentorEmail?: string
  storeName?: string
  segment?: string
  persona?: string
  opening?: string
  interestPoint?: string
  customerPain?: string
  diagnosticApproach?: string
  closingNextStep?: string
}

export type Mapped =
  | { ok: true; id: string; data: Record<string, unknown>; unknownChoices: string[] }
  | { ok: false; reason: string }

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * When the form was sent, from what the sheet SHOWS.
 *
 * The Shadow sheet writes "04/03/2569 21:15:57": day/month, in the Buddhist year, Thai
 * time. Reading the cell's underlying date instead goes wrong twice over: Sheets takes
 * 04/03 as April 3rd, and 2569 as a Gregorian year — and a date such as 17/03/2569, which
 * cannot be month/day, stays text and has no date at all. So the text is read as written:
 *
 *   · d/m/yyyy [h:mm[:ss]], a year above 2400 being Buddhist (minus 543) — Thai time
 *   · or an ISO timestamp (what the app and the tests send)
 *
 * Anything else, or a day that does not exist (31/02), is null rather than a guess.
 */
export function parseSheetTimestamp(raw: string): Date | null {
  const text = raw.trim()
  if (!text) return null

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const d = new Date(text)
    return isNaN(d.getTime()) ? null : d
  }

  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const day = Number(m[1]), month = Number(m[2])
  const year = Number(m[3]) > 2400 ? Number(m[3]) - 543 : Number(m[3])
  const hour = Number(m[4] ?? 0), minute = Number(m[5] ?? 0), second = Number(m[6] ?? 0)
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null

  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null   // e.g. 31/02

  const pad = (n: number) => String(n).padStart(2, '0')
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+07:00`)
}

/** A visit cannot have happened tomorrow. A date this far ahead means it was read wrongly. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000

export function shadowId(observerEmail: string, taken: Date): string {
  const who = observerEmail.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `gs-${who}-${taken.getTime()}`
}

/** `observer` is who the email belongs to, or null if nobody. */
export function toShadowRecord(
  row: ShadowSheetRow,
  observer: { uid: string; name: string } | null,
  now: Date = new Date(),
): Mapped {
  const email = t(row.observerEmail).toLowerCase()
  if (!email.includes('@')) return { ok: false, reason: 'ไม่มีอีเมลผู้สังเกต' }

  const stamp = t(row.timestamp)
  const taken = parseSheetTimestamp(stamp)
  if (!taken) {
    return { ok: false, reason: stamp ? `อ่านวันที่ไม่ได้ ("${stamp}")` : 'ไม่มีเวลาที่ส่งฟอร์ม (Timestamp)' }
  }
  if (taken.getTime() > now.getTime() + FUTURE_SLACK_MS) {
    return { ok: false, reason: `วันที่อยู่ในอนาคต ("${stamp}") — น่าจะอ่านปีหรือวัน/เดือนผิด` }
  }

  if (!observer) return { ok: false, reason: `ไม่พบพนักงานตามอีเมล ${email}` }

  const unknownChoices: string[] = []
  const segment = t(row.segment)
  const persona = t(row.persona)
  if (segment && !SEGMENTS.includes(segment)) unknownChoices.push(`Segment "${segment}"`)
  if (persona && !PERSONAS.includes(persona)) unknownChoices.push(`Persona "${persona}"`)

  const data: Record<string, unknown> = {
    observerUid: observer.uid,
    observerEmail: email,
    observerName: observer.name,
    mentorName: t(row.mentorFullname) || t(row.mentorName),
    mentorPosition: t(row.mentorPosition),
    storeName: t(row.storeName),
    segment,
    persona,
    opening: t(row.opening),
    interestPoint: t(row.interestPoint),
    customerPain: t(row.customerPain),
    diagnosticApproach: t(row.diagnosticApproach),
    closingNextStep: t(row.closingNextStep),
    bestPractice: '',
    beyondClassroom: '',
    createdAt: taken,
    updatedAt: taken,
  }
  if (t(row.mentorEmail)) data.mentorEmail = t(row.mentorEmail).toLowerCase()
  if (t(row.mentorName) && t(row.mentorFullname)) data.mentorNickname = t(row.mentorName)

  return { ok: true, id: shadowId(email, taken), data, unknownChoices }
}
