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
  HIGHLIGHTS_DOC, highlightCandidates, setHighlightState, type HighlightPin, type HighlightsDoc,
} from '@/lib/home/highlights'
import type { UserProfile } from '@/types/user'

const DEMO_MODE = getDemoMode()
// Demo mode has no database: Spotlight and Hide live in this browser so the switches can still be tried.
const DEMO_KEY = 'fk_home_highlights_demo'

interface HighlightState { pins: HighlightPin[]; hidden: string[] }
const EMPTY: HighlightState = { pins: [], hidden: [] }

const readDemo = (): HighlightState => {
  try {
    const v = JSON.parse(localStorage.getItem(DEMO_KEY) ?? 'null') as HighlightState | HighlightPin[] | null
    // An older demo stored the pins alone.
    if (Array.isArray(v)) return { pins: v, hidden: [] }
    return { pins: v?.pins ?? [], hidden: v?.hidden ?? [] }
  } catch { return EMPTY }
}

/**
 * The "Latest" row for one person, plus — for a super_admin — every item and the Spotlight / Hide
 * switches for it. `viewer` decides what the row may show (department, role, course audience).
 */
export function useHomeHighlights(viewer: UserProfile | null | undefined) {
  const { data: mandatory } = useMandatoryItems()
  const { data: tools } = useTools()
  const { data: courses } = useCourses()
  const { data: announcements } = useAnnouncements()
  const doc = useFirestoreDoc<HighlightsDoc>(`appConfig/${HIGHLIGHTS_DOC}`, !DEMO_MODE)

  const [demo, setDemo] = useState<HighlightState>(EMPTY)
  useEffect(() => { if (DEMO_MODE) setDemo(readDemo()) }, [])
  // A saved change shows at once, before the next poll brings the document back.
  const [local, setLocal] = useState<HighlightState | null>(null)
  const saved = doc.data
  const state = useMemo<HighlightState>(
    () => (DEMO_MODE ? demo : (local ?? { pins: saved?.pins ?? [], hidden: saved?.hidden ?? [] })),
    [demo, local, saved],
  )

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

  const pinnedKeys = useMemo(() => new Set(state.pins.map((p) => p.key)), [state.pins])
  const hiddenKeys = useMemo(() => new Set(state.hidden), [state.hidden])

  const apply = useCallback(async (key: string, change: { spotlight: boolean } | { hide: boolean }) => {
    const next = setHighlightState(state, key, change)
    if (DEMO_MODE) {
      setDemo(next)
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return
    }
    setLocal(next)
    await patch('appConfig', HIGHLIGHTS_DOC, { pins: next.pins, hidden: next.hidden, updatedAt: new Date() })
  }, [state])

  const setPinned = useCallback((key: string, on: boolean) => apply(key, { spotlight: on }), [apply])
  const setHidden = useCallback((key: string, on: boolean) => apply(key, { hide: on }), [apply])

  /** What the person may see, the Spotlight pins and the hidden keys: the row picks per tab from these. */
  return { visible, pins: state.pins, hidden: state.hidden, all, pinnedKeys, hiddenKeys, setPinned, setHidden }
}
