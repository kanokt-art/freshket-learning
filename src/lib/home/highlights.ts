// "Latest" on the learner's home: a row of cards for what is new — this week's Mandatory reading, a new
// tool, a new course, a news post. A super_admin pins the ones to show (appConfig/homeHighlights); while
// nothing is pinned, the newest few show by themselves, so the row is never empty for no reason.

export type HighlightKind = 'mandatory' | 'tool' | 'course' | 'announcement'

export interface HighlightItem {
  /** `${kind}:${id}` — what a pin refers to. */
  key: string
  kind: HighlightKind
  title: string
  subtitle?: string
  imageUrl?: string
  href: string
  at: Date
  /** Live for learners. A draft can be spotlighted ahead of time; learners see it once it is published. */
  published: boolean
}

export interface HighlightPin { key: string; pinnedAt: string }
export interface HighlightsDoc { pins?: HighlightPin[] }

export const HIGHLIGHTS_DOC = 'homeHighlights'
/** How many of the newest items show while nothing is pinned. */
export const AUTO_COUNT = 6

export const KIND_LABEL: Record<HighlightKind, string> = {
  mandatory: 'Mandatory',
  tool: 'New Tool',
  course: 'New Course',
  announcement: 'News',
}

type When = Date | string | number | null | undefined
const toDate = (w: When): Date | null => {
  if (w === null || w === undefined || w === '') return null
  const d = w instanceof Date ? w : new Date(w)
  return isNaN(d.getTime()) ? null : d
}

/** Everything that could be shown, already cut to what this person may see, newest first. */
export function highlightCandidates(src: {
  mandatory: readonly { id: string; title: string; weekLabel?: string; publishedAt?: When; createdAt?: When; isPublished?: boolean }[]
  tools: readonly { id: string; title: string; description?: string; imageUrl?: string; createdAt?: When; isPublished?: boolean }[]
  courses: readonly { id: string; title: string; description?: string; thumbnailUrl?: string; createdAt?: When; updatedAt?: When; isPublished?: boolean }[]
  announcements: readonly { id: string; title: string; body?: string; imageUrl?: string; createdAt?: When; isPublished?: boolean }[]
}): HighlightItem[] {
  const out: HighlightItem[] = []
  const push = (item: Omit<HighlightItem, 'at' | 'published'>, at: When, isPublished?: boolean) => {
    const d = toDate(at)
    out.push({ ...item, at: d ?? new Date(0), published: isPublished !== false })
  }
  for (const m of src.mandatory) {
    push({ key: `mandatory:${m.id}`, kind: 'mandatory', title: m.title, subtitle: m.weekLabel, href: '/courses/mandatory' }, m.publishedAt ?? m.createdAt, m.isPublished)
  }
  for (const t of src.tools) {
    push({ key: `tool:${t.id}`, kind: 'tool', title: t.title, subtitle: t.description, imageUrl: t.imageUrl || undefined, href: '/tools' }, t.createdAt, t.isPublished)
  }
  for (const c of src.courses) {
    // A course counts from its last update, so an updated course shows as new again.
    push({ key: `course:${c.id}`, kind: 'course', title: c.title, subtitle: c.description, imageUrl: c.thumbnailUrl || undefined, href: `/courses/${c.id}` }, c.updatedAt ?? c.createdAt, c.isPublished)
  }
  for (const a of src.announcements) {
    push({ key: `announcement:${a.id}`, kind: 'announcement', title: a.title, subtitle: a.body, imageUrl: a.imageUrl || undefined, href: '/sale' }, a.createdAt, a.isPublished)
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime())
}

/**
 * What the row shows: the pinned items the person may see, newest pin first. When none of the pins is
 * visible to them (or nothing is pinned), the newest few instead.
 */
export function pickHighlights(candidates: readonly HighlightItem[], pins: readonly HighlightPin[] | undefined): { items: HighlightItem[]; pinned: boolean } {
  const byKey = new Map(candidates.map((c) => [c.key, c]))
  const pinned = [...(pins ?? [])]
    .sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt))
    .map((p) => byKey.get(p.key))
    .filter((c): c is HighlightItem => !!c)
  if (pinned.length > 0) return { items: pinned, pinned: true }
  return { items: candidates.slice(0, AUTO_COUNT), pinned: false }
}

/** The two tabs of the row: new courses, and everything else that happened (news, Mandatory, tools). */
export type HighlightTab = 'course' | 'activity'
export const tabOf = (item: HighlightItem): HighlightTab => (item.kind === 'course' ? 'course' : 'activity')

/**
 * Something in a tab changed since the person last opened it. `seenAt` is when they last opened it
 * (ISO); never opened counts as unseen when the tab has anything in it.
 */
export function hasUnseen(items: readonly HighlightItem[], seenAt: string | null | undefined): boolean {
  const newest = items.reduce((m, i) => Math.max(m, i.at.getTime()), 0)
  if (newest === 0) return false
  const seen = seenAt ? new Date(seenAt).getTime() : 0
  return !Number.isFinite(seen) || newest > seen
}

/** The pins after turning one on or off. */
export function togglePin(pins: readonly HighlightPin[] | undefined, key: string, on: boolean, now = new Date()): HighlightPin[] {
  const rest = (pins ?? []).filter((p) => p.key !== key)
  return on ? [...rest, { key, pinnedAt: now.toISOString() }] : rest
}
