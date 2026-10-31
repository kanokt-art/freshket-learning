import { describe, it, expect } from 'vitest'
import { resolveAnnouncementText, clampText } from '@/lib/notifications/courseAnnouncement'

const course = { title: 'PVP', description: 'ขั้นตอนตั้งราคา' }

describe('resolveAnnouncementText', () => {
  it('takes the course\'s own title and description when nothing was changed', () => {
    expect(resolveAnnouncementText(course, {})).toEqual({ title: 'PVP', description: 'ขั้นตอนตั้งราคา' })
  })

  it('takes what the admin changed, and only that', () => {
    expect(resolveAnnouncementText(course, { customTitle: 'PVP 2' })).toEqual({ title: 'PVP 2', description: 'ขั้นตอนตั้งราคา' })
    expect(resolveAnnouncementText(course, { customDescription: 'ใหม่' })).toEqual({ title: 'PVP', description: 'ใหม่' })
  })

  it('an emptied description means none; an emptied title falls back to the course\'s', () => {
    expect(resolveAnnouncementText(course, { customDescription: '' }).description).toBe('')
    expect(resolveAnnouncementText(course, { customTitle: '   ' }).title).toBe('PVP')
  })

  it('a course with no description announces none', () => {
    expect(resolveAnnouncementText({ title: 'PVP' }, {}).description).toBe('')
  })

  it('ignores anything that is not text', () => {
    expect(resolveAnnouncementText(course, { customTitle: 42, customDescription: { a: 1 } })).toEqual({ title: 'PVP', description: 'ขั้นตอนตั้งราคา' })
    expect(clampText(undefined, 10)).toBe('')
  })
})
