import type {
  BucketAssessmentDefinition,
  BucketOutcome,
  BucketResult,
  DimensionResult,
} from '@/types/bucketAssessment'

/** Answers as the take page collects them: questionId → chosen option id. */
export type BucketAnswers = Record<string, string>

/**
 * Score answers against a bucket assessment definition.
 *
 * Unanswered questions are skipped; `answered`/`total` carry the shortfall so
 * the caller decides whether a partial submission is acceptable. An answer that
 * doesn't name a real option of the question it is keyed under is ignored
 * entirely, so a hand-crafted payload can't stuff a bucket.
 */
export function scoreBuckets(def: BucketAssessmentDefinition, answers: BucketAnswers): BucketResult {
  const questionById = new Map(def.questions.map((q) => [q.id, q]))

  // Start every bucket of every dimension at zero, so a bucket nobody chose
  // still appears in the totals rather than being absent.
  const totals: Record<string, Record<string, number>> = {}
  for (const d of def.dimensions) {
    totals[d.id] = Object.fromEntries(d.buckets.map((b) => [b.id, 0]))
  }

  let answered = 0
  for (const [questionId, optionId] of Object.entries(answers)) {
    const q = questionById.get(questionId)
    if (!q) continue
    const option = q.options.find((o) => o.id === optionId)
    if (!option) continue

    const dimensionTotals = totals[q.dimensionId]
    if (!dimensionTotals) continue

    // Choosing a REAL option counts as answered even when it carries zero
    // weight — the Likert midpoint ("neutral") has empty weights by design
    // (see lib/bucketAssessments/likert.ts), and a learner who genuinely feels
    // neutral on every question must not be told they didn't answer enough.
    answered++
    for (const w of option.weights) {
      // Ignore a weight aimed at a bucket outside this question's dimension —
      // a definition typo should not silently create a phantom bucket.
      if (!(w.bucketId in dimensionTotals)) continue
      dimensionTotals[w.bucketId] += w.weight ?? 1
    }
  }

  const dimensions: DimensionResult[] = def.dimensions.map((d) => {
    const dimensionTotals = totals[d.id]
    let pick = d.tieBreak
    let best = -Infinity
    let tied = false

    // Iterate the declared bucket order so the winner is deterministic rather
    // than dependent on object key order.
    for (const b of d.buckets) {
      const value = dimensionTotals[b.id]
      if (value > best) { best = value; pick = b.id; tied = false }
      else if (value === best) { tied = true }
    }
    if (tied) pick = d.tieBreak

    const sum = Object.values(dimensionTotals).reduce((a, b) => a + b, 0)
    // Share of the dimension held by the winner. With nothing answered, or a
    // dimension summing to zero, this reads as an even split rather than 0.
    const strengthPct = sum > 0
      ? Math.round((dimensionTotals[pick] / sum) * 100)
      : Math.round(100 / Math.max(d.buckets.length, 1))

    return { dimensionId: d.id, totals: dimensionTotals, pick, strengthPct }
  })

  const picks = dimensions.map((d) => d.pick)
  return {
    definitionId: def.id,
    code: matchOutcome(def, picks)?.code ?? picks.join(''),
    dimensions,
    answered,
    total: def.questions.length,
  }
}

/**
 * Find the outcome for a set of winning buckets.
 *
 * Matches on the winning bucket of each dimension, in dimension order. An
 * outcome with an empty `whenBucketIds` matches anything, so a definition can
 * end with a catch-all.
 */
export function matchOutcome(
  def: BucketAssessmentDefinition,
  picks: string[],
): BucketOutcome | undefined {
  return def.outcomes.find((o) =>
    o.whenBucketIds.length === 0
    || (o.whenBucketIds.length === picks.length && o.whenBucketIds.every((id, i) => id === picks[i])),
  )
}

/** Minimum answers a definition requires before it will produce a result. */
export function minAnswersFor(def: BucketAssessmentDefinition): number {
  return def.minAnswers ?? Math.ceil(def.questions.length / 2)
}
