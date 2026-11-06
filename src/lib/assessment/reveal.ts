// How much a learner is shown about their answers once a quiz is submitted. A setting of the quiz itself
// (Assessment.revealMode), applied by the server before the result leaves it — a browser that was never sent
// the right answers cannot show them, whatever the page does.
//
//   none     score only
//   correct  which questions were answered right (no answers given away)
//   wrong    which were answered right and which wrong, but never the right answer of a question the learner missed
//   all      every question, right or wrong, with the right answer for the wrong ones (the original behaviour)

export type RevealMode = 'none' | 'correct' | 'wrong' | 'all'

export const REVEAL_MODES: { value: RevealMode; label: string; hint: string }[] = [
  { value: 'all', label: 'เฉลยทุกข้อ', hint: 'ดูผลถูก/ผิดทุกข้อ และเห็นคำตอบที่ถูกของข้อที่ผิด' },
  { value: 'wrong', label: 'เฉลยข้อผิด', hint: 'เห็นว่าข้อไหนผิด แต่ไม่บอกคำตอบที่ถูก (ข้อที่ตอบถูกก็เห็นว่าถูก)' },
  { value: 'correct', label: 'เฉลยข้อถูก', hint: 'เห็นเฉพาะข้อที่ตอบถูก ไม่เฉลยคำตอบของข้อที่ผิด' },
  { value: 'none', label: 'ไม่เฉลย', hint: 'เห็นแค่คะแนนรวม' },
]

/** An unset or unknown value reads as the original behaviour. */
export function normalizeRevealMode(v: unknown): RevealMode {
  return v === 'none' || v === 'correct' || v === 'wrong' || v === 'all' ? v : 'all'
}

export interface QuestionVerdict {
  questionId: string
  /** null for a written question, which is not auto-graded. */
  correct: boolean | null
  pointsEarned: number
  pointsPossible: number
  /** The right answer, as text. */
  correctLabel: string
}

/** The per-question results a learner may see under this mode. */
export function revealResults(results: readonly QuestionVerdict[], mode: RevealMode): QuestionVerdict[] {
  switch (mode) {
    case 'none':
      return []
    case 'correct':
      return results.filter((r) => r.correct === true).map((r) => ({ ...r, correctLabel: '' }))
    case 'wrong':
      // The right answer of a missed question stays on the server; a question answered right needs none.
      return results.map((r) => ({ ...r, correctLabel: '' }))
    default:
      return results.map((r) => ({ ...r }))
  }
}
