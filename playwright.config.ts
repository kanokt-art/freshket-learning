import { defineConfig, devices } from '@playwright/test'

// E2E config for the `demo` suite: every spec under e2e/ runs against the app in
// demo mode, which never initializes Firebase. That keeps the suite fast and
// deterministic AND means it can never touch production Firestore — important,
// because this project has no Firebase emulator configured.
//
// Consequence to keep in mind: these tests exercise UI, routing and the
// client-side RBAC render guards. They do NOT cover firestore.rules or the API
// routes; those need a separate suite pointed at a dedicated test Firebase
// project (see the test plan, §1).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  // `next dev` compiles each route on first request. With many workers hitting
  // cold routes at once, first paint can take several seconds, and the default
  // 5s expect timeout made guard assertions fail intermittently even though the
  // guards were correct. Cap the workers and give assertions real headroom —
  // a flaky negative-auth suite is worse than no suite, because a genuine
  // regression becomes indistinguishable from noise.
  workers: process.env.CI ? 2 : 3,
  expect: { timeout: 15_000 },
  timeout: 60_000,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // The app's own UI is Thai; keep the browser locale aligned so any
    // Intl-formatted date/number in an assertion matches what a user sees.
    locale: 'th-TH',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // NEXT_PUBLIC_DEMO_MODE is baked in at build time for a production build, but
  // `next dev` reads it per request, so setting it here is enough — and because
  // NODE_ENV !== 'production' in dev, the per-test localStorage override in
  // e2e/fixtures.ts is also permitted (see lib/demo/demoMode.ts).
  //
  // FOOTGUN: `reuseExistingServer` will happily attach to a dev server that is
  // already running — including one whose `.next` was overwritten by a
  // `next build` in the meantime. That server then serves a half-broken app:
  // auth never resolves, `user` stays null, and because every route guard is
  // written `if (user && !canAccess(...))` it fails open and the whole negative
  // suite goes red for environmental reasons. If these tests fail en masse,
  // stop the dev server and delete `.next` before believing the result.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NEXT_PUBLIC_DEMO_MODE: 'true' },
  },
})
