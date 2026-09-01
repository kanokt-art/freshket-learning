import { test, expect } from '@playwright/test'

// API authorization contract.
//
// These hit the running app's routes directly (no browser session), so they check
// the one layer the demo-mode UI suite can't: that every privileged endpoint
// refuses an unauthenticated or bad-token caller, and refuses it with the RIGHT
// status.
//
// The status matters, it isn't pedantry. POST /api/users is what creates a user
// document on a first-ever login; it used to answer 500 for a bad token, so a new
// joiner's auth failure was logged as a server fault and pointed whoever was
// debugging at the wrong layer. 401 vs 500 is the difference between "your token
// is stale" and "the backend is down".

const NO_TOKEN = [
  { method: 'GET',   path: '/api/users' },
  { method: 'PATCH', path: '/api/users' },
  { method: 'POST',  path: '/api/users/dedup' },
  { method: 'POST',  path: '/api/users/save-assignments' },
  { method: 'POST',  path: '/api/stats/rebuild' },
  { method: 'POST',  path: '/api/notifications/push' },
  { method: 'POST',  path: '/api/assessment/submit' },
  { method: 'POST',  path: '/api/assessment/start' },
  { method: 'GET',   path: '/api/assessment/assess-01/take' },
  { method: 'GET',   path: '/api/unsplash/search?q=x' },
  { method: 'POST',  path: '/api/gemini/course-image' },
] as const

test.describe('privileged endpoints reject callers with no token', () => {
  for (const { method, path } of NO_TOKEN) {
    test(`${method} ${path} → 401/403`, async ({ request }) => {
      const res = await request.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        data: method === 'GET' ? undefined : {},
        failOnStatusCode: false,
      })
      // Never 2xx (would mean open access) and never 5xx (would mean the auth
      // failure is being reported as a server fault).
      expect([401, 403]).toContain(res.status())
    })
  }
})

test.describe('token-bearing endpoints reject a malformed token with 401, not 500', () => {
  const BAD = 'not-a-real-firebase-id-token'

  test('POST /api/auth/verify → 401', async ({ request }) => {
    const res = await request.post('/api/auth/verify', { data: { idToken: BAD }, failOnStatusCode: false })
    expect(res.status()).toBe(401)
  })

  // Regression guard for the bug this suite was written around.
  test('POST /api/users → 401 (was 500)', async ({ request }) => {
    const res = await request.post('/api/users', {
      data: { idToken: BAD, displayName: 'QA Probe' },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(401)
    expect((await res.json()).error).not.toMatch(/internal/i)
  })

  test('PATCH /api/users → 401 (was 500)', async ({ request }) => {
    const res = await request.patch('/api/users', {
      headers: { Authorization: `Bearer ${BAD}` },
      data: { uid: 'someone', role: 'super_admin' },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(401)
  })
})

test('POST /api/users with no idToken → 400, and the message says which field', async ({ request }) => {
  const res = await request.post('/api/users', { data: {}, failOnStatusCode: false })
  expect(res.status()).toBe(400)
  expect((await res.json()).error).toMatch(/idToken/i)
})

// Team assignment is a MANAGER action — it was gated on super_admin while both
// the /users UI and firestore.rules said manager, so a manager moving someone
// between teams got "server ปฏิเสธ" and the change never persisted.
// These assert the gate still refuses anonymous/bad-token callers; the
// manager-can / manager-cannot-change-role split needs a real token and belongs
// to the live suite.
test.describe('save-assignments gate', () => {
  test('rejects an unauthenticated caller', async ({ request }) => {
    const res = await request.post('/api/users/save-assignments', {
      data: { assignments: [{ uid: 'csv-x', teamId: 't1' }] },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(401)
  })

  test('rejects a malformed token with 401, not 500', async ({ request }) => {
    const res = await request.post('/api/users/save-assignments', {
      headers: { Authorization: 'Bearer not-a-token' },
      data: { assignments: [{ uid: 'csv-x', teamId: 't1' }] },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(401)
  })
})
