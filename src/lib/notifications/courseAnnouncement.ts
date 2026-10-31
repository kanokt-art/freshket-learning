// The words of a course announcement, shared by the Slack message (server) and the preview the
// admin edits before sending (browser), so what they see is what is posted.

/** Longest title / description an announcement carries. Longer text is cut. */
export const ANNOUNCE_TITLE_MAX = 120
export const ANNOUNCE_DESCRIPTION_MAX = 300

/** Said before the title for a new course (which also tags the channel) and for people added to a live one. */
export const COURSE_NEW_PREFIX = '📚 หลักสูตรใหม่: '
export const COURSE_ADDED_PREFIX = 'มีผู้เรียนใหม่ถูกเพิ่มเข้าหลักสูตร '

/** Trim, and cut to `max` characters. */
export function clampText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * What the announcement says. A title or description the admin changed replaces the course's own;
 * one they left alone comes from the course. Clearing the description means no description line.
 */
export function resolveAnnouncementText(
  course: { title: string; description?: unknown },
  custom: { customTitle?: unknown; customDescription?: unknown },
): { title: string; description: string } {
  const title = clampText(custom.customTitle, ANNOUNCE_TITLE_MAX) || clampText(course.title, ANNOUNCE_TITLE_MAX)
  const description = typeof custom.customDescription === 'string'
    ? clampText(custom.customDescription, ANNOUNCE_DESCRIPTION_MAX)
    : clampText(course.description, ANNOUNCE_DESCRIPTION_MAX)
  return { title, description }
}
