// A learner may take a finished course off their own lists ("reject" it) — but only one they passed
// cleanly. Someone who failed the first attempt keeps it listed, even after passing a retake, so a
// weak first result cannot be tidied away. The record and its score stay; only the learner's own
// lists stop showing it.

export type DismissVerdict = { ok: true } | { ok: false; reason: 'not_completed' | 'failed_first_attempt' }

interface AttemptShape { attemptNumber?: unknown; passed?: unknown }

export function canDismissCourse(
  record: Record<string, unknown> | null | undefined,
  attempts: readonly AttemptShape[],
): DismissVerdict {
  if (record?.status !== 'completed') return { ok: false, reason: 'not_completed' }
  // The first attempt of any quiz of the course decides. A course without a quiz has no attempts.
  if (attempts.some((a) => a.attemptNumber === 1 && a.passed === false)) {
    return { ok: false, reason: 'failed_first_attempt' }
  }
  return { ok: true }
}

export const DISMISS_REFUSALS: Record<'not_completed' | 'failed_first_attempt', string> = {
  not_completed: 'ซ่อนได้เฉพาะหลักสูตรที่เรียนจบแล้ว',
  failed_first_attempt: 'หลักสูตรนี้สอบครั้งแรกไม่ผ่าน จึงซ่อนจากรายการไม่ได้',
}
