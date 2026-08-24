import { test as base, type Page } from '@playwright/test'

// Fixture uids from src/lib/utils/mockData.ts. Demo mode renders as one of these
// accounts with no Google sign-in, which is the only deterministic auth seam the
// app has.
export const USERS = {
  superAdmin: { uid: 'mock-admin-01', role: 'super_admin' },
  manager:    { uid: 'mock-mgr-01',   role: 'manager' },
  teamLead:   { uid: 'mock-tl-01',    role: 'team_lead' },
  sale:       { uid: 'mock-sale-01',  role: 'sale' },
} as const

export type FixtureUser = keyof typeof USERS

/**
 * Sign the page in as one of the demo fixture users.
 *
 * Must run BEFORE the first navigation: AuthContext captures the demo flag at
 * module scope and reads demo_role / demo_user_id on mount, so a value written
 * after first paint is ignored until a reload.
 *
 * localStorage.clear() is not optional — demoStore persists every mutation under
 * `fk_demo_v2` and merges it over the fixtures on load, so without clearing, a
 * later test would inherit whatever an earlier one changed.
 */
export async function loginAs(page: Page, who: FixtureUser) {
  const { uid, role } = USERS[who]
  await page.addInitScript(
    ([u, r]) => {
      try {
        localStorage.clear()
        localStorage.setItem('demo_mode_override', 'true')
        localStorage.setItem('demo_role', r)
        localStorage.setItem('demo_user_id', u)
      } catch { /* storage blocked — the test will fail on its own assertion */ }
    },
    [uid, role] as const,
  )
}

/** Wait for the dashboard shell to have decided who we are. */
export async function gotoAsUser(page: Page, who: FixtureUser, path: string) {
  await loginAs(page, who)
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  // The layout renders a spinner until auth resolves; the role pill in the header
  // is the first thing that proves the app agreed on an identity.
  await page.waitForLoadState('networkidle')
}

export const test = base
export { expect } from '@playwright/test'
