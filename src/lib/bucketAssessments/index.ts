import type { BucketAssessmentDefinition } from '@/types/bucketAssessment'
import { MBTI_DEFINITION } from './mbti'
import { SELLING_STYLE_DEFINITION } from './sellingStyle'

// Every bucket assessment the app knows about, keyed by definition id.
//
// To add one: write the definition file next to these, import it, and add it
// here. The take page, the scorer, the submit route, the course builder picker
// and the profile card all read from this registry — none of them need to know
// which questionnaire they are dealing with.
//
// Definitions live in code rather than Firestore on purpose: the questions,
// the bucket weights and the outcome text have to agree with each other, and a
// half-edited questionnaire in the database would produce results that are
// wrong rather than merely incomplete. There is no admin editor for them.

export const BUCKET_ASSESSMENTS: Record<string, BucketAssessmentDefinition> = {
  [MBTI_DEFINITION.id]: MBTI_DEFINITION,
  [SELLING_STYLE_DEFINITION.id]: SELLING_STYLE_DEFINITION,
}

export const BUCKET_ASSESSMENT_LIST: BucketAssessmentDefinition[] = Object.values(BUCKET_ASSESSMENTS)

export function getBucketAssessment(id: string | undefined): BucketAssessmentDefinition | undefined {
  return id ? BUCKET_ASSESSMENTS[id] : undefined
}

export { MBTI_DEFINITION, SELLING_STYLE_DEFINITION }
