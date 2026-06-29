'use client'

import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getClientFirestore } from '@/lib/firebase/client'
import { getDemoMode } from '@/lib/demo/demoMode'
import { ALL_MODULE_IDS, DEFAULT_MODULES, type ModuleId, type ModuleAccessConfig } from '@/lib/modules'

export interface ModuleAccessResult {
  allowedModules: Set<ModuleId>
  loading: boolean
}

export function useModuleAccess(role?: string, department?: string | null): ModuleAccessResult {
  const [config, setConfig] = useState<ModuleAccessConfig['departments'] | null>(null)
  const [loading, setLoading] = useState(true)

  const isSuperAdmin = role === 'super_admin'

  useEffect(() => {
    // super_admin always sees everything — skip Firestore
    if (isSuperAdmin || getDemoMode()) {
      setLoading(false)
      return
    }

    const db = getClientFirestore()
    const unsub = onSnapshot(
      doc(db, 'appConfig', 'moduleAccess'),
      (snap) => {
        setConfig(snap.exists() ? (snap.data() as ModuleAccessConfig).departments : null)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [isSuperAdmin])

  if (isSuperAdmin || getDemoMode()) {
    return { allowedModules: new Set(ALL_MODULE_IDS), loading: false }
  }

  if (loading) {
    // Optimistic: show all while loading to avoid nav flash
    return { allowedModules: new Set(ALL_MODULE_IDS), loading: true }
  }

  const dept = department ?? ''
  const modules = config?.[dept] ?? config?.['default'] ?? DEFAULT_MODULES
  return { allowedModules: new Set(modules), loading: false }
}
