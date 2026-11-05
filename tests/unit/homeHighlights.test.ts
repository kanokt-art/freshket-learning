import { describe, it, expect } from 'vitest'
import { highlightCandidates, pickHighlights, togglePin, hasUnseen, tabOf, AUTO_COUNT } from '@/lib/home/highlights'

const day = (n: number) => new Date(Date.UTC(2026, 10, n))

const candidates = highlightCandidates({
  mandatory: [{ id: 'm1', title: 'Mandatory week 44', weekLabel: 'W44', publishedAt: day(3) }],
  tools: [{ id: 't1', title: 'Price calculator', createdAt: day(5) }],
  courses: [{ id: 'c1', title: 'Closing', createdAt: day(1) }],
  announcements: [{ id: 'a1', title: 'Town hall', createdAt: day(4) }],
})

describe('highlightCandidates', () => {
  it('lists every kind newest first with its link', () => {
    expect(candidates.map((c) => c.key)).toEqual(['tool:t1', 'announcement:a1', 'mandatory:m1', 'course:c1'])
    expect(candidates.find((c) => c.kind === 'course')?.href).toBe('/courses/c1')
    expect(candidates.find((c) => c.kind === 'mandatory')?.href).toBe('/courses/mandatory')
  })
})

describe('drafts on the Spotlight settings page', () => {
  it('marks an unpublished item as a draft, so it can be spotlighted before it goes live', () => {
    const items = highlightCandidates({ mandatory: [], announcements: [], tools: [{ id: 't9', title: 'Draft tool', isPublished: false }], courses: [{ id: 'c9', title: 'Live', isPublished: true }] })
    expect(Object.fromEntries(items.map((i) => [i.key, i.published]))).toEqual({ 'tool:t9': false, 'course:c9': true })
  })
})

describe('pickHighlights', () => {
  it('shows the newest few while nothing is pinned', () => {
    const r = pickHighlights(candidates, [])
    expect(r.pinned).toBe(false)
    expect(r.items).toHaveLength(Math.min(AUTO_COUNT, candidates.length))
  })

  it('shows only the pins, newest pin first, once something is pinned', () => {
    const pins = [{ key: 'course:c1', pinnedAt: '2026-11-01T00:00:00Z' }, { key: 'mandatory:m1', pinnedAt: '2026-11-02T00:00:00Z' }]
    const r = pickHighlights(candidates, pins)
    expect(r.pinned).toBe(true)
    expect(r.items.map((i) => i.key)).toEqual(['mandatory:m1', 'course:c1'])
  })

  it('falls back to the newest when no pin is visible to this person', () => {
    const r = pickHighlights(candidates, [{ key: 'tool:hidden', pinnedAt: '2026-11-01T00:00:00Z' }])
    expect(r.pinned).toBe(false)
    expect(r.items[0].key).toBe('tool:t1')
  })
})

describe('hasUnseen (the red dot on a tab)', () => {
  it('is on for a tab never opened that has something in it, and off for an empty one', () => {
    expect(hasUnseen(candidates, null)).toBe(true)
    expect(hasUnseen([], null)).toBe(false)
  })

  it('goes off once opened, and comes back when something newer arrives', () => {
    const openedAt = day(6).toISOString()
    expect(hasUnseen(candidates, openedAt)).toBe(false)
    const newer = highlightCandidates({ mandatory: [], tools: [], announcements: [], courses: [{ id: 'c2', title: 'New', updatedAt: day(7) }] })
    expect(hasUnseen([...candidates, ...newer], openedAt)).toBe(true)
  })

  it('splits courses from everything else', () => {
    expect(candidates.filter((c) => tabOf(c) === 'course').map((c) => c.key)).toEqual(['course:c1'])
    expect(candidates.filter((c) => tabOf(c) === 'activity')).toHaveLength(3)
  })
})

describe('togglePin', () => {
  it('adds and removes a pin without duplicates', () => {
    const now = new Date('2026-11-05T00:00:00Z')
    const once = togglePin([], 'tool:t1', true, now)
    const twice = togglePin(once, 'tool:t1', true, now)
    expect(twice).toHaveLength(1)
    expect(togglePin(twice, 'tool:t1', false)).toEqual([])
  })
})
