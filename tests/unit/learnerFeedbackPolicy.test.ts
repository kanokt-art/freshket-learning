import { describe, it, expect } from 'vitest'
import { canWrite, canRead, viewOf } from '@/lib/server/policies'

const sale = { uid: 'u1', role: 'sale' as const }
const lead = { uid: 'l1', role: 'team_lead' as const }
const manager = { uid: 'm1', role: 'manager' as const }
const admin = { uid: 'a1', role: 'super_admin' as const }
const doc = { id: 'u1_c1', uid: 'u1', courseId: 'c1', rating: 4, comment: 'ok' }

type Actor = { uid: string; role: 'sale' | 'team_lead' | 'manager' | 'super_admin' }
const write = (actor: Actor, op: 'create' | 'update', id: string, incoming: Record<string, unknown>) =>
  canWrite({ actor, collection: 'learnerFeedback', id, op, existing: op === 'update' ? doc : null, incoming, changed: Object.keys(incoming) } as never)

describe('learner feedback on a course', () => {
  it('a learner writes only their own, under their own id', () => {
    expect(write(sale, 'create', 'u1_c1', { uid: 'u1', courseId: 'c1', rating: 5 })).toBe(true)
    expect(write(sale, 'update', 'u1_c1', { uid: 'u1', courseId: 'c1', rating: 3 })).toBe(true)
    // into someone else's id, or under someone else's name
    expect(write(sale, 'create', 'u2_c1', { uid: 'u2', courseId: 'c1', rating: 1 })).toBe(false)
    expect(write(sale, 'create', 'u2_c1', { uid: 'u1', courseId: 'c1', rating: 1 })).toBe(false)
    expect(write(sale, 'create', 'u1_c9', { uid: 'u1', courseId: 'c1', rating: 1 })).toBe(false)
  })

  it('a lead cannot write it for someone, and only a super_admin deletes', () => {
    expect(write(lead, 'create', 'u1_c1', { uid: 'u1', courseId: 'c1', rating: 1 })).toBe(false)
    expect(canWrite({ actor: sale, collection: 'learnerFeedback', id: 'u1_c1', op: 'delete', existing: doc, incoming: null, changed: [] } as never)).toBe(false)
    expect(canWrite({ actor: admin, collection: 'learnerFeedback', id: 'u1_c1', op: 'delete', existing: doc, incoming: null, changed: [] } as never)).toBe(true)
  })

  it('reading: the learner sees their own, a super_admin sees all, a team lead and a manager see none', () => {
    expect(canRead({ actor: lead, collection: 'learnerFeedback' })).toBe(true)
    expect(viewOf(sale, 'learnerFeedback', doc)).toEqual(doc)
    expect(viewOf({ uid: 'u2', role: 'sale' }, 'learnerFeedback', doc)).toBeNull()
    expect(viewOf(admin, 'learnerFeedback', doc)).toEqual(doc)
    expect(viewOf(lead, 'learnerFeedback', doc)).toBeNull()
    expect(viewOf(manager, 'learnerFeedback', doc)).toBeNull()
    // an unrelated collection is untouched for a manager
    expect(viewOf(manager, 'courses', { id: 'c1' })).toEqual({ id: 'c1' })
  })
})
