// A learner may take a finished course off their own lists ("reject" it). Only a course they have
// finished: one still in progress, or failed (a failed attempt not yet retaken and passed), stays
// listed. A course passed on a retake counts as finished. The record, its score and its place on the
// learner's profile stay; only the For You and My Course lists stop showing it.

export type DismissVerdict = { ok: true } | { ok: false; reason: 'not_completed' }

export function canDismissCourse(record: Record<string, unknown> | null | undefined): DismissVerdict {
  return record?.status === 'completed' ? { ok: true } : { ok: false, reason: 'not_completed' }
}

export const DISMISS_REFUSALS: Record<'not_completed', string> = {
  not_completed: 'ซ่อนได้เฉพาะหลักสูตรที่เรียนจบหรือสอบผ่านแล้ว',
}
