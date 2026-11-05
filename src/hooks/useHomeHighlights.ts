'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAnnouncements, useCourses, useFirestoreDoc, useMandatoryItems, useTools } from '@/hooks/useFirestore'
import { getDemoMode } from '@/lib/demo/demoMode'
import { patch } from '@/lib/data/collection'
import { isMandatoryVisibleTo } from '@/lib/mandatory'
import { isToolVisibleTo } from '@/lib/tools'
import { isAnnouncementVisibleTo } from '@/types/announcement'
import { isInCourseTarget } from '@/lib/courses/audience'
import {
  HIGHLIGHTS_DOC, highlightCandidates, pickHighlights, togglePin, type HighlightPin, type HighlightsDoc,
} from '@/lib/home/highlights'
import type { UserProfile } from '@/types/user'

const DEMO_MODE = getDemoMode()
// Demo mode has no database: pins live in this browser so the switch can still be tried.
const DEMO_KEY = 'fk_home_highlights_demo'

const readDemoPins = (): HighlightPin[] => {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY) ?? '[]') as HighlightPin[] } catch { return [] }
}

/**
 * The "Latest" row for one person, plus — for a super_admin — every published item and a way to pin it.
 * `viewer` decides what the row may show (department, role, course audience).
 */
export function useHomeHighlights(viewer: UserProfile | null | undefined) {
  const { data: mandatory } = useMandatoryItems()
  const { data: tools } = useTools()
  const { data: courses } = useCourses()
  const { data: announcements } = useAnnouncements()
  const doc = useFirestoreDoc<HighlightsDoc>(`appConfig/${HIGHLIGHTS_DOC}`, !DEMO_MODE)

  const [demoPins, setDemoPins] = useState<HighlightPin[]>([])
  useEffect(() => { if (DEMO_MODE) setDemoPins(readDemoPins()) }, [])
  // Saved pins show at once, before the next poll brings the document back.
  const [localPins, setLocalPins] = useState<HighlightPin[] | null>(null)
  const savedPins = doc.data?.pins
  const pins = useMemo(() => (DEMO_MODE ? demoPins : (localPins ?? savedPins ?? [])), [demoPins, localPins, savedPins])

  // Everything, drafts included, for the super_admin's Spotlight list: a course, tool or Mandatory shows
  // there as soon as it is created, marked Draft until it is published.
  const all = useMemo(() => highlightCandidates({ mandatory, tools, courses, announcements }), [mandatory, tools, courses, announcements])

  // What this person may see.
  const visible = useMemo(() => {
    if (!viewer) return []
    const dept = viewer.department
    return highlightCandidates({
      mandatory: mandatory.filter((m) => isMandatoryVisibleTo(m, dept, mandatory)),
      tools: tools.filter((t) => isToolVisibleTo(t, dept)),
      courses: courses.filter((c) => c.isPublished && (isInCourseTarget(c, viewer) || c.openEnrollment === true)),
      announcements: announcements.filter((a) => isAnnouncementVisibleTo(a, viewer.role, dept)),
    })
  }, [viewer, mandatory, tools, courses, announcements])

  const shown = useMemo(() => pickHighlights(visible, pins), [visible, pins])
  const pinnedKeys = useMemo(() => new Set(pins.map((p) => p.key)), [pins])

  const setPinned = useCallback(async (key: string, on: boolean) => {
    const next = togglePin(pins, key, on)
    if (DEMO_MODE) {
      setDemoPins(next)
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return
    }
    setLocalPins(next)
    await patch('appConfig', HIGHLIGHTS_DOC, { pins: next, updatedAt: new Date() })
  }, [pins])

  /** What the person may see, and the pins: the row picks per tab from these. */
  return { items: shown.items, pinnedOnly: shown.pinned, visible, pins, all, pinnedKeys, setPinned }
}
