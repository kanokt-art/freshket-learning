// A course whose lesson is a questionnaire (MBTI, selling style) has no score to report: what it gives each
// learner is a result — their type. The results tables show that instead of a score column.

interface LessonShape { type?: string; bucketAssessmentId?: string }

/**
 * The questionnaire a course is about (the first one, when it has several), or null for a course without
 * one. A lesson that names no questionnaire of its own is the default, MBTI.
 */
export function courseQuestionnaireId(course: { topics?: Array<{ lessons?: LessonShape[] }> } | null | undefined): string | null {
  for (const t of course?.topics ?? []) {
    for (const l of t.lessons ?? []) {
      if (l.type === 'personality') return l.bucketAssessmentId || 'mbti'
    }
  }
  return null
}
