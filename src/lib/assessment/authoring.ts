import type { Question } from '@/types/assessment'

// Checks the quiz editor runs while an admin is writing, so a slip is flagged before a learner meets it.

/** Case, spacing and surrounding blanks do not make two answers different. */
export function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The (normalized) texts that appear more than once in this list; blanks are not counted. */
export function duplicateKeys(texts: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const t of texts) {
    const k = normalizeText(t)
    if (!k) continue
    if (seen.has(k)) dups.add(k)
    else seen.add(k)
  }
  return dups
}

/** Does this question repeat an answer: two equal choices, or two equal items on either side of a matching question? */
export function hasDuplicateAnswers(q: Pick<Question, 'type' | 'choices' | 'dragPairs'>): boolean {
  if (q.type === 'multiple_choice') return duplicateKeys((q.choices ?? []).map((c) => c.text)).size > 0
  if (q.type === 'drag_drop') {
    const pairs = q.dragPairs ?? []
    return duplicateKeys(pairs.map((p) => p.left)).size > 0 || duplicateKeys(pairs.map((p) => p.right)).size > 0
  }
  return false
}
