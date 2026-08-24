'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useTools } from '@/hooks/useFirestore'
import { isToolVisibleTo } from '@/lib/tools'

// ── "Seen tools" local store ──────────────────────────────────────────────────
// When a super_admin publishes a new tool, every user should see a notification
// dot on the sidebar Tools item until they actually OPEN that tool. We track the
// set of tool ids the user has already opened in localStorage (scoped per uid so
// a shared device doesn't leak state between accounts). A tool is "unseen" when
// it's visible to the user but not in their seen set.
//
// First-ever visit seeds the seen set with all currently-visible tools, so the
// badge only ever reflects tools added AFTER the user started using the app —
// existing tools never light up retroactively.

const KEY_PREFIX = 'fk_seen_tool_ids_v1'
export const SEEN_TOOLS_EVENT = 'fk-seen-tools-change'

function keyFor(uid?: string | null): string {
  return uid ? `${KEY_PREFIX}_${uid}` : KEY_PREFIX
}

export function getSeenToolIds(uid?: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(keyFor(uid))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

// null means "never initialised" — distinct from an empty (but seeded) set.
function isInitialised(uid?: string | null): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(keyFor(uid)) !== null
}

function writeSeenToolIds(ids: Iterable<string>, uid?: string | null): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(keyFor(uid), JSON.stringify(Array.from(new Set(ids))))
  window.dispatchEvent(new Event(SEEN_TOOLS_EVENT))
}

// Called when the user opens a tool — clears its notification.
export function markToolSeen(id: string, uid?: string | null): void {
  const set = getSeenToolIds(uid)
  if (set.has(id)) return
  set.add(id)
  writeSeenToolIds(set, uid)
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useUnseenTools(): { unseenCount: number; unseenIds: Set<string> } {
  const { user } = useAuth()
  const { allowedModules } = useModuleAccess(user?.role, user?.department)
  const { data: tools, loading } = useTools()
  // A version counter that bumps whenever the stored seen-set changes. We never
  // hold a fresh Set in state: useModuleAccess/useTools hand back new array/Set
  // identities every render, so storing derived state here would re-run the
  // effect → setState → re-render forever. Bumping a number on stable deps is
  // loop-safe; the memo below re-reads localStorage when the counter changes.
  const [version, setVersion] = useState(0)

  // Tools this user is actually allowed to see (module on + published + targeted).
  const visibleTools = useMemo(() => {
    if (!allowedModules.has('sale_tools')) return []
    return tools.filter((t) => isToolVisibleTo(t, user?.department))
  }, [tools, allowedModules, user?.department])

  // Stable signature of the visible tool ids — used as the effect dependency so
  // it fires on real membership changes, not on every array-identity churn.
  const visibleIdsKey = useMemo(
    () => visibleTools.map((t) => t.id).sort().join('|'),
    [visibleTools],
  )

  const uid = user?.uid

  useEffect(() => {
    if (!uid || loading) return
    // Seed the seen set once so pre-existing tools don't badge retroactively.
    if (!isInitialised(uid)) {
      writeSeenToolIds(visibleIdsKey ? visibleIdsKey.split('|') : [], uid)
    }
    const bump = () => setVersion((v) => v + 1)
    bump()
    window.addEventListener(SEEN_TOOLS_EVENT, bump)
    window.addEventListener('storage', bump)
    return () => {
      window.removeEventListener(SEEN_TOOLS_EVENT, bump)
      window.removeEventListener('storage', bump)
    }
  }, [uid, loading, visibleIdsKey])

  const unseenIds = useMemo(() => {
    if (!uid) return new Set<string>()
    const seen = getSeenToolIds(uid)
    return new Set(visibleTools.filter((t) => !seen.has(t.id)).map((t) => t.id))
    // version forces a re-read after the seen-set changes; visibleIdsKey covers
    // membership changes without depending on the churny visibleTools identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, visibleIdsKey, version])

  return { unseenCount: unseenIds.size, unseenIds }
}
