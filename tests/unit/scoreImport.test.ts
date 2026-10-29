import { describe, it, expect } from 'vitest'
import { groupByPerson, recordPatch, diffOf, type ScoreRow } from '@/lib/courses/scoreImport'

const NOW = new Date('2026-03-01T00:00:00.000Z')
const row = (email: string, type: 'pre' | 'post', over: Partial<ScoreRow> = {}): ScoreRow =>
  ({ email, type, status: 'completed', ...over })

describe('groupByPerson', () => {
  it('puts a person’s before and after on one entry', () => {
    const g = groupByPerson([row('a@x', 'pre', { score: 60 }), row('a@x', 'post', { score: 85 })])
    expect(g).toHaveLength(1)
    expect(g[0].pre?.score).toBe(60)
    expect(g[0].post?.score).toBe(85)
  })

  it('keeps people apart and in the order they first appear', () => {
    const g = groupByPerson([row('a@x', 'pre'), row('b@x', 'post'), row('a@x', 'post')])
    expect(g.map((p) => p.email)).toEqual(['a@x', 'b@x'])
  })

  it('lets a later row of the same type correct an earlier one', () => {
    const g = groupByPerson([row('a@x', 'post', { score: 40 }), row('a@x', 'post', { score: 90 })])
    expect(g).toHaveLength(1)
    expect(g[0].post?.score).toBe(90)
  })

  it('does not let a post row replace a pre row', () => {
    const g = groupByPerson([row('a@x', 'pre', { score: 50 }), row('a@x', 'post', { score: 70 })])
    expect(g[0].pre?.score).toBe(50)
  })
})

describe('recordPatch', () => {
  it('writes the after-score, the course score and the status from a post row', () => {
    const [p] = groupByPerson([row('a@x', 'post', { score: 85, completedAt: '2026-01-15' })])
    const patch = recordPatch(p, null, NOW)
    expect(patch).toMatchObject({ postTestScore: 85, score: 85, status: 'completed' })
    expect(patch.completedAt).toEqual(new Date('2026-01-15'))
  })

  it('writes ONLY the before-score from a pre row, and does not touch the course score', () => {
    // The course score is the final result the reports average; a pre-test must not become it.
    const [p] = groupByPerson([row('a@x', 'pre', { score: 60 })])
    const patch = recordPatch(p, { score: 85, status: 'completed' }, NOW)
    expect(patch).toEqual({ preTestScore: 60 })
    expect(patch).not.toHaveProperty('score')
    expect(patch).not.toHaveProperty('status')
  })

  it('ignores the status column on a pre row: a before-test does not finish the course', () => {
    const [p] = groupByPerson([row('a@x', 'pre', { score: 60, status: 'completed' })])
    expect(recordPatch(p, null, NOW)).not.toMatchObject({ status: 'completed' })
  })

  it('starts a person with only a pre row as in progress, when there is no record yet', () => {
    const [p] = groupByPerson([row('a@x', 'pre', { score: 60 })])
    expect(recordPatch(p, null, NOW)).toMatchObject({ status: 'in_progress', preTestScore: 60 })
  })

  it('does not change the status of an existing record from a pre row', () => {
    const [p] = groupByPerson([row('a@x', 'pre', { score: 60 })])
    expect(recordPatch(p, { status: 'completed' }, NOW)).not.toHaveProperty('status')
  })

  it('writes both sittings when the file has both', () => {
    const [p] = groupByPerson([row('a@x', 'pre', { score: 60 }), row('a@x', 'post', { score: 85 })])
    expect(recordPatch(p, null, NOW)).toMatchObject({ preTestScore: 60, postTestScore: 85, score: 85, status: 'completed' })
  })

  describe('uploading the same file again: the new file wins', () => {
    const stored = { preTestScore: 50, postTestScore: 70, score: 70, status: 'completed', completedAt: new Date('2026-01-10') }

    it('replaces every value the file carries', () => {
      const [p] = groupByPerson([row('a@x', 'pre', { score: 60 }), row('a@x', 'post', { score: 90 })])
      expect(recordPatch(p, stored, NOW)).toMatchObject({ preTestScore: 60, postTestScore: 90, score: 90 })
    })

    it('keeps the stored completion date rather than moving it to today', () => {
      const [p] = groupByPerson([row('a@x', 'post', { score: 90 })])
      expect(recordPatch(p, stored, NOW).completedAt).toEqual(new Date('2026-01-10'))
    })

    it('uses the date in the file when it has one', () => {
      const [p] = groupByPerson([row('a@x', 'post', { score: 90, completedAt: '2026-02-02' })])
      expect(recordPatch(p, stored, NOW).completedAt).toEqual(new Date('2026-02-02'))
    })

    it('leaves a score alone when the file leaves it blank', () => {
      const [p] = groupByPerson([row('a@x', 'post', { status: 'completed' })])
      const patch = recordPatch(p, stored, NOW)
      expect(patch).not.toHaveProperty('postTestScore')
      expect(patch).not.toHaveProperty('score')
    })

    it('leaves the after-score alone when the file only has a pre row', () => {
      const [p] = groupByPerson([row('a@x', 'pre', { score: 55 })])
      const patch = recordPatch(p, stored, NOW)
      expect(patch).toEqual({ preTestScore: 55 })
    })

    it('clears the completion date when the new file says the course is not completed', () => {
      const [p] = groupByPerson([row('a@x', 'post', { score: 40, status: 'failed' })])
      expect(recordPatch(p, stored, NOW)).toMatchObject({ status: 'failed', completedAt: null })
    })
  })

  it('stamps a first completion with the import time when the file has no date', () => {
    const [p] = groupByPerson([row('a@x', 'post', { score: 85 })])
    expect(recordPatch(p, null, NOW).completedAt).toEqual(NOW)
  })

  it('takes the start date from a pre row’s date, but never moves one that is stored', () => {
    const [p] = groupByPerson([row('a@x', 'pre', { score: 60, completedAt: '2026-01-01' })])
    expect(recordPatch(p, null, NOW).startedAt).toEqual(new Date('2026-01-01'))
    expect(recordPatch(p, { startedAt: new Date('2025-12-01') }, NOW)).not.toHaveProperty('startedAt')
  })
})

describe('diffOf: what the preview shows', () => {
  it('shows stored against file values for each sitting', () => {
    const [p] = groupByPerson([row('a@x', 'pre', { score: 60 }), row('a@x', 'post', { score: 90, status: 'completed' })])
    expect(diffOf(p, { preTestScore: 50, postTestScore: 70, status: 'in_progress' })).toEqual({
      existing: { pre: 50, post: 70, status: 'in_progress' },
      next: { pre: 60, post: 90, status: 'completed' },
    })
  })

  it('shows a sitting the file does not carry as unchanged', () => {
    const [p] = groupByPerson([row('a@x', 'post', { score: 90 })])
    expect(diffOf(p, { preTestScore: 50, postTestScore: 70, status: 'completed' }).next.pre).toBe(50)
  })

  it('treats no record as nothing stored', () => {
    const [p] = groupByPerson([row('a@x', 'pre', { score: 60 })])
    expect(diffOf(p, null)).toEqual({
      existing: { pre: null, post: null, status: 'not_started' },
      next: { pre: 60, post: null, status: 'in_progress' },
    })
  })
})
