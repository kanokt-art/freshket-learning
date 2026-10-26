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
 *   1. The e2e suite runs against localhost. The fault was a database transport
 *      failing to settle on Vercel's runtime — it works fine locally, so no
 *      local test could ever see it.
 *   2. The API tests only send bad tokens, which are rejected at the auth step
 *      before any database call. The hang was in the database call, so the
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
for (const [name, path, body] of [
  ['POST /api/auth/session rejects no token', '/api/auth/session', {}],
  ['POST /api/data/query rejects no token', '/api/data/query', { path: 'courses' }],
]) {
  await timed(name, async () => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`)
    return `HTTP ${res.status}`
  })
}

// ── The login path, end to end, with a real token ────────────────────────────
// This is the check that would have caught the outage: it is the only one that
// reaches the database from the deployed runtime. Note that it behaves exactly
// like that person signing in, so the first run links their login to their HR
// profile.
let idToken
try {
  idToken = await mintIdToken()
} catch (e) {
  record('mint a real ID token', false, null, e instanceof Error ? e.message : String(e))
}

if (idToken) {
  const authed = { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }

  await timed('POST /api/auth/session with a real token (the login path)', async () => {
    const res = await fetch(`${BASE}/api/auth/session`, { method: 'POST', headers: authed })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
    const { user } = await res.json()
    if (!user?.uid) throw new Error('response carried no uid')
    return `HTTP ${res.status}, role=${user.role}`
  })

  await timed('POST /api/data/query reads a collection', async () => {
    const res = await fetch(`${BASE}/api/data/query`, {
      method: 'POST', headers: authed, body: JSON.stringify({ path: 'courses' }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
    const { docs } = await res.json()
    if (!Array.isArray(docs)) throw new Error('response carried no docs array')
    return `HTTP ${res.status}, ${docs.length} course(s)`
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
