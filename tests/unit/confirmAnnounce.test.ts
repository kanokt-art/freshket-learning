import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmAndAnnounce, describeAnnouncement } from '@/lib/notifications/confirmAnnounce'

const { confirmAction, composeCourseAnnouncement, announce } = vi.hoisted(() => ({
  confirmAction: vi.fn(),
  composeCourseAnnouncement: vi.fn(),
  announce: vi.fn(async (_e: unknown) => ({ posted: true, dmSent: 2, dmUids: ['a', 'b'] })),
}))
vi.mock('@/lib/ui/alert', () => ({ confirmAction }))
vi.mock('@/lib/ui/announceComposer', () => ({ composeCourseAnnouncement }))
vi.mock('@/lib/notifications/announce', () => ({ announce }))
vi.mock('@/lib/demo/demoMode', () => ({ getDemoMode: () => false }))


const newCourse = { kind: 'course_published' as const, courseId: 'c1', courseTitle: 'PVP', courseDescription: 'ราคาพิเศษ', recipientCount: 5 }
const added = { kind: 'course_published' as const, courseId: 'c1', courseTitle: 'PVP', recipientCount: 2, isAddition: true }
const mandatory = { kind: 'mandatory_published' as const, itemId: 'm1', title: 'ราคาผัก', recipientCount: 40 }

beforeEach(() => { confirmAction.mockReset(); composeCourseAnnouncement.mockReset(); announce.mockClear() })

describe('confirmAndAnnounce', () => {
  it('announces a Mandatory Reading only after the admin says yes', async () => {
    confirmAction.mockResolvedValue(true)
    expect(await confirmAndAnnounce(mandatory)).toEqual({ posted: true, dmSent: 2, dmUids: ['a', 'b'] })
    expect(announce).toHaveBeenCalledWith(mandatory)
  })

  it('shows a course its preview and sends nothing extra when the admin left the text alone', async () => {
    composeCourseAnnouncement.mockResolvedValue({ title: 'PVP', description: 'ราคาพิเศษ' })
    expect(await confirmAndAnnounce(newCourse)).toEqual({ posted: true, dmSent: 2, dmUids: ['a', 'b'] })
    expect(composeCourseAnnouncement).toHaveBeenCalledWith({ title: 'PVP', description: 'ราคาพิเศษ', recipientCount: 5, isAddition: undefined })
    expect(announce).toHaveBeenCalledWith(newCourse)   // no customTitle / customDescription: the server uses the course's own
    expect(confirmAction).not.toHaveBeenCalled()
  })

  it('sends only what the admin changed', async () => {
    composeCourseAnnouncement.mockResolvedValue({ title: 'PVP รอบใหม่', description: 'ราคาพิเศษ' })
    await confirmAndAnnounce(newCourse)
    expect(announce).toHaveBeenCalledWith({ ...newCourse, customTitle: 'PVP รอบใหม่' })

    announce.mockClear()
    composeCourseAnnouncement.mockResolvedValue({ title: 'PVP', description: '' })
    await confirmAndAnnounce(newCourse)
    expect(announce).toHaveBeenCalledWith({ ...newCourse, customDescription: '' })   // cleared on purpose
  })

  it('does not announce a course when the admin cancels the preview', async () => {
    composeCourseAnnouncement.mockResolvedValue(null)
    expect(await confirmAndAnnounce(newCourse)).toBeNull()
    expect(announce).not.toHaveBeenCalled()
  })

  it('does not announce when the admin says no', async () => {
    confirmAction.mockResolvedValue(false)
    expect(await confirmAndAnnounce(mandatory)).toBeNull()
    expect(announce).not.toHaveBeenCalled()
  })

  it('does not announce, and does not throw, when the dialog fails', async () => {
    confirmAction.mockRejectedValue(new Error('boom'))
    expect(await confirmAndAnnounce(mandatory)).toBeNull()
    composeCourseAnnouncement.mockRejectedValue(new Error('boom'))
    expect(await confirmAndAnnounce(newCourse)).toBeNull()
    expect(announce).not.toHaveBeenCalled()
  })

  it('asks in Thai with a clear yes and no', async () => {
    confirmAction.mockResolvedValue(false)
    await confirmAndAnnounce(mandatory)
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
