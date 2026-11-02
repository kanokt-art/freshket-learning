// Retaking a finished course. A learner who has finished a course may re-read its slides and videos, but
// may not sit its quiz or questionnaire again unless an admin turned on `allowRetake` for the course:
// otherwise anyone could keep retrying until the score they wanted. A super_admin who wants someone to
// start over clears that learner's history (POST /api/training-records/reset); with no finished record
// there is nothing blocking them.

export const RETAKE_REFUSAL = 'หลักสูตรนี้เรียนจบแล้ว ทำแบบทดสอบ/แบบประเมินซ้ำไม่ได้ (อ่านเนื้อหาได้) หากต้องการทำใหม่ ให้ติดต่อ Admin'

/** True when this learner may not take the course's quiz or questionnaire again. */
export function retakeBlocked(
  course: { allowRetake?: unknown } | null | undefined,
  record: { status?: unknown } | null | undefined,
): boolean {
  return record?.status === 'completed' && course?.allowRetake !== true
}
