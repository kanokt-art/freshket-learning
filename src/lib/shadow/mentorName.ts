import { formatPersonName } from '@/lib/users/displayName'

// A Shadow Visit stores its mentor as text only: the app's form kept a nickname ("Mint"), the Google Form
// sheet a full name ("Nichapa Sakhaow"). Wherever it is shown it reads "First (Nickname) Surname" like every
// other person in the app, found from the staff list when the text names one person, and built from what the
// record itself carries when it does not.

interface Person {
  email?: string
  displayName?: string
  displayNameEN?: string
  nickname?: string
}

export interface MentorFields {
  mentorName?: string
  /** From the Google Form sheet: the mentor's company email, when the form asked for it. */
  mentorEmail?: string
  /** From the Google Form sheet: the nickname the form held beside the full name. */
  mentorNickname?: string
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function mentorDisplayName(rec: MentorFields, people: readonly Person[]): string {
  const raw = (rec.mentorName ?? '').trim()
  if (!raw) return ''
  // Already written as "First (Nickname) Surname": leave it.
  if (/\(.+\)/.test(raw)) return raw

  const email = norm(rec.mentorEmail)
  if (email) {
    const byEmail = people.find((p) => norm(p.email) === email)
    if (byEmail) return formatPersonName(byEmail)
  }

  // The text names someone: their English name, Thai name or nickname — only when exactly one person fits,
  // so two people sharing a nickname are not mixed up.
  const key = norm(raw)
  const matches = people.filter((p) => norm(p.displayNameEN) === key || norm(p.displayName) === key || norm(p.nickname) === key)
  if (matches.length === 1) return formatPersonName(matches[0])

  // Nobody found: use what the record carries. A full name with its nickname becomes "First (Nick) Surname".
  const nick = (rec.mentorNickname ?? '').trim()
  if (nick && raw.includes(' ')) return formatPersonName({ displayNameEN: raw, nickname: nick })
  return raw
}
