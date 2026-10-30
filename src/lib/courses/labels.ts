// What a lesson or topic is CALLED on screen.
//
// An admin who does not name one gets "บทเรียน #1", "บทเรียน #2"... by position, and the
// numbers follow the order the admin arranges them in: drag #2 above #1 and they read
// #1, #2 again. Before this the label was typed into the title when the lesson was
// created, so it stayed put when the lessons were reordered ("บทเรียน #2" listed first).
//
// A title is "unnamed" when it is empty or is exactly one of those generated labels —
// which also covers lessons created before this change, whose title was saved as
// "บทเรียน #3" and never meant anything more than a position. Anything else the admin
// typed is theirs and is shown as written.

const AUTO_LESSON = /^บทเรียน\s*#\s*\d+$/
const AUTO_TOPIC = /^หัวข้อ\s*#\s*\d+$/

/** Position is 0-based; the label counts from 1. */
export const defaultLessonLabel = (index: number) => `บทเรียน #${index + 1}`
export const defaultTopicLabel = (index: number) => `หัวข้อ #${index + 1}`

export function isUnnamedLesson(title: string | undefined | null): boolean {
  const t = (title ?? '').trim()
  return t === '' || AUTO_LESSON.test(t)
}

export function isUnnamedTopic(title: string | undefined | null): boolean {
  const t = (title ?? '').trim()
  return t === '' || AUTO_TOPIC.test(t)
}

/** The lesson's name as shown: what the admin typed, else its position in its topic. */
export function lessonLabel(title: string | undefined | null, index: number): string {
  return isUnnamedLesson(title) ? defaultLessonLabel(index) : (title ?? '').trim()
}

/** The topic's name as shown: what the admin typed, else its position in the course. */
export function topicLabel(title: string | undefined | null, index: number): string {
  return isUnnamedTopic(title) ? defaultTopicLabel(index) : (title ?? '').trim()
}
