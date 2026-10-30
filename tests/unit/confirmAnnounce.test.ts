import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmAndAnnounce, describeAnnouncement } from '@/lib/notifications/confirmAnnounce'

const { confirmAction, announce } = vi.hoisted(() => ({ confirmAction: vi.fn(), announce: vi.fn(async (_e: unknown) => {}) }))
vi.mock('@/lib/ui/alert', () => ({ confirmAction }))
vi.mock('@/lib/notifications/announce', () => ({ announce }))
vi.mock('@/lib/demo/demoMode', () => ({ getDemoMode: () => false }))


const newCourse = { kind: 'course_published' as const, courseTitle: 'PVP', recipientCount: 5 }
const added = { kind: 'course_published' as const, courseTitle: 'PVP', recipientCount: 2, isAddition: true }
const mandatory = { kind: 'mandatory_published' as const, title: 'ราคาผัก', departments: [], recipientCount: 40 }

beforeEach(() => { confirmAction.mockReset(); announce.mockClear() })

describe('confirmAndAnnounce', () => {
  it('announces only after the admin says yes', async () => {
    confirmAction.mockResolvedValue(true)
    expect(await confirmAndAnnounce(newCourse)).toBe(true)
    expect(announce).toHaveBeenCalledWith(newCourse)
  })

  it('does not announce when the admin says no', async () => {
    confirmAction.mockResolvedValue(false)
    expect(await confirmAndAnnounce(mandatory)).toBe(false)
    expect(announce).not.toHaveBeenCalled()
  })

  it('does not announce, and does not throw, when the dialog fails', async () => {
    confirmAction.mockRejectedValue(new Error('boom'))
    expect(await confirmAndAnnounce(newCourse)).toBe(false)
    expect(announce).not.toHaveBeenCalled()
  })

  it('asks in Thai with a clear yes and no', async () => {
    confirmAction.mockResolvedValue(false)
    await confirmAndAnnounce(newCourse)
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'ประกาศลง Slack ด้วยไหม?', confirmText: 'ประกาศลง Slack', cancelText: 'ไม่ประกาศ' }))
  })
})

describe('describeAnnouncement', () => {
  it('warns that a new course tags the whole channel, and that additions do not', () => {
    expect(describeAnnouncement(newCourse)).toContain('@channel')
    expect(describeAnnouncement(newCourse)).toContain('PVP')
    expect(describeAnnouncement(added)).toContain('ไม่แท็ก @channel')
  })
  it('says how many people a Mandatory Reading reaches', () => {
    expect(describeAnnouncement(mandatory)).toContain('40 คน')
  })
})
