import { describe, it, expect } from 'vitest'
import { toStars, MAX_STARS } from '@/lib/feedback/stars'

describe('toStars', () => {
  it.each([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]])('keeps %s as %s stars', (score, want) => {
    expect(toStars(score)).toBe(want)
  })

  it('rounds a fractional rating to the nearest star', () => {
    expect(toStars(3.6)).toBe(4)
    expect(toStars(2.4)).toBe(2)
  })

  it('reads a value from the old 0-100 scale as the nearest star, never beyond five', () => {
    expect(toStars(100)).toBe(5)
    expect(toStars(80)).toBe(4)
    expect(toStars(60)).toBe(3)
    expect(toStars(41)).toBe(2)
    expect(toStars(10)).toBe(1)   // a very low old score is still a rating, so one star
    expect(toStars(250)).toBe(5)
  })

  it.each([null, undefined, '', 'abc', 0, -3, NaN, Infinity])('is no rating for %s', (score) => {
    expect(toStars(score)).toBeNull()
  })

  it('never returns more than the maximum', () => {
    for (const s of [5, 6, 20, 99, 1000]) expect(toStars(s)).toBeLessThanOrEqual(MAX_STARS)
  })
})
