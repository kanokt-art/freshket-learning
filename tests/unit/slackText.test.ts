import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { slackText } from '@/lib/notifications/slackText'
import { postCoursePublishedToSlack, postShadowSubmittedToSlack } from '@/lib/notifications/slack'

describe('slackText', () => {
  it('turns Slack\'s special markup into plain text', () => {
    expect(slackText('<!channel>')).toBe('&lt;!channel&gt;')
    expect(slackText('<@U01ABCDEF2>')).toBe('&lt;@U01ABCDEF2&gt;')
    expect(slackText('<https://evil.example|Sign in>')).toBe('&lt;https://evil.example|Sign in&gt;')
    expect(slackText('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  it('does not double-escape the ampersand it just wrote, and leaves ordinary text alone', () => {
    expect(slackText('a < b')).toBe('a &lt; b')
    expect(slackText('ร้านข้าวมันไก่ · Chain')).toBe('ร้านข้าวมันไก่ · Chain')
  })

  it('copes with empty and non-text values', () => {
    expect(slackText(undefined)).toBe('')
    expect(slackText(null)).toBe('')
    expect(slackText(42)).toBe('42')
  })
})

describe('messages built from a title or a name carry no live markup of the caller\'s', () => {
  let sent: string[]
  beforeEach(() => {
    sent = []
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test')
    vi.stubEnv('SLACK_COURSE_CHANNEL_ID', 'C0COURSE')
    vi.stubEnv('SLACK_TRAINER_CHANNEL_ID', 'C0TRAINER')
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      sent.push(String(init.body))
      return new Response(JSON.stringify({ ok: true }))
    }))
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('a new course pings the channel exactly once — the app\'s own tag, not one in the title', async () => {
    await postCoursePublishedToSlack({ courseTitle: 'Nice <!channel> <!here> <https://evil.example|click>', recipientCount: 3, isAddition: false })
    const body = sent[0]
    expect(body.split('<!channel>').length - 1).toBe(2) // the plain-text preview and the block, both the app's own
    expect(body).not.toContain('<!here>')
    expect(body).not.toContain('<https://evil.example')
    expect(body).toContain('&lt;!here&gt;')
  })

  it('a course description is shown under the headline and cannot inject a mention or link', async () => {
    await postCoursePublishedToSlack({ courseTitle: 'Nice', description: 'เนื้อหา <!here> <https://evil.example|click>', recipientCount: 3, isAddition: false })
    const body = sent[0]
    expect(body).toContain('เนื้อหา')
    expect(body).not.toContain('<!here>')
    expect(body).not.toContain('<https://evil.example')
  })

  it('a Shadow Visit summary or name cannot inject a mention or link', async () => {
    await postShadowSubmittedToSlack({ observerName: '<!channel> Boss', visitSummary: '<https://evil.example|here> ร้าน' })
    const body = sent[0]
    expect(body).not.toContain('<!channel>')
    expect(body).not.toContain('<https://evil.example')
  })
})
