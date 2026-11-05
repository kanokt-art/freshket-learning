// The choices a learner can tap when rating a course ("what did you like?" after a good rating, "what should
// change?" after a weak one), before or instead of writing a comment. Stored on the feedback as `tags`.

export const LIKED_TAGS = ['เนื้อหาชัดเจน', 'ใช้งานได้จริง', 'ตัวอย่างดี', 'ความยาวพอดี', 'ตอบโจทย์งาน'] as const
export const IMPROVE_TAGS = ['เนื้อหายาวเกินไป', 'ยากเกินไป', 'ตัวอย่างไม่พอ', 'ข้อมูลล้าสมัย', 'ใช้งานระบบยาก'] as const

/** 4 or 5 stars asks what they liked; fewer asks what should change. */
export function tagsFor(rating: number | null): readonly string[] {
  if (rating === null) return []
  return rating >= 4 ? LIKED_TAGS : IMPROVE_TAGS
}

/** Only tags that belong to the rating survive a change of rating (a "liked" tag does not stay on a 2-star). */
export function keepValidTags(tags: readonly string[], rating: number | null): string[] {
  const allowed = new Set<string>(tagsFor(rating))
  return tags.filter((t) => allowed.has(t))
}
