import { getDemoMode } from '@/lib/demo/demoMode'
import { announce, type AnnounceEvent, type AnnounceResult } from '@/lib/notifications/announce'

// Publishing a course or Mandatory Reading used to post to Slack on its own. The admin
// now confirms first, because a post to a channel (and @channel on a new course) cannot
// be taken back. Saying no only skips Slack: the course is still published and the
// in-app notifications still go out.

/** What saying yes will do, in the words the admin sees. */
export function describeAnnouncement(event: AnnounceEvent): string {
  switch (event.kind) {
    case 'course_published':
      return event.isAddition
        ? `จะโพสต์ที่ช่องหลักสูตรว่ามีผู้เรียน ${event.recipientCount} คนถูกเพิ่มเข้าหลักสูตร "${event.courseTitle}" (ไม่แท็ก @channel)`
        : `จะโพสต์ที่ช่องหลักสูตรว่ามีหลักสูตรใหม่ "${event.courseTitle}" และแท็ก @channel ทั้งช่อง`
    case 'mandatory_published':
      return `จะโพสต์ใน Slack และส่ง DM แจ้ง Mandatory Reading "${event.title}" ถึงคนในกลุ่มเป้าหมาย (${event.recipientCount} คน)`
    default:
      return 'จะโพสต์แจ้งใน Slack'
  }
}

/**
 * Ask whether to announce to Slack; announce only on yes. Returns what the announcement did, or
 * null when the admin said no, it failed, or it is demo mode.
 * Never throws — an announcement must not break the publish it follows.
 */
export async function confirmAndAnnounce(event: AnnounceEvent): Promise<AnnounceResult | null> {
  if (getDemoMode()) return null
  try {
    const { confirmAction } = await import('@/lib/ui/alert')
    const yes = await confirmAction({
      title: 'ประกาศลง Slack ด้วยไหม?',
      text: describeAnnouncement(event),
      confirmText: 'ประกาศลง Slack',
      cancelText: 'ไม่ประกาศ',
    })
    if (!yes) return null
    return await announce(event)
  } catch (err) {
    console.error('confirmAndAnnounce failed', err)
    return null
  }
}
