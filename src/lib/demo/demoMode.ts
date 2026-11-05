// Demo mode serves mock data and never initializes Firebase, so AuthContext populates `user` from MOCK_USERS
// with loading=false — which satisfies the dashboard's auth gate WITHOUT a Google sign-in. In a deployed app that
// is an authentication bypass, so demo mode simply cannot run there: it exists only under `next dev`.
//
// Every deployment — Production and Preview alike — is a production build (NODE_ENV === 'production'), so
// NEXT_PUBLIC_DEMO_MODE is ignored there and so is the localStorage toggle. Nothing a person can set, in the
// environment or in their browser, turns it on.
const IS_PRODUCTION_BUILD = process.env.NODE_ENV === 'production'

/** May demo mode run at all in this build? Only in development. */
export const DEMO_MODE_ALLOWED = !IS_PRODUCTION_BUILD

const ENV_DEFAULT = DEMO_MODE_ALLOWED && process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const LS_KEY = 'demo_mode_override'

// Priority (development only): localStorage override > env var
export function getDemoMode(): boolean {
  if (!DEMO_MODE_ALLOWED) return false
  if (typeof window === 'undefined') return ENV_DEFAULT
  const stored = window.localStorage.getItem(LS_KEY)
  if (stored !== null) return stored === 'true'
  return ENV_DEFAULT
}

export function toggleDemoMode(): void {
  if (!DEMO_MODE_ALLOWED) return
  const next = !getDemoMode()
  window.localStorage.setItem(LS_KEY, String(next))
  window.location.reload()
}

// Static constant — still valid for SSR / non-interactive imports
// For client code that needs reactivity, call getDemoMode() instead
export const DEMO_MODE = ENV_DEFAULT

export const FRESHKET_LOGO_URL =
  'https://dwrbdsoumciwjszloluz.supabase.co/storage/v1/object/public/freshket%20AW/freshket-original.svg'
