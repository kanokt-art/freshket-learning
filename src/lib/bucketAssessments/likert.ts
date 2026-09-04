import type { BucketOption } from '@/types/bucketAssessment'

// A 7-point Likert scale ("ฉันเห็นด้วย" … "ฉันไม่เห็นด้วย") expressed as bucket
// options, so the generic scorer needs no special case for it: each scale
// position is just an option with a weight, exactly like a forced-choice pair.
//
// Position 1 (leftmost, "เห็นด้วย") always agrees with the question's
// statement, which always describes `agreePole`. Position 7 (rightmost, "ไม่
// เห็นด้วย") is the opposite end and so scores toward the dimension's OTHER
// pole. Position 4 is the true midpoint and scores nothing — a decision to
// treat neutral as neutral, not as a weak lean either way (see the code
// comment on scoreBuckets for why an all-neutral answer set still needs a
// deterministic result).
//
// Weight magnitude 3→2→1→0→1→2→3 makes "เห็นด้วยอย่างยิ่ง" count three times as
// much as "ค่อนข้างเห็นด้วย" — a plain +1-per-answer scheme would treat the
// scale as seven-way forced-choice and throw away the whole point of Likert
// input (strength of feeling).
const LIKERT_WEIGHTS = [3, 2, 1, 0, 1, 2, 3]

export const LIKERT_SCALE_SIZE = LIKERT_WEIGHTS.length

/**
 * Builds the 7 scale-position options for a Likert question.
 *
 * @param questionId used to derive each option's id (`${questionId}_1` … `_7`)
 * @param agreePole the pole position 1 ("เห็นด้วย") scores toward
 * @param otherPole the pole position 7 ("ไม่เห็นด้วย") scores toward
 */
export function makeLikertOptions(questionId: string, agreePole: string, otherPole: string): BucketOption[] {
  return LIKERT_WEIGHTS.map((weight, i) => {
    const position = i + 1
    const pole = position <= 3 ? agreePole : position >= 5 ? otherPole : null
    return {
      id: `${questionId}_${position}`,
      text: String(position),
      weights: pole ? [{ bucketId: pole, weight }] : [],
    }
  })
}
