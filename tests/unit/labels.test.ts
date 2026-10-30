import { describe, it, expect } from 'vitest'
import { lessonLabel, topicLabel, isUnnamedLesson, isUnnamedTopic } from '@/lib/courses/labels'

describe('lessonLabel', () => {
  it('numbers an unnamed lesson by its position, counting from 1', () => {
    expect(lessonLabel('', 0)).toBe('บทเรียน #1')
    expect(lessonLabel(undefined, 2)).toBe('บทเรียน #3')
    expect(lessonLabel('   ', 1)).toBe('บทเรียน #2')
  })

  it('follows the order: a saved generated title is renumbered when lessons are rearranged', () => {
    // Created as #1, #2 and then dragged so #2 comes first
    expect(lessonLabel('บทเรียน #2', 0)).toBe('บทเรียน #1')
    expect(lessonLabel('บทเรียน #1', 1)).toBe('บทเรียน #2')
    expect(lessonLabel('บทเรียน#7', 0)).toBe('บทเรียน #1')
  })

  it('shows a name the admin typed, as written', () => {
    expect(lessonLabel('PVP คืออะไร', 0)).toBe('PVP คืออะไร')
    expect(lessonLabel('  PVP  ', 3)).toBe('PVP')
    // not only digits after the hash: that is a real title
    expect(lessonLabel('บทเรียน #1 เบื้องต้น', 4)).toBe('บทเรียน #1 เบื้องต้น')
  })
})

describe('topicLabel', () => {
  it('works the same way for topics', () => {
    expect(topicLabel('', 0)).toBe('หัวข้อ #1')
    expect(topicLabel('หัวข้อ #3', 0)).toBe('หัวข้อ #1')
    expect(topicLabel('ราคา', 1)).toBe('ราคา')
  })
})

describe('isUnnamed', () => {
  it('is true only for empty or generated labels', () => {
    expect(isUnnamedLesson('บทเรียน #4')).toBe(true)
    expect(isUnnamedLesson('บทเรียน แรก')).toBe(false)
    expect(isUnnamedTopic('หัวข้อ #2')).toBe(true)
    expect(isUnnamedTopic('บทเรียน #2')).toBe(false)
  })
})
