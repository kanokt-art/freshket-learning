// Bucket assessments — questionnaires with no right answer and no score.
//
// Every option carries one or more bucket weights; answering drops those
// weights into the buckets; the result is whichever bucket won, plus the
// interpretation text for that outcome. Nothing here computes a percentage
// against a passing mark: that is what the Assessment/gradeSubmission path is
// for, and the two must not be confused (see the note in types/personality.ts).
//
// The shape is deliberately general enough to cover the three kinds of
// questionnaire we actually expect to want:
//
//   · Single-dimension ("which of our 5 selling styles are you?") — one
//     dimension, N buckets, the winner is the result.
//   · Multi-dimension  ("MBTI") — several dimensions each with their own
//     buckets, and the outcome is the combination of each dimension's winner.
//   · Weighted         ("readiness check") — an option can feed more than one
//     bucket, with different weights.
//
// A definition is DATA. Put a new questionnaire in lib/bucketAssessments/ and
// it works everywhere the generic take page, scorer, and result card already
// work — no new scoring code, no new screens.

/** One bucket an answer can feed: a personality type, a style, a level. */
export interface Bucket {
  id: string
  /** Short label shown in the result, e.g. "Extraversion" or "ผู้ประสานงาน". */
  label: string
  /** One-line gloss shown under the label in per-dimension breakdowns. */
  blurb?: string
}

/**
 * A group of mutually exclusive buckets scored together.
 *
 * A single-result questionnaire has exactly one dimension. MBTI has four, each
 * holding the two poles of one axis.
 */
export interface BucketDimension {
  id: string
  /** Shown as the heading of this dimension's row in the result breakdown. */
  label: string
  buckets: Bucket[]
  /**
   * Bucket id to award when a dimension ends in a tie. Required, because a tie
   * is reachable whenever a dimension has an even number of questions and
   * leaving it undefined would make the result non-deterministic.
   */
  tieBreak: string
}

/** How much one chosen option contributes, and to which bucket. */
export interface BucketWeight {
  bucketId: string
  /** Defaults to 1 when omitted. Negative weights are allowed. */
  weight?: number
}

export interface BucketOption {
  id: string
  text: string
  /** Buckets this option feeds. Usually one; more for weighted questionnaires. */
  weights: BucketWeight[]
}

export interface BucketQuestion {
  id: string
  order: number
  text?: string
  /** Which dimension this question scores into. */
  dimensionId: string
  options: BucketOption[]
  /**
   * Present on a Likert-style question: `text` is one statement (not two
   * opposing ones) and `options` holds the 7 scale positions built by
   * makeLikertOptions — position 1 agrees with the statement toward
   * `agreePole`, position 7 toward the other pole of the dimension, position 4
   * (the midpoint) is neutral and scores nothing. The take page uses this flag
   * to render a 7-point scale instead of a list of option cards.
   */
  likert?: true
}

/**
 * What the learner is told at the end.
 *
 * `whenBucketIds` is matched against the winning bucket of every dimension, in
 * dimension order — so a single-dimension questionnaire matches on one id, and
 * MBTI matches on the four-letter combination. The first matching outcome
 * wins, so a catch-all can be listed last with an empty match.
 */
export interface BucketOutcome {
  /** Winning bucket ids, in dimension order. */
  whenBucketIds: string[]
  /** The headline, e.g. "INTJ" or "ผู้ประสานงาน". */
  code: string
  title: string
  /** What this result means — the explanation shown to the learner. */
  description: string
  /** Optional extra section, e.g. how this shows up in sales work. */
  detail?: string
}

export interface BucketAssessmentDefinition {
  id: string
  title: string
  description: string
  /** Rough minutes, shown before the learner starts. */
  estimatedMinutes: number
  dimensions: BucketDimension[]
  questions: BucketQuestion[]
  outcomes: BucketOutcome[]
  /**
   * Minimum answers required before a result is produced. Defaults to half the
   * questions when omitted — a result computed from three answers is noise
   * presented as an insight.
   */
  minAnswers?: number
}

// ── Results ───────────────────────────────────────────────────────────────────

export interface DimensionResult {
  dimensionId: string
  /** Total weight landing in each bucket, keyed by bucket id. */
  totals: Record<string, number>
  /** Winning bucket id. */
  pick: string
  /**
   * Share of this dimension's weight held by the winner, 0-100. A two-bucket
   * tie reads 50. Used for the strength bars, never as a grade.
   */
  strengthPct: number
}

export interface BucketResult {
  definitionId: string
  /** The matched outcome's code, e.g. "INTJ". */
  code: string
  dimensions: DimensionResult[]
  answered: number
  total: number
}

/** Stored one per user per definition, at userBucketResults/{uid}_{definitionId}. */
export interface UserBucketResult extends BucketResult {
  uid: string
  courseId?: string
  takenAt: Date
}
