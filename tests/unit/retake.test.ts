import { describe, it, expect } from 'vitest'
import { retakeBlocked } from '@/lib/courses/retake'

describe('retakeBlocked', () => {
  it('blocks a finished course unless retake is on', () => {
    expect(retakeBlocked({}, { status: 'completed' })).toBe(true)
    expect(retakeBlocked({ allowRetake: false }, { status: 'completed' })).toBe(true)
    expect(retakeBlocked({ allowRetake: true }, { status: 'completed' })).toBe(false)
  })

  it('never blocks a first attempt, a course in progress, or a failed one (they still have to pass)', () => {
    expect(retakeBlocked({}, null)).toBe(false)
    expect(retakeBlocked({}, { status: 'in_progress' })).toBe(false)
    expect(retakeBlocked({}, { status: 'failed' })).toBe(false)
    expect(retakeBlocked({}, { status: 'not_started' })).toBe(false)
  })

  it('a missing course does not block (the route refuses it for its own reason)', () => {
    expect(retakeBlocked(null, { status: 'completed' })).toBe(true)
  })
})
