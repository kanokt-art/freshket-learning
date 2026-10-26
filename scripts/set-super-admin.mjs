/**
 * One-off script: set role=super_admin for a given email.
 * Talks to the database with the service-role key from .env.local — delete this
 * file after use.
 *
 * Usage: node --env-file=.env.local scripts/set-super-admin.mjs kanok.t@freshket.co
 *
 * The person must already have a profile — either imported from the HR file or
 * created by signing in once. Someone who has done neither is told so rather than
 * given a half-made profile.
 */

const email = process.argv[2]
if (!email) {
  console.error('Usage: node --env-file=.env.local scripts/set-super-admin.mjs <email>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local)')
  process.exit(1)
}

// email_lc is the stored lower-case copy of the email: a plain equality, where a
// case-insensitive LIKE would treat the `_` in real addresses as a wildcard.
const target = `${url.replace(/\/$/, '')}/rest/v1/users?email_lc=eq.${encodeURIComponent(email.trim().toLowerCase())}`

const res = await fetch(target, {
  method: 'PATCH',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({ role: 'super_admin', updated_at: new Date().toISOString() }),
})

if (!res.ok) {
  console.error(`❌ Error: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
}

const changed = await res.json()
if (changed.length === 0) {
  console.error(`❌ No profile for ${email}\n   Sign in with Google once (or import them from the HR file), then run this again.`)
  process.exit(1)
}

console.log(`✅ Done — ${changed.length} profile(s) for ${email} now super_admin`)
