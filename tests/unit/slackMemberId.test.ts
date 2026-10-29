import { describe, it, expect } from 'vitest'
import { parseSlackMemberId } from '@/lib/slack/memberId'

describe('parseSlackMemberId', () => {
  it.each([
    ['U01ABCDEF2', 'U01ABCDEF2'],
    ['  u01abcdef2 ', 'U01ABCDEF2'],
    ['<@U01ABCDEF2>', 'U01ABCDEF2'],
    ['@U01ABCDEF2', 'U01ABCDEF2'],
    ['W012A3CDE4F', 'W012A3CDE4F'],
    ['https://freshket.slack.com/team/U01ABCDEF2', 'U01ABCDEF2'],
    ['https://freshket.slack.com/team/U01ABCDEF2/', 'U01ABCDEF2'],
    ['https://app.slack.com/client/T0123ABCD/U01ABCDEF2', 'U01ABCDEF2'],
    ['freshket.slack.com/team/U01ABCDEF2', 'U01ABCDEF2'],
  ])('finds the member id in %s', (input, id) => {
    expect(parseSlackMemberId(input)).toBe(id)
  })

  it.each([
    '', '   ', 'hello', 'C01ABCDEF2', 'D01ABCDEF2', 'T0123ABCD',
    'https://example.com/team/U01ABCDEF2',
    'https://freshket.slack.com/archives/C01ABCDEF2',
  ])('finds none in %j (channels, teams, other sites)', (input) => {
    expect(parseSlackMemberId(input)).toBeNull()
  })

  it('is null for nothing', () => {
    expect(parseSlackMemberId(null)).toBeNull()
    expect(parseSlackMemberId(undefined)).toBeNull()
  })
})
