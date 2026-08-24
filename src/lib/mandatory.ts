// Shared model + seed data + helpers for Mandatory Reading (weekly Product
// Knowledge slides). Used by the admin CRUD page (tools/mandatory) and the
// read-only learner list under My Course (courses/mandatory).

export interface MandatoryItem {
  id: string
  title: string
  description: string
  slidesUrl: string
  weekLabel: string
  isPublished: boolean
  publishedAt: Date
  createdAt: Date
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

export function currentWeekLabel(): string {
  const now = new Date()
  const onejan = new Date(now.getFullYear(), 0, 1)
  const week = Math.ceil(((now.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)
  const month = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return `Week ${week} / ${month}`
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
    publishedAt: new Date('2026-06-09T09:00:00'),
    createdAt: new Date('2026-06-08T14:00:00'),
  },
]
