// Shared model + seed data + helpers for Mandatory Reading (weekly Product
// Knowledge slides). Used by the admin CRUD page (tools/mandatory) and the
// read-only learner list under My Course (courses/mandatory).

// One department granted access to an item, and whether that grant reaches
// backward into the archive.
//
// `showHistory: true` means: the moment this item is published, department
// gets to see every OTHER published item that came before it too — not just
// this one. It is a one-time grant tied to this specific item, not a standing
// department setting: a later item that selects the same department again
// must tick it again if the intent is still "show them everything so far".
// This is deliberate (confirmed with the requester) rather than an oversight —
// a department newly added to Mandatory Reading usually should NOT see a wall
// of old content by default, only what's published from here on, unless the
// admin explicitly opts them into the backlog on this item.
export interface MandatoryDeptAccess {
  department: string
  showHistory: boolean
}

export interface MandatoryItem {
  id: string
  title: string
  description: string
  slidesUrl: string
  weekLabel: string
  isPublished: boolean
  // Empty = every department (no showHistory grant needed — everyone already
  // sees everything). Otherwise each entry both targets a department AND
  // states whether picking it here also unlocks the archive for them.
  departmentAccess: MandatoryDeptAccess[]
  publishedAt: Date
  createdAt: Date
  createdBy?: string
}

/** Departments explicitly targeted by an item — the flattened access list. */
export function mandatoryDepartments(item: Pick<MandatoryItem, 'departmentAccess'>): string[] {
  return item.departmentAccess.map((a) => a.department)
}

// Visible to a department if:
//   · the item is published, AND
//   · it targets no department in particular (open to everyone), OR the
//     viewer's department is directly targeted, OR some OTHER published item
//     granted the viewer's department a showHistory backfill that reaches back
//     at least as far as this item's publish date.
//
// The third clause is what makes showHistory retroactive: it does not touch
// old documents when granted, it just widens what the visibility check accepts
// at read time — so granting it later still surfaces everything before it.
export function isMandatoryVisibleTo(
  item: MandatoryItem,
  department: string | null | undefined,
  allItems: MandatoryItem[],
): boolean {
  if (!item.isPublished) return false
  const targets = mandatoryDepartments(item)
  if (targets.length === 0) return true
  if (department && targets.includes(department)) return true

  if (!department) return false
  return allItems.some((other) =>
    other.isPublished
    && other.departmentAccess.some((a) => a.department === department && a.showHistory)
    && other.publishedAt.getTime() >= item.publishedAt.getTime(),
  )
}

// Convert a Google Slides edit URL into an embeddable preview URL.
export function toEmbedUrl(url: string): string {
  const m = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) return url
  return `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false&delayms=0&rm=minimal`
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Week Label and title are both derived from a single date the admin picks
// (weekLabelForDate / mandatoryTitleFor), rather than typed by hand, so the two
// can never disagree about which week an item belongs to.
export function weekLabelForDate(date: Date): string {
  const onejan = new Date(date.getFullYear(), 0, 1)
  const week = Math.ceil(((date.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)
  const month = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return `Week ${week} / ${month}`
}

export function currentWeekLabel(): string {
  return weekLabelForDate(new Date())
}

// "Mandatory-Week37 Sep 2026" — the standing title format (confirmed with the
// requester) so every item's title states its week/month/year without the
// admin retyping it, and two items for the same week never drift into
// differently-worded titles.
export function mandatoryTitleFor(date: Date): string {
  const onejan = new Date(date.getFullYear(), 0, 1)
  const week = Math.ceil(((date.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  return `Mandatory-Week${week} ${month} ${date.getFullYear()}`
}

/** yyyy-mm-dd for an <input type="date"> value, in local time (not UTC). */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parses an <input type="date"> value back into a local-time Date at noon
 * (noon, not midnight, so a timezone offset can never roll it into the
 * adjacent day when it's later converted to/from UTC for Firestore). */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0)
}

// ── Archive grouping ──────────────────────────────────────────────────────────
// Content lands weekly and never gets deleted, so the list only ever grows. Both
// Mandatory pages render it as an archive: newest month first, grouped by month,
// with the years/months (and their counts) driving the side rail.

export interface MonthGroup {
  key: string          // '2026-06' — stable anchor id
  year: number
  month: number        // 0-11
  label: string        // 'มิถุนายน 2026'
  items: MandatoryItem[]
}

export interface YearGroup {
  year: number
  count: number
  months: MonthGroup[]
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Newest month first; items inside each month newest first.
export function groupByMonth(items: MandatoryItem[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>()
  for (const item of items) {
    const d = item.publishedAt
    const key = monthKey(d)
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
        items: [],
      }
      map.set(key, group)
    }
    group.items.push(item)
  }
  const groups = Array.from(map.values())
  groups.sort((a, b) => b.key.localeCompare(a.key))
  groups.forEach(g => g.items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()))
  return groups
}

export function groupByYear(months: MonthGroup[]): YearGroup[] {
  const map = new Map<number, YearGroup>()
  for (const m of months) {
    let year = map.get(m.year)
    if (!year) {
      year = { year: m.year, count: 0, months: [] }
      map.set(m.year, year)
    }
    year.months.push(m)
    year.count += m.items.length
  }
  return Array.from(map.values()).sort((a, b) => b.year - a.year)
}

export const DEMO_MANDATORY_ITEMS: MandatoryItem[] = [
  {
    id: 'mand-draft-01',
    title: 'Dry Aged Beef — Product Knowledge',
    description: 'อัปเดต Dry Aged Beef Grades A5/A4 สำหรับ High-End Restaurant, Positioning, ราคา และ Talking Point สำหรับ KA (กำลัง update...)',
    slidesUrl: 'https://docs.google.com/presentation/d/1demoIDdraft001/edit',
    weekLabel: 'Week 26 / Jun 2026',
    isPublished: false,
    departmentAccess: [],
    publishedAt: new Date('2026-06-30T09:00:00'),
    createdAt: new Date('2026-06-25T10:00:00'),
  },
  {
    id: 'mand-03',
    title: 'Premium Fresh Seafood — Product Line ใหม่ Q3',
    description: 'อัปเดต Seafood ไลน์ใหม่: Salmon Atlantic, Seabass Norway, Prawn L-Size ราคาและ spec ครบ พร้อม Talking Point สำหรับ KA และ Stand-Alone',
    slidesUrl: 'https://docs.google.com/presentation/d/1demoID003/edit',
    weekLabel: 'Week 25 / Jun 2026',
    isPublished: true,
    departmentAccess: [],
    publishedAt: new Date('2026-06-23T09:00:00'),
    createdAt: new Date('2026-06-22T18:00:00'),
  },
  {
    id: 'mand-02',
    title: 'Objection Handling — ราคา & เจ้าอื่นถูกกว่า',
    description: "Framework 4 ขั้น รับมือ Objection ด้านราคา, Script สำเร็จรูป 6 สถานการณ์, Do's & Don'ts ที่พบบ่อยในสนาม",
    slidesUrl: 'https://docs.google.com/presentation/d/1demoID002/edit',
    weekLabel: 'Week 24 / Jun 2026',
    isPublished: true,
    departmentAccess: [],
    publishedAt: new Date('2026-06-16T09:00:00'),
    createdAt: new Date('2026-06-15T15:00:00'),
  },
  {
    id: 'mand-01',
    title: 'ผักออร์แกนิก Certified — Update คุณสมบัติและราคา',
    description: 'รายการผักออร์แกนิกที่ได้ใบรับรองใหม่ 12 รายการ, Positioning กับลูกค้า Premium, ข้อดีเทียบ Makro & Tops',
    slidesUrl: 'https://docs.google.com/presentation/d/1demoID001/edit',
    weekLabel: 'Week 23 / Jun 2026',
    isPublished: true,
    departmentAccess: [],
    publishedAt: new Date('2026-06-09T09:00:00'),
    createdAt: new Date('2026-06-08T14:00:00'),
  },
]
