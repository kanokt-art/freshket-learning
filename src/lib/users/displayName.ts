// One place that decides how a person's name is written in the UI.
//
// The agreed format is "ชื่อจริง(ชื่อเล่น)นามสกุล" — first name, then the
// nickname in parentheses, then the surname: "Sasaluk (Dutchmill) Tianthiti".
// The nickname sits in the MIDDLE, which is what makes this worth a shared
// helper: several screens previously appended it instead ("Sasaluk Tianthiti
// (Dutchmill)"), so the same person read differently from table to table.
//
// English is preferred over the Thai display name because these screens are
// matched against the HR system and English-language reporting.

interface NameParts {
  displayNameEN?: string
  displayName?: string
  nickname?: string
  email?: string
}

/**
 * Format a person as "Firstname (Nickname) Lastname".
 *
 * Falls back through displayNameEN → displayName → email, and degrades
 * gracefully: with no nickname it is just the full name, and with a
 * single-word name the nickname follows it ("Sasaluk (Dutchmill)") rather
 * than being dropped.
 */
export function formatPersonName(u: NameParts): string {
  const full = (u.displayNameEN ?? '').trim() || (u.displayName ?? '').trim() || (u.email ?? '').trim()
  const nickname = (u.nickname ?? '').trim()
  if (!nickname) return full
  if (!full) return nickname

  // Split on the FIRST whitespace only: everything after it is the surname,
  // so a middle name or a multi-word surname stays intact on the right side.
  const match = full.match(/^(\S+)\s+(.*)$/)
  if (!match) return `${full} (${nickname})` // single word — nothing to insert between
  const [, first, rest] = match
  return `${first} (${nickname}) ${rest}`
}
