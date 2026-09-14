// Parses the "Start Date" / "Last Date" columns from the HR employee export.
//
// Extracted so this can be unit-tested directly — it previously lived inline
// in the Employees page and its only real-world coverage was whatever
// happened to reach that page in a browser.

/**
 * The HR export spells September as "Sept" (4 letters) while every other
 * month uses the standard 3-letter form ("Jun", "Oct", "Aug", ...) — confirmed
 * against a real export. "Sept" is listed explicitly (not just "any 3-4 letter
 * prefix") so a genuine typo in the export still fails loudly instead of being
 * guessed at.
 */
const MONTH_SHORT: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Sept: 9, Oct: 10, Nov: 11, Dec: 12,
}

/**
 * Parse one HR-export date cell into a Date, or undefined if it can't be
 * read confidently.
 *
 * Handles, in order:
 * 1. "DD-Mon-YYYY" / "DD-Mon(4-letter)-YYYY" — e.g. "27-Aug-2018",
 *    "19-Sept-2016". This is the format the real export actually uses, parsed
 *    explicitly rather than left to the JS engine's built-in string parser:
 *    non-ISO string parsing is implementation-defined per spec, so the same
 *    string can parse differently (or fail entirely, returning Invalid Date)
 *    across browsers. A row that fails here would otherwise silently lose its
 *    startDate with no visible error — every date-dependent view just treats
 *    the employee as if they had no start date at all.
 * 2. "DD/MM/YYYY".
 * 3. Whatever `new Date(s)` can make of it, as a last resort for formats not
 *    seen above (e.g. an already-ISO string from a re-exported file).
 */
export function parseCsvDate(s: string): Date | undefined {
  if (!s) return undefined

  const m1 = s.match(/^(\d{1,2})-([A-Za-z]{3,4})-(\d{4})$/)
  if (m1) {
    const mo = MONTH_SHORT[m1[2].charAt(0).toUpperCase() + m1[2].slice(1).toLowerCase()]
    if (mo) {
      const d = new Date(parseInt(m1[3]), mo - 1, parseInt(m1[1]))
      if (!isNaN(d.getTime())) return d
    }
  }

  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m2) {
    const d = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]))
    if (!isNaN(d.getTime())) return d
  }

  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}
