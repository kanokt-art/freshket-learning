const ENV_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const LS_KEY = 'demo_mode_override'

// Priority: localStorage override > env var
export function getDemoMode(): boolean {
  if (typeof window === 'undefined') return ENV_DEFAULT
  const stored = window.localStorage.getItem(LS_KEY)
  if (stored !== null) return stored === 'true'   // explicit toggle always wins
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
  'https://ivpysunrulnrdykfaezk.supabase.co/storage/v1/object/public/logo-freshket/FRESHKET%20LOGO-01.png'
