// Who is told about a quiz result, so nobody is pinged on every attempt.
//
// Looked at per sitting of the same quiz (a pre-test lesson is sat twice, once as "pre" and
// once as "post", and those are separate sittings):
//  · the team (trainers / team leads) hears about the FIRST attempt, and about the first time
//    it is passed — not about each retake or each repeated pass;
//  · the learner is congratulated ONCE, the first time they pass.

export interface PriorAttempt {
  step?: string | null
  passed?: boolean
}

export interface QuizNotice {
  /** Post to the team group and ring the leads' bell. */
  tellTeam: boolean
  /** Send the learner their "passed" message. */
  tellLearner: boolean
}

export function quizNotice(step: string | undefined, prior: readonly PriorAttempt[], passed: boolean): QuizNotice {
  const sameSitting = prior.filter((a) => (a.step ?? null) === (step ?? null))
  const passedBefore = sameSitting.some((a) => a.passed === true)
  const first = sameSitting.length === 0
  return {
    tellTeam: first || (passed && !passedBefore),
    tellLearner: passed && !passedBefore,
  }
}
