import { describe, it, expect } from 'vitest'
import { mentorDisplayName } from '@/lib/shadow/mentorName'

const people = [
  { email: 'nichapa.s@freshket.co', displayName: 'ณิชาภา สาคร', displayNameEN: 'Nichapa Sakhaow', nickname: 'Mint' },
  { email: 'a@freshket.co', displayName: 'สมชาย ใจดี', displayNameEN: 'Somchai Jaidee', nickname: 'Chai' },
  { email: 'b@freshket.co', displayName: 'วิชัย เก่ง', displayNameEN: 'Wichai Keng', nickname: 'Chai' },
]

describe('mentorDisplayName', () => {
  it('writes a full name from the sheet as First (Nickname) Surname', () => {
    expect(mentorDisplayName({ mentorName: 'Nichapa Sakhaow' }, people)).toBe('Nichapa (Mint) Sakhaow')
  })

  it('finds the person from the nickname the app form used to store', () => {
    expect(mentorDisplayName({ mentorName: 'Mint' }, people)).toBe('Nichapa (Mint) Sakhaow')
  })

  it('finds the person from the Thai name', () => {
    expect(mentorDisplayName({ mentorName: 'ณิชาภา สาคร' }, people)).toBe('Nichapa (Mint) Sakhaow')
  })

  it('uses the mentor email when the sheet has one', () => {
    expect(mentorDisplayName({ mentorName: 'whatever', mentorEmail: 'NICHAPA.S@freshket.co' }, people)).toBe('Nichapa (Mint) Sakhaow')
  })

  it('does not guess when two people share the name', () => {
    expect(mentorDisplayName({ mentorName: 'Chai' }, people)).toBe('Chai')
  })

  it('builds it from the record when nobody matches: a full name beside its nickname', () => {
    expect(mentorDisplayName({ mentorName: 'Pim Rungrueng', mentorNickname: 'Pim' }, [])).toBe('Pim (Pim) Rungrueng')
    expect(mentorDisplayName({ mentorName: 'Max' }, [])).toBe('Max')
  })

  it('leaves a name already written with its nickname, and an empty one empty', () => {
    expect(mentorDisplayName({ mentorName: 'Nichapa (Mint) Sakhaow' }, people)).toBe('Nichapa (Mint) Sakhaow')
    expect(mentorDisplayName({ mentorName: '  ' }, people)).toBe('')
  })
})
