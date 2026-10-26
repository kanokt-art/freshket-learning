'use client'

import { useSyncExternalStore } from 'react'
import { getDemoMode } from '@/lib/demo/demoMode'
import { getDocument } from '@/lib/data/client'
import { attachLive } from '@/lib/data/live'
import { ALL_MODULE_IDS, DEFAULT_MODULES, type ModuleId, type ModuleAccessConfig } from '@/lib/modules'

const DEMO = getDemoMode()

export interface ModuleAccessResult {
  allowedModules: Set<ModuleId>
  loading: boolean
}

// ── Shared module-access store ────────────────────────────────────────────────
// Previously every useModuleAccess() call opened its OWN live read of
// appConfig/moduleAccess and started at loading=true. The sidebar, the tab bar,
// the page, and useUnseenTools all call it, so each navigation spun up 3-4
// listeners AND — because 7 pages gate their whole render on `moduleLoading` —
// flashed a full-screen spinner while those fresh listeners resolved. That
// re-subscribe-and-reload churn was the main cause of slow tab/page switches.
//
// Now there is ONE live read for the whole app, and the last config is cached at
// module scope. After the first load, remounts read the warm cache synchronously
// (loading=false immediately) — no re-fetch, no spinner flash, instant switches.
// A short grace period keeps the listener alive across navigations; the cache is
// intentionally kept warm even after the listener detaches.

type DeptConfig = ModuleAccessConfig['departments'] | null

let sharedConfig: DeptConfig = null
let sharedLoaded = false
let version = 0 // bumps whenever the config changes → drives re-renders
let unsub: (() => void) | undefined
let refCount = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const GRACE_MS = 300_000 // match useFirestore's LISTENER_GRACE_MS
const POLL_MS = 60_000

function notify() {
  version++
  listeners.forEach((cb) => cb())
}

function ensureListener() {
  if (unsub || DEMO) return
  unsub = attachLive({
    path: 'appConfig',
    pollMs: POLL_MS,
    load: () => getDocument('appConfig', 'moduleAccess'),
    apply: (doc) => {
      const next = doc ? ((doc as unknown as ModuleAccessConfig).departments ?? null) : null
      // A poll that finds the same config must not wake every subscriber.
      if (sharedLoaded && JSON.stringify(next) === JSON.stringify(sharedConfig)) return
      sharedConfig = next
      sharedLoaded = true
      notify()
    },
    // On error, treat as loaded (optimistic "all modules" fallback below).
    fail: () => {
      sharedLoaded = true
      notify()
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
      // Detach the listener after a grace period, but KEEP sharedConfig warm so a
      // quick navigation away-and-back reads it instantly with no loading flash.
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (refCount <= 0) { unsub?.(); unsub = undefined }
      }, GRACE_MS)
    }
  }
}

const noopSubscribe = () => () => {}
const getVersion = () => version
const getServerVersion = () => 0

// Full raw departments config from the SAME shared listener/cache — for admin
// views (e.g. roleplay management) that need every department's module list,
// not just the current user's. Returns null while the first snapshot is still
// in flight; {} when the config doc doesn't exist or errored.
export function useModuleConfig(): Record<string, string[]> | null {
  useSyncExternalStore(DEMO ? noopSubscribe : subscribe, getVersion, getServerVersion)
  if (DEMO) {
    return { Sale: ['lms', 'shadow', 'roleplay', 'points', 'sale_tools'], default: ['lms', 'points'] }
  }
  if (!sharedLoaded) return null
  return (sharedConfig ?? {}) as Record<string, string[]>
}

export function useModuleAccess(role?: string, department?: string | null): ModuleAccessResult {
  const isSuperAdmin = role === 'super_admin'
  const skip = isSuperAdmin || DEMO

  // Subscribe (unless admin/demo, which never need the config). useSyncExternalStore
  // is the idiomatic React 18 way to read an external store without tearing.
  useSyncExternalStore(skip ? noopSubscribe : subscribe, getVersion, getServerVersion)

  if (skip) return { allowedModules: new Set(ALL_MODULE_IDS), loading: false }

  // Optimistic: show everything while the very first snapshot is still in flight
  // (subsequent mounts skip this because sharedLoaded stays true).
  if (!sharedLoaded) return { allowedModules: new Set(ALL_MODULE_IDS), loading: true }

  const dept = department ?? ''
  const modules = sharedConfig?.[dept] ?? sharedConfig?.['default'] ?? DEFAULT_MODULES
  return { allowedModules: new Set(modules), loading: false }
}
