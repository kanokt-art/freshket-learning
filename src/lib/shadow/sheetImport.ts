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

export function shadowId(observerEmail: string, taken: Date): string {
  const who = observerEmail.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `gs-${who}-${taken.getTime()}`
}

/** `observer` is who the email belongs to, or null if nobody. */
export function toShadowRecord(row: ShadowSheetRow, observer: { uid: string; name: string } | null): Mapped {
  const email = t(row.observerEmail).toLowerCase()
  if (!email.includes('@')) return { ok: false, reason: 'ไม่มีอีเมลผู้สังเกต' }

  const stamp = t(row.timestamp)
  const taken = stamp ? new Date(stamp) : null
  if (!taken || isNaN(taken.getTime())) return { ok: false, reason: 'ไม่มีเวลาที่ส่งฟอร์ม (Timestamp)' }

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
