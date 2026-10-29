// The questions a Shadow visit record answers, in the order they are read:
// Open → Hook → Close. Used where a visit's detail is shown outside the Shadow page.
//
// The wording is the same as the Shadow page's form (EVAL_FIELDS in
// app/(dashboard)/shadow/page.tsx), which cannot export it: keep the two in step.

export type ShadowAnswerKey =
  | 'opening' | 'interestPoint' | 'diagnosticApproach' | 'customerPain'
  | 'closingNextStep' | 'bestPractice' | 'beyondClassroom'

export const SHADOW_ANSWERS: ReadonlyArray<{ key: ShadowAnswerKey; label: string }> = [
  { key: 'opening',            label: 'เปิดบทสนทนา · Opening / Hook' },
  { key: 'interestPoint',      label: 'จุดที่ลูกค้าสนใจ · Interest Point' },
  { key: 'diagnosticApproach', label: 'คำถาม Diagnostic · Diagnostic Question' },
  { key: 'customerPain',       label: 'ปัญหาของลูกค้า · Customer Pain' },
  { key: 'closingNextStep',    label: 'ปิดการขาย / ขั้นตอนต่อไป · Closing / Next Step' },
  { key: 'bestPractice',       label: 'แนวปฏิบัติที่ดี · Best Practice' },
  { key: 'beyondClassroom',    label: 'เรียนรู้นอกห้องเรียน · Beyond Classroom' },
]

/** The answers a record actually has, in reading order. Blank ones are left out. */
export function answeredQuestions(record: Partial<Record<ShadowAnswerKey, unknown>>): Array<{ label: string; value: string }> {
  return SHADOW_ANSWERS
    .map(({ key, label }) => ({ label, value: typeof record[key] === 'string' ? (record[key] as string).trim() : '' }))
    .filter((a) => a.value !== '')
}
