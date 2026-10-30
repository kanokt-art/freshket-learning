import { describe, it, expect } from 'vitest'
import { quizNotice } from '@/lib/notifications/quizNotice'

describe('quizNotice — nobody is pinged on every attempt', () => {
  it('tells the team about the first attempt, pass or fail', () => {
    expect(quizNotice('post', [], true)).toEqual({ tellTeam: true, tellLearner: true })
    expect(quizNotice('post', [], false)).toEqual({ tellTeam: true, tellLearner: false })
  })

  it('does not tell the team about a second failed attempt', () => {
    expect(quizNotice('post', [{ step: 'post', passed: false }], false)).toEqual({ tellTeam: false, tellLearner: false })
  })

  it('tells the team and the learner the first time a retake passes', () => {
    expect(quizNotice('post', [{ step: 'post', passed: false }], true)).toEqual({ tellTeam: true, tellLearner: true })
  })

  it('tells nobody about passing again after already passing', () => {
    expect(quizNotice('post', [{ step: 'post', passed: true }], true)).toEqual({ tellTeam: false, tellLearner: false })
    expect(quizNotice('post', [{ step: 'post', passed: true }], false)).toEqual({ tellTeam: false, tellLearner: false })
  })

  it('counts sittings separately: the pre-test attempt does not make the post-test "not first"', () => {
    expect(quizNotice('post', [{ step: 'pre', passed: false }], false)).toEqual({ tellTeam: true, tellLearner: false })
    expect(quizNotice('post', [{ step: 'pre', passed: true }], true)).toEqual({ tellTeam: true, tellLearner: true })
  })

  it('treats an untagged lesson quiz (no step) as its own sitting', () => {
    expect(quizNotice(undefined, [], true)).toEqual({ tellTeam: true, tellLearner: true })
    expect(quizNotice(undefined, [{ passed: true }], true)).toEqual({ tellTeam: false, tellLearner: false })
    expect(quizNotice(undefined, [{ step: null, passed: false }], false)).toEqual({ tellTeam: false, tellLearner: false })
  })
})
