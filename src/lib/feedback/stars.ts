// A manager's rating of a member's course is 1–5 stars.
//
// It used to be a number out of 100. The stored field is the same `score`; what changed
// is the scale, so anything read back is normalised here: a value above 5 can only have
// been written on the old scale, and becomes the nearest star instead of drawing as
// "five stars" or breaking the row.

export const MAX_STARS = 5

/** Stars (1–5) for a stored score, or null when there is no rating. */
export function toStars(score: unknown): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) return null
  const stars = score > MAX_STARS ? score / 20 : score   // old 0–100 scale
  return Math.max(1, Math.min(MAX_STARS, Math.round(stars)))
}
