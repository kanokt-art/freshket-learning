import { describe, it, expect } from 'vitest'
import { formatPersonName } from '@/lib/users/displayName'

// The nickname goes in the MIDDLE ("Sasaluk (Dutchmill) Tianthiti"), which is
// the part that keeps getting written as a trailing parenthetical instead.
// The fallback chain matters too: HR rows arrive with any of these fields
// missing, and a name cell must never render empty or "undefined".

describe('formatPersonName — the agreed format', () => {
  it('puts the nickname between the first name and the surname', () => {
    expect(formatPersonName({
      displayNameEN: 'Sasaluk Tianthiti',
      nickname: 'Dutchmill',
    })).toBe('Sasaluk (Dutchmill) Tianthiti')
  })

  it('keeps a multi-word surname on the right of the nickname', () => {
    expect(formatPersonName({
      displayNameEN: 'Kanok Thong Dee',
      nickname: 'Nok',
    })).toBe('Kanok (Nok) Thong Dee')
  })

  it('prefers the English name over the Thai one', () => {
    expect(formatPersonName({
      displayNameEN: 'Kanok Thongdee',
      displayName: 'กนก ทองแถม',
      nickname: 'Nok',
    })).toBe('Kanok (Nok) Thongdee')
  })
})

describe('formatPersonName — missing pieces', () => {
  it('returns just the full name when there is no nickname', () => {
    expect(formatPersonName({ displayNameEN: 'Sasaluk Tianthiti' })).toBe('Sasaluk Tianthiti')
  })

  it('appends the nickname when the name is a single word', () => {
    expect(formatPersonName({ displayNameEN: 'Sasaluk', nickname: 'Dutchmill' }))
      .toBe('Sasaluk (Dutchmill)')
  })

  it('falls back to the Thai display name when no English name exists', () => {
    expect(formatPersonName({ displayName: 'กนก ทองแถม', nickname: 'Nok' }))
      .toBe('กนก (Nok) ทองแถม')
  })

  it('falls back to email when no name exists at all', () => {
    expect(formatPersonName({ email: 'kanok.t@freshket.co' })).toBe('kanok.t@freshket.co')
  })

  it('returns the nickname alone rather than an empty string', () => {
    expect(formatPersonName({ nickname: 'Nok' })).toBe('Nok')
  })

  it('returns an empty string when there is nothing to show', () => {
    expect(formatPersonName({})).toBe('')
  })

  it('treats whitespace-only fields as missing', () => {
    expect(formatPersonName({ displayNameEN: '   ', displayName: 'กนก ทองแถม', nickname: '  ' }))
      .toBe('กนก ทองแถม')
  })
})
