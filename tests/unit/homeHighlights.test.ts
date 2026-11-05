import { describe, it, expect } from 'vitest'
import { highlightCandidates, pickHighlights, togglePin, AUTO_COUNT } from '@/lib/home/highlights'

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

describe('togglePin', () => {
  it('adds and removes a pin without duplicates', () => {
    const now = new Date('2026-11-05T00:00:00Z')
    const once = togglePin([], 'tool:t1', true, now)
    const twice = togglePin(once, 'tool:t1', true, now)
    expect(twice).toHaveLength(1)
    expect(togglePin(twice, 'tool:t1', false)).toEqual([])
  })
})
