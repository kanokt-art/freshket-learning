import type { AssessmentRevision, Question } from '@/types/assessment'

// Versions of a quiz. Every time the QUESTIONS or the PASS MARK of a published quiz change, it becomes the next
// version, and the revision records when, by whom, and what changed. Each result stores the version it was taken
// on, so the dashboard can tell the people who sat the old questions from those who sat the new ones. A change to
// the title, the description, the time limit or how answers are revealed is not a new version: it does not change
// what the questions ask or what counts as passing.

/** A quiz's version: 1 when it has never been revised (or has no version recorded yet). */
export function versionOf(a: { version?: unknown } | null | undefined): number {
  const v = a?.version
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1
}

// What a question asks and what counts as right, written out so two copies can be compared.
const signature = (q: Question): string => JSON.stringify({
  type: q.type,
  text: (q.text ?? '').trim(),
  description: (q.description ?? '').trim(),
  points: q.points ?? 0,
  choices: (q.choices ?? []).map((c) => [c.id, (c.text ?? '').trim(), !!c.isCorrect]),
  pairs: (q.dragPairs ?? []).map((d) => [d.id, (d.left ?? '').trim(), (d.right ?? '').trim()]),
  sample: (q.sampleAnswer ?? '').trim(),
})

/** How the questions differ: asked now and not before, asked before and gone, and kept but changed. Order is ignored. */
export function diffQuestions(before: readonly Question[], after: readonly Question[]): { added: number; removed: number; changed: number } {
  const was = new Map(before.map((q) => [q.id, q]))
  const now = new Map(after.map((q) => [q.id, q]))
  let added = 0, removed = 0, changed = 0
  now.forEach((q, id) => {
    const old = was.get(id)
    if (!old) added++
    else if (signature(old) !== signature(q)) changed++
  })
  was.forEach((_q, id) => { if (!now.has(id)) removed++ })
  return { added, removed, changed }
}

/** "เพิ่ม 2 ข้อ · ลบ 1 ข้อ · แก้ 3 ข้อ · เกณฑ์ผ่าน 70% → 80%" */
export function describeChange(d: { added: number; removed: number; changed: number }, pass?: { from: number; to: number }): string {
  const parts: string[] = []
  if (d.added) parts.push(`เพิ่ม ${d.added} ข้อ`)
  if (d.removed) parts.push(`ลบ ${d.removed} ข้อ`)
  if (d.changed) parts.push(`แก้ ${d.changed} ข้อ`)
  if (pass && pass.from !== pass.to) parts.push(`เกณฑ์ผ่าน ${pass.from}% → ${pass.to}%`)
  return parts.join(' · ')
}

/**
 * The version and revisions a save leaves the quiz with, or null when nothing that matters changed (so the
 * version stays). `prev` is the quiz as it was stored, `next` what is being saved.
 */
export function reviseAssessment(
  prev: { questions: readonly Question[]; passingScore: number; version?: number; revisions?: readonly AssessmentRevision[] },
  next: { questions: readonly Question[]; passingScore: number },
  who: { uid?: string; name?: string },
  now: Date,
): { version: number; revisions: AssessmentRevision[] } | null {
  const d = diffQuestions(prev.questions, next.questions)
  const passChanged = prev.passingScore !== next.passingScore
  if (!d.added && !d.removed && !d.changed && !passChanged) return null
  const version = versionOf(prev) + 1
  const revision: AssessmentRevision = {
    version,
    at: now,
    ...(who.uid ? { by: who.uid } : {}),
    ...(who.name ? { byName: who.name } : {}),
    summary: describeChange(d, passChanged ? { from: prev.passingScore, to: next.passingScore } : undefined),
  }
  return { version, revisions: [...(prev.revisions ?? []), revision] }
}
