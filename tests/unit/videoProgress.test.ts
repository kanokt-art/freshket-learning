import { describe, it, expect } from 'vitest'
import { readVideoProgress, furthest, videoProgressKey } from '@/lib/courses/videoProgress'

const store = (v: string | null) => ({ getItem: () => v })

describe('readVideoProgress', () => {
  it('reads what was stored', () => {
    expect(readVideoProgress(store('{"seconds":120.5,"pct":60}'), 'k')).toEqual({ seconds: 120.5, pct: 60 })
  })
  it.each([null, '', 'not json', '{"seconds":"x","pct":-5}', '[]', 'null'])('is zero for %j', (raw) => {
    expect(readVideoProgress(store(raw), 'k')).toEqual({ seconds: 0, pct: 0 })
  })
  it('caps a percent above 100', () => {
    expect(readVideoProgress(store('{"seconds":10,"pct":250}'), 'k').pct).toBe(100)
  })
  it('is zero when storage throws', () => {
    expect(readVideoProgress({ getItem: () => { throw new Error('blocked') } }, 'k')).toEqual({ seconds: 0, pct: 0 })
  })
})

describe('furthest', () => {
  it('keeps the larger reach, so rewatching never shrinks it', () => {
    const a = { seconds: 100, pct: 50 }
    expect(furthest(a, { seconds: 30, pct: 15 })).toBe(a)
    expect(furthest(a, { seconds: 140, pct: 70 })).toEqual({ seconds: 140, pct: 70 })
    expect(furthest(undefined, a)).toBe(a)
  })
})

describe('videoProgressKey', () => {
  it('is per person, course and lesson', () => {
    expect(new Set([videoProgressKey('u1', 'c', 'l'), videoProgressKey('u2', 'c', 'l'), videoProgressKey('u1', 'c2', 'l'), videoProgressKey('u1', 'c', 'l2')]).size).toBe(4)
  })
})
