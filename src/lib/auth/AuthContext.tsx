'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { UserProfile, UserRole } from '@/types/user'
import { getDemoMode } from '@/lib/demo/demoMode'

const DEMO_MODE = getDemoMode()
import { MOCK_USERS } from '@/lib/utils/mockData'

// ── Demo helpers ──────────────────────────────────────────────────────────────

function getDemoUser(role: UserRole): UserProfile {
  const raw = MOCK_USERS.find((u) => u.role === role) ?? MOCK_USERS[0]
  return { ...raw, createdAt: new Date(), updatedAt: new Date() }
}

// ── Firestore doc → UserProfile ───────────────────────────────────────────────

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
    department: data.department as string | undefined,
    position: data.position as string | undefined,
    nickname: data.nickname as string | undefined,
    startDate: data.startDate ? (data.startDate as { toDate(): Date }).toDate() : undefined,
    createdAt: data.createdAt ? (data.createdAt as { toDate(): Date }).toDate() : new Date(),
    updatedAt: data.updatedAt ? (data.updatedAt as { toDate(): Date }).toDate() : new Date(),
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

  function setDemoRole(role: UserRole) {
    const firstUser = MOCK_USERS.find(u => u.role === role)
    if (typeof window !== 'undefined') {
      localStorage.setItem('demo_role', role)
      if (firstUser) localStorage.setItem('demo_user_id', firstUser.uid)
      else localStorage.removeItem('demo_user_id')
    }
    setDemoRoleState(role)
    setUser(firstUser ? { ...firstUser, createdAt: new Date(), updatedAt: new Date() } : getDemoUser(role))
  }

  function setDemoUser(uid: string) {
    const raw = MOCK_USERS.find(u => u.uid === uid)
    if (!raw) return
    if (typeof window !== 'undefined') {
      localStorage.setItem('demo_role', raw.role)
      localStorage.setItem('demo_user_id', uid)
    }
    setDemoRoleState(raw.role)
    setUser({ ...raw, createdAt: new Date(), updatedAt: new Date() })
  }

  // ── Firebase mode ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (DEMO_MODE) return

    let unsub: (() => void) | undefined

    const initFirebase = async () => {
      const { onAuthStateChanged } = await import('firebase/auth')
      const { getClientAuth, getClientFirestore } = await import('@/lib/firebase/client')
      const auth = getClientAuth()

      unsub = onAuthStateChanged(auth, async (fbUser) => {
        setError(null)

        if (!fbUser) {
          setUser(null)
          setLoading(false)
          return
        }

        const email = fbUser.email ?? ''
        if (!email.endsWith('@freshket.co')) {
          const { signOut: fbSignOut } = await import('firebase/auth')
          await fbSignOut(getClientAuth())
          setError('Access Denied: อนุญาตเฉพาะอีเมล @freshket.co เท่านั้น')
          setUser(null)
          setLoading(false)
          return
        }

        try {
          const { doc, getDoc } = await import('firebase/firestore')
          const db = getClientFirestore()
          const snap = await getDoc(doc(db, 'users', fbUser.uid))

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

  // ── Auth actions ──────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    if (DEMO_MODE) {
      setUser(getDemoUser(demoRole))
      return
    }
    setError(null)
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
    const { getClientAuth } = await import('@/lib/firebase/client')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ hd: 'freshket.co' })
    await signInWithPopup(getClientAuth(), provider)
  }

  async function getIdToken(): Promise<string | null> {
    if (DEMO_MODE) return null
    const { getClientAuth } = await import('@/lib/firebase/client')
    return (await getClientAuth().currentUser?.getIdToken()) ?? null
  }

  async function signOutUser() {
    if (DEMO_MODE) { setUser(null); return }
    const { signOut: fbSignOut } = await import('firebase/auth')
    const { getClientAuth } = await import('@/lib/firebase/client')
    await fbSignOut(getClientAuth())
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, error, signInWithGoogle, signOut: signOutUser, getIdToken, isDemoMode: DEMO_MODE, demoRole, setDemoRole, setDemoUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
