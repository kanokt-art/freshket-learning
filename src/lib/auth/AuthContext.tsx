'use client'

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { UserProfile, UserRole } from '@/types/user'
import { getDemoMode } from '@/lib/demo/demoMode'
import { getLocalUserPatches } from '@/hooks/useFirestore'

import { MOCK_USERS } from '@/lib/utils/mockData'

const DEMO_MODE = getDemoMode()

// ── Demo helpers ──────────────────────────────────────────────────────────────

function getDemoUser(role: UserRole): UserProfile {
  const raw = MOCK_USERS.find((u) => u.role === role) ?? MOCK_USERS[0]
  return { ...raw, createdAt: new Date(), updatedAt: new Date() }
}

// ── Firestore doc → UserProfile ───────────────────────────────────────────────

function dateFromTimestamp(val: unknown): Date | undefined {
  if (!val) return undefined
  if (val instanceof Date) return val
  if (typeof val === 'string') return new Date(val)
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as any).toDate === 'function') {
    return (val as any).toDate()
  }
  return undefined
}

function mapDocToProfile(uid: string, email: string, displayName: string, photoURL: string | null, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    email,
    displayName: (data.displayName as string) ?? displayName,
    photoURL: (data.photoURL as string | null) ?? photoURL,
    role: (data.role as UserRole) ?? 'sale',
    teamId: data.teamId as string | undefined,
    managerId: data.managerId as string | undefined,
    employeeId: data.employeeId as string | undefined,
    displayNameEN: data.displayNameEN as string | undefined,
    department: data.department as string | undefined,
    position: data.position as string | undefined,
    rank: data.rank as string | undefined,
    nickname: data.nickname as string | undefined,
    lineManager: data.lineManager as string | undefined,
    startDate: dateFromTimestamp(data.startDate),
    createdAt: dateFromTimestamp(data.createdAt) ?? new Date(),
    updatedAt: dateFromTimestamp(data.updatedAt) ?? new Date(),
  }
}

// ── Context type ──────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  error: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  getIdToken: () => Promise<string | null>
  isDemoMode: boolean
  demoRole: UserRole
  setDemoRole: (role: UserRole) => void
  setDemoUser: (uid: string) => void
  // Firebase-mode role preview (UI only — the real Firestore role and rules are
  // unchanged). realRole is the true role; roleOverride re-renders the UI as if
  // the user had another role. Only offered to real super_admins.
  realRole: UserRole | null
  roleOverride: UserRole | null
  setRoleOverride: (role: UserRole | null) => void
  // Firebase-mode user impersonation (UI only). A super_admin can render the app
  // as a *specific real user* — their full profile (role, department, teamId,
  // visibleTeamIds) drives every read-side hook, so it faithfully previews what
  // that person sees. Reads use the admin's own token (rules let super_admin read
  // everything); writes remain attributed to the admin, so treat this as a
  // view-only verification tool.
  userOverride: UserProfile | null
  setUserOverride: (profile: UserProfile | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // SSR-safe: always start with defaults — localStorage is client-only.
  // The useEffect below syncs the real demo role after hydration.
  const [demoRole, setDemoRoleState] = useState<UserRole>('sale')
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roleOverride, setRoleOverrideState] = useState<UserRole | null>(null)
  const [userOverride, setUserOverrideState] = useState<UserProfile | null>(null)
  const [pendingOverrideUid, setPendingOverrideUid] = useState<string | null>(null)

  // Restore any Firebase-mode role preview / user impersonation after hydration.
  useEffect(() => {
    if (DEMO_MODE) return
    const savedRole = localStorage.getItem('fb_role_override') as UserRole | null
    if (savedRole) setRoleOverrideState(savedRole)
    const savedUid = localStorage.getItem('fb_user_override')
    if (savedUid) setPendingOverrideUid(savedUid)
  }, [])

  const setRoleOverride = useCallback((role: UserRole | null) => {
    if (typeof window !== 'undefined') {
      if (role) {
        localStorage.setItem('fb_role_override', role)
        localStorage.removeItem('fb_user_override')
      } else {
        localStorage.removeItem('fb_role_override')
      }
    }
    // Role preview and user impersonation are mutually exclusive.
    if (role) { setUserOverrideState(null); setPendingOverrideUid(null) }
    setRoleOverrideState(role)
  }, [])

  const setUserOverride = useCallback((profile: UserProfile | null) => {
    // Impersonation supersedes any legacy role preview — always clear both so a
    // reset returns cleanly to the real super_admin account.
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fb_role_override')
      if (profile) localStorage.setItem('fb_user_override', profile.uid)
      else localStorage.removeItem('fb_user_override')
    }
    setRoleOverrideState(null)
    setPendingOverrideUid(profile?.uid ?? null)
    setUserOverrideState(profile)
  }, [])

  // Demo mode — read localStorage after mount to avoid SSR/client mismatch
  useEffect(() => {
    if (!DEMO_MODE) return
    const role = (localStorage.getItem('demo_role') as UserRole) || 'sale'
    const storedUid = localStorage.getItem('demo_user_id')
    const raw = storedUid ? MOCK_USERS.find(u => u.uid === storedUid) : MOCK_USERS.find(u => u.role === role)
    setDemoRoleState(raw?.role ?? role)
    setUser(raw ? { ...raw, createdAt: new Date(), updatedAt: new Date() } : getDemoUser(role))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setDemoRole = useCallback((role: UserRole) => {
    const firstUser = MOCK_USERS.find(u => u.role === role)
    if (typeof window !== 'undefined') {
      localStorage.setItem('demo_role', role)
      if (firstUser) localStorage.setItem('demo_user_id', firstUser.uid)
      else localStorage.removeItem('demo_user_id')
    }
    setDemoRoleState(role)
    setUser(firstUser ? { ...firstUser, createdAt: new Date(), updatedAt: new Date() } : getDemoUser(role))
  }, [])

  const setDemoUser = useCallback((uid: string) => {
    const raw = MOCK_USERS.find(u => u.uid === uid)
    if (!raw) return
    if (typeof window !== 'undefined') {
      localStorage.setItem('demo_role', raw.role)
      localStorage.setItem('demo_user_id', uid)
    }
    setDemoRoleState(raw.role)
    setUser({ ...raw, createdAt: new Date(), updatedAt: new Date() })
  }, [])

  // ── Firebase mode ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (DEMO_MODE) return

    let unsub: (() => void) | undefined

    const initFirebase = async () => {
      const fb = await import('@/lib/firebase/client')
      const auth = fb.getClientAuth()

      unsub = fb.onAuthStateChanged(auth, async (fbUser) => {
        setError(null)

        if (!fbUser) {
          setUser(null)
          setLoading(false)
          return
        }

        const email = fbUser.email ?? ''
        if (!email.endsWith('@freshket.co')) {
          await fb.signOut(fb.getClientAuth())
          setError('Access Denied: อนุญาตเฉพาะอีเมล @freshket.co เท่านั้น')
          setUser(null)
          setLoading(false)
          return
        }

        try {
          const db = fb.getClientFirestore()
          const snap = await fb.getDoc(fb.doc(db, 'users', fbUser.uid))

          if (snap.exists()) {
            setUser(mapDocToProfile(
              fbUser.uid,
              email,
              fbUser.displayName ?? email,
              fbUser.photoURL,
              snap.data() as Record<string, unknown>,
            ))
          } else {
            // First-time login — send idToken so server can verify identity
            const idToken = await fbUser.getIdToken()
            const res = await fetch('/api/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idToken,
                displayName: fbUser.displayName,
                photoURL: fbUser.photoURL,
              }),
            })

            if (!res.ok) {
              const { error: apiErr } = await res.json().catch(() => ({}))
              throw new Error(apiErr ?? `HTTP ${res.status}`)
            }

            const created = await res.json()
            setUser(mapDocToProfile(
              fbUser.uid,
              email,
              fbUser.displayName ?? email,
              fbUser.photoURL,
              created as Record<string, unknown>,
            ))
          }
        } catch (e) {
          console.error('AuthContext:', e)
          setError('ไม่สามารถโหลดข้อมูลผู้ใช้ได้ กรุณาลองใหม่')
        }

        setLoading(false)
      })
    }

    initFirebase().catch(console.error)
    return () => unsub?.()
  }, [])

  // Restore an impersonated user's profile after reload — only once the real
  // user has loaded and is confirmed super_admin (guards against a stale
  // localStorage entry granting a non-admin someone else's view).
  useEffect(() => {
    if (DEMO_MODE || !pendingOverrideUid) return
    if (user?.role !== 'super_admin') return
    if (userOverride?.uid === pendingOverrideUid) return
    let cancelled = false
    ;(async () => {
      try {
        const fb = await import('@/lib/firebase/client')
        const snap = await fb.getDoc(fb.doc(fb.getClientFirestore(), 'users', pendingOverrideUid))
        if (!cancelled && snap.exists()) {
          const d = snap.data() as Record<string, unknown>
          const profile = mapDocToProfile(
            pendingOverrideUid,
            (d.email as string) ?? '',
            (d.displayName as string) ?? '',
            (d.photoURL as string | null) ?? null,
            d,
          )
          // teamId / visibleTeamIds are usually held as localStorage patches (the
          // same overlay useAllUsers applies), not in the raw doc — apply them so
          // an impersonated manager's team survives a reload.
          const patch = getLocalUserPatches()[pendingOverrideUid]
          setUserOverrideState(patch
            ? { ...profile, teamId: patch.teamId ?? profile.teamId, visibleTeamIds: patch.visibleTeamIds ?? profile.visibleTeamIds }
            : profile)
        }
      } catch (e) {
        console.error('restore impersonation', e)
      }
    })()
    return () => { cancelled = true }
  }, [pendingOverrideUid, user?.role, userOverride?.uid])

  // ── Auth actions ──────────────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    if (DEMO_MODE) {
      setUser(getDemoUser(demoRole))
      return
    }
    setError(null)
    try {
      const fb = await import('@/lib/firebase/client')
      const provider = new fb.GoogleAuthProvider()
      provider.setCustomParameters({ hd: 'freshket.co' })
      await fb.signInWithPopup(fb.getClientAuth(), provider)
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? ''
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      setError('ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่')
    }
  }, [demoRole])

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (DEMO_MODE) return null
    const { getClientAuth } = await import('@/lib/firebase/client')
    return (await getClientAuth().currentUser?.getIdToken()) ?? null
  }, [])

  const signOutUser = useCallback(async () => {
    if (DEMO_MODE) { setUser(null); return }
    const fb = await import('@/lib/firebase/client')
    await fb.signOut(fb.getClientAuth())
    setUser(null)
  }, [])

  // Real (Firestore) role, and the effective user the app renders as. A role
  // preview only rewrites `role` in the UI — Firestore rules still enforce the
  // real role, so previewing UP won't grant real write access.
  const realRole = user?.role ?? null
  // Only a real super_admin may impersonate; user override wins over role override.
  const isRealSuperAdmin = realRole === 'super_admin'
  // Memoized so `user` keeps a stable identity across unrelated re-renders — every
  // page runs useMemo([user]) / effects on it, which would otherwise recompute
  // whenever this provider re-renders (and the `{...user, role}` spread minted a
  // fresh object each time under a role preview).
  // Both override branches MUST be gated on isRealSuperAdmin. roleOverride was
  // not: it is restored from localStorage for anyone (see the effect above), so a
  // `sale` user could set fb_role_override='super_admin', reload, and have the app
  // render them as admin. Firestore rules still blocked their WRITES (rules re-read
  // the real role server-side), but most collections are `allow read: if isAuth()`,
  // so the fake-admin UI displayed real PII, training records and feedback.
  const effectiveUser = useMemo(
    () =>
      DEMO_MODE
        ? user
        : userOverride && isRealSuperAdmin
        ? userOverride
        : user && roleOverride && roleOverride !== user.role && isRealSuperAdmin
        ? { ...user, role: roleOverride }
        : user,
    [user, userOverride, isRealSuperAdmin, roleOverride],
  )

  // Memoized so consumers only re-render when a field they actually read has
  // changed, instead of on every AuthProvider re-render (e.g. a `loading` tick
  // during a Firestore fetch that a component reading only `user` doesn't care
  // about) — the object literal here was previously recreated every render.
  const value = useMemo<AuthContextValue>(
    () => ({
      user: effectiveUser, loading, error, signInWithGoogle, signOut: signOutUser, getIdToken,
      isDemoMode: DEMO_MODE, demoRole, setDemoRole, setDemoUser,
      realRole, roleOverride, setRoleOverride, userOverride, setUserOverride,
    }),
    [effectiveUser, loading, error, signInWithGoogle, signOutUser, getIdToken,
      demoRole, setDemoRole, setDemoUser, realRole, roleOverride, setRoleOverride, userOverride, setUserOverride],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
