const ENV_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const LS_KEY = 'demo_mode_override'

// Demo mode serves mock data and never initializes Firebase, so AuthContext
// populates `user` from MOCK_USERS with loading=false — which satisfies the
// dashboard's auth gate WITHOUT a Google sign-in. That makes the localStorage
// toggle an auth bypass of the app shell if it can turn demo mode ON in a build
// where the env var says it should be off.
//
// So the override is one-directional in production: it may turn demo mode OFF
// (a developer opting out on a demo build) but never ON. In development both
// directions still work, which is where the toggle is actually used.
const OVERRIDE_MAY_ENABLE = ENV_DEFAULT || process.env.NODE_ENV !== 'production'

// Priority: localStorage override > env var (subject to the guard above)
export function getDemoMode(): boolean {
  if (typeof window === 'undefined') return ENV_DEFAULT
  const stored = window.localStorage.getItem(LS_KEY)
  if (stored !== null) {
    const wanted = stored === 'true'
    if (wanted && !OVERRIDE_MAY_ENABLE) return false
    return wanted
  }
  return ENV_DEFAULT
}

export function toggleDemoMode(): void {
  const next = !getDemoMode()
  window.localStorage.setItem(LS_KEY, String(next))
  window.location.reload()
}

// Static constant — still valid for SSR / non-interactive imports
// For client code that needs reactivity, call getDemoMode() instead
export const DEMO_MODE = ENV_DEFAULT

export const FRESHKET_LOGO_URL =
  'https://dwrbdsoumciwjszloluz.supabase.co/storage/v1/object/public/freshket%20AW/freshket-original.svg'
