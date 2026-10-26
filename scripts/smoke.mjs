/**
 * Post-deploy smoke test — run against the DEPLOYED app, not localhost.
 *
 *   node --env-file=.env.local scripts/smoke.mjs                     # production
 *   node --env-file=.env.local scripts/smoke.mjs https://preview-url # a preview
 *
 * Exits non-zero if anything fails, so it can gate a deploy in CI.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Login broke in production while every existing test passed. Three gaps let
 * that happen, and this closes all three:
 *
 *   1. The e2e suite runs against localhost. The fault was the Firebase Admin
 *      SDK's gRPC transport failing to settle on Vercel's runtime — it works
 *      fine locally, so no local test could ever see it.
 *   2. The API tests only send bad tokens, which are rejected at the auth step
 *      before any Firestore call. The hang was in the Firestore call, so the
 *      one code path that mattered was never executed. This mints a REAL token.
 *   3. Nothing asserted on latency. A hung request is not a wrong status code,
 *      it is a request that never answers, so every check here is timed and a
 *      slow pass is reported as a failure.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const BASE = (process.argv[2] ?? 'https://freshket-learning.vercel.app').replace(/\/$/, '')

// A request slower than this is treated as broken even if it eventually
// answers: Vercel's own ceiling is 60s, so anything approaching it is one bad
// day away from becoming a 504 for real users.
const SLOW_MS = 5_000
const HARD_TIMEOUT_MS = 30_000

const results = []

function record(name, ok, ms, detail) {
  results.push({ name, ok, ms, detail })
  const status = ok ? 'PASS' : 'FAIL'
  const timing = ms === null ? '' : ` ${ms}ms`
  console.log(`${status.padEnd(4)} ${name}${timing}${detail ? ` — ${detail}` : ''}`)
}

async function timed(name, fn, { slowMs = SLOW_MS } = {}) {
  const t = Date.now()
  try {
    const detail = await Promise.race([
      fn(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`no response within ${HARD_TIMEOUT_MS}ms`)), HARD_TIMEOUT_MS),
      ),
    ])
    const ms = Date.now() - t
    if (ms > slowMs) {
      record(name, false, ms, `too slow (limit ${slowMs}ms)`)
      return
    }
    record(name, true, ms, detail ?? undefined)
  } catch (e) {
    record(name, false, Date.now() - t, e instanceof Error ? e.message : String(e))
  }
}

/** A real Firebase ID token for an existing user, so auth-gated paths run for real. */
async function mintIdToken() {
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })

  // Reuses whichever user happens to be first — the smoke test only needs a
  // valid identity, not a particular person.
  const { users } = await getAuth(app).listUsers(1)
  if (users.length === 0) throw new Error('no users in Firebase Auth to mint a token for')

  const customToken = await getAuth(app).createCustomToken(users[0].uid)
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  )
  const body = await res.json()
  if (!body.idToken) throw new Error(`could not mint an ID token: ${JSON.stringify(body).slice(0, 200)}`)
  return body.idToken
}

console.log(`Smoke test → ${BASE}\n`)

// ── Pages load ───────────────────────────────────────────────────────────────
for (const path of ['/login', '/sale', '/tools', '/profile']) {
  await timed(`GET ${path}`, async () => {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
    return `HTTP ${res.status}`
  })
}

// ── Auth gates still refuse anonymous callers ────────────────────────────────
await timed('POST /api/users rejects no token', async () => {
  const res = await fetch(`${BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (res.status !== 400 && res.status !== 401) throw new Error(`expected 400/401, got ${res.status}`)
  return `HTTP ${res.status}`
})

// ── The login path, end to end, with a real token ────────────────────────────
// This is the check that would have caught the outage: it is the only one that
// reaches Firestore through the Admin SDK on the deployed runtime.
let idToken
try {
  idToken = await mintIdToken()
} catch (e) {
  record('mint a real ID token', false, null, e instanceof Error ? e.message : String(e))
}

if (idToken) {
  await timed('POST /api/users with a real token (the login path)', async () => {
    const res = await fetch(`${BASE}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
    const user = await res.json()
    if (!user.uid) throw new Error('response carried no uid')
    return `HTTP ${res.status}, role=${user.role}`
  })
}

// ── Report ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)

if (failed.length > 0) {
  console.error(`\nFAILED:\n${failed.map((f) => `  - ${f.name}: ${f.detail ?? 'failed'}`).join('\n')}`)
  process.exit(1)
}
console.log('All good.')
