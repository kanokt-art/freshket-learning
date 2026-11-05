import { describe, it, expect } from 'vitest'
import { failedRetakeBlocked, retakeOnFailBlocked } from '@/lib/server/retakeOnFail'

describe('failedRetakeBlocked', () => {
  const failed = { passed: false, step: 'post' }

  it('lets everyone retake unless the quiz turned it off (on by default)', () => {
    expect(failedRetakeBlocked(undefined, [failed], 'post')).toBe(false)
    expect(failedRetakeBlocked(true, [failed], 'post')).toBe(false)
  })

  it('blocks a learner who failed when it is off', () => {
    expect(failedRetakeBlocked(false, [failed], 'post')).toBe(true)
  })

  it('does not block a first try, or someone who passed', () => {
    expect(failedRetakeBlocked(false, [], 'post')).toBe(false)
    expect(failedRetakeBlocked(false, [{ passed: true, step: 'post' }], 'post')).toBe(false)
  })

  it('judges the pre-test and the post-test separately', () => {
    expect(failedRetakeBlocked(false, [{ passed: false, step: 'pre' }], 'post')).toBe(false)
    expect(failedRetakeBlocked(false, [{ passed: false }], undefined)).toBe(true)
    expect(failedRetakeBlocked(false, [{ passed: false }], 'post')).toBe(false)
  })

  it('counts a timed-out try as a failed one', () => {
    expect(failedRetakeBlocked(false, [{ passed: false, step: 'post' }], 'post')).toBe(true)
  })
})

describe('retakeOnFailBlocked', () => {
  it('reads the attempts only when the setting is off', async () => {
    let reads = 0
    const store = { query: async () => { reads++; return [{ passed: false, step: 'post' }] } }
    expect(await retakeOnFailBlocked(store, 'u', 'a', {}, 'post')).toBe(false)
    expect(reads).toBe(0)
    expect(await retakeOnFailBlocked(store, 'u', 'a', { allowRetakeOnFail: false }, 'post')).toBe(true)
    expect(reads).toBe(1)
  })
})
