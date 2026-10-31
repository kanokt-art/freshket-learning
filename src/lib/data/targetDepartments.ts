import { useSyncExternalStore } from 'react'
import { getDemoMode } from '@/lib/demo/demoMode'
import { getDocument } from '@/lib/data/client'
import { attachLive } from '@/lib/data/live'
import { pollIntervalFor } from '@/lib/data/pollInterval'
import { PHASE1_DEPARTMENTS, TARGET_DEPARTMENTS_DOC, parseTargetDepartments, setTargetDepartments } from '@/lib/modules'

// The switched-on departments (appConfig/targetDepartments), kept in the live list that
// lib/modules exports. One listener for the whole app, the way useModuleAccess does it; anything
// that filters by department calls useTargetDepartmentsVersion() so it re-renders when the list changes.

const DEMO = getDemoMode()

let loaded = false
let version = 0
let unsub: (() => void) | undefined
let refCount = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const GRACE_MS = 300_000

function notify() {
  version++
  listeners.forEach((cb) => cb())
}

function ensureListener() {
  if (unsub || DEMO) return
  unsub = attachLive({
    path: 'appConfig',
    pollMs: pollIntervalFor('appConfig'),
    load: () => getDocument('appConfig', TARGET_DEPARTMENTS_DOC),
    apply: (doc) => {
      const next = parseTargetDepartments(doc)
      const same = loaded && next.length === PHASE1_DEPARTMENTS.size && next.every((d) => PHASE1_DEPARTMENTS.has(d))
      if (same) return
      setTargetDepartments(next)
      loaded = true
      notify()
    },
    // Could not read it: the defaults stand.
    fail: () => {
      if (!loaded) { loaded = true; notify() }
    },
  })
}

function subscribe(cb: () => void): () => void {
  refCount++
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = undefined }
  ensureListener()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
    refCount--
    if (refCount <= 0) {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { if (refCount <= 0) { unsub?.(); unsub = undefined } }, GRACE_MS)
    }
  }
}

const noopSubscribe = () => () => {}
const getVersion = () => version
const getServerVersion = () => 0

/** Subscribe to the target list; the number changes whenever the list does. */
export function useTargetDepartmentsVersion(): number {
  return useSyncExternalStore(DEMO ? noopSubscribe : subscribe, getVersion, getServerVersion)
}

/** Has the setting been read yet (until then the defaults are in use)? */
export function areTargetDepartmentsLoaded(): boolean {
  return DEMO || loaded
}

/** The switched-on departments, or null until the setting has been read. For the admin page. */
export function useTargetDepartmentList(): string[] | null {
  useTargetDepartmentsVersion()
  return DEMO || loaded ? Array.from(PHASE1_DEPARTMENTS) : null
}
