'use client'

import { useCallback } from 'react'
import { useAllUsers } from '@/hooks/useFirestore'
import { mentorDisplayName, type MentorFields } from '@/lib/shadow/mentorName'

/** A function that writes a Shadow Visit's mentor as "First (Nickname) Surname" (see lib/shadow/mentorName.ts). */
export function useMentorName(): (rec: MentorFields) => string {
  // The shared, already-warm staff list: no extra read.
  const { data: people } = useAllUsers()
  return useCallback((rec: MentorFields) => mentorDisplayName(rec, people), [people])
}
