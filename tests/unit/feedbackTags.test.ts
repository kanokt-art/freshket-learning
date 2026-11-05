import { describe, it, expect } from 'vitest'
import { LIKED_TAGS, IMPROVE_TAGS, keepValidTags, tagsFor } from '@/lib/courses/feedbackTags'

describe('feedback choices', () => {
  it('a good rating asks what they liked, a weak one what should change, no rating asks nothing', () => {
    expect(tagsFor(5)).toBe(LIKED_TAGS)
    expect(tagsFor(4)).toBe(LIKED_TAGS)
    expect(tagsFor(3)).toBe(IMPROVE_TAGS)
    expect(tagsFor(1)).toBe(IMPROVE_TAGS)
    expect(tagsFor(null)).toEqual([])
  })

  it('changing the rating drops choices that no longer fit', () => {
    expect(keepValidTags(['เนื้อหาชัดเจน', 'ยากเกินไป'], 5)).toEqual(['เนื้อหาชัดเจน'])
    expect(keepValidTags(['เนื้อหาชัดเจน', 'ยากเกินไป'], 2)).toEqual(['ยากเกินไป'])
    expect(keepValidTags(['เนื้อหาชัดเจน'], null)).toEqual([])
  })
})
