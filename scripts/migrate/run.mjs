// Firestore -> Supabase Postgres: the data move.
//
//   node scripts/migrate/run.mjs            DRY RUN. Reads Firestore, plans the
//                                           merge, builds every row, validates
//                                           them, prints a report. Writes nothing.
//   node scripts/migrate/run.mjs --apply    The same, then loads the rows into
//                                           Supabase and checks the counts.
//
// The decisions all live in firestoreToPostgres.ts, which is unit-tested. This
// file only does I/O: read, call it, write.
//
// SAFE TO RE-RUN. Rows are upserted on their primary key, so running --apply
// twice leaves the same data, not two copies.
//
// PRIVACY. The report prints counts and field NAMES only — never a name, email,
// id or value — so its output is safe to read and to paste. Error text from the
// database is truncated to keep it that way.
//
// Needs, in .env.local: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
// FIREBASE_PRIVATE_KEY; and for --apply, NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (server-side only — never NEXT_PUBLIC_).
//
// Requires migrations 004 and 005 to have been run first.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  planUserMerge, buildUserRows, buildTable, deriveUserStats, makeRemap,
  SPECS, SKIPPED_COLLECTIONS,
} from './firestoreToPostgres.ts'
import { computeUserStats } from '../../src/types/stats.ts'

const APPLY = process.argv.includes('--apply')
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(`${ROOT}package.json`)

// ── Environment ─────────────────────────────────────────────────────────────

const env = {}
for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const need = (name) => {
  if (!env[name]) throw new Error(`${name} is not set in .env.local`)
  return env[name]
}

// ── Firestore ───────────────────────────────────────────────────────────────

const { initializeApp, cert } = require('firebase-admin/app')
const { initializeFirestore } = require('firebase-admin/firestore')

const app = initializeApp({
  credential: cert({
    projectId: need('FIREBASE_PROJECT_ID'),
    clientEmail: need('FIREBASE_CLIENT_EMAIL'),
    privateKey: need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
})
const db = initializeFirestore(app, { preferRest: true })

const readAll = async (name) =>
  (await db.collection(name).get()).docs.map((d) => ({ id: d.id, data: d.data() }))

console.log(APPLY ? 'MODE: --apply (will write to Supabase)\n' : 'MODE: dry run (nothing is written)\n')

const userDocs = await readAll('users')

// Each source collection once. Notifications are a subcollection, read as a
// group; the owner is in the path, so it is carried in as __parentUid.
const docsBySource = {}
for (const spec of SPECS) {
  if (spec.source === 'notifications') continue
  docsBySource[spec.source] = await readAll(spec.source)
}
docsBySource.notifications = (await db.collectionGroup('items').get()).docs
  .filter((d) => d.ref.parent.parent?.parent?.id === 'notifications')
  .map((d) => ({ id: d.id, data: { ...d.data(), __parentUid: d.ref.parent.parent.id } }))

// Anything in Firestore this tool does not know about is reported, not ignored.
// userStats is known but not copied: it is a summary of training records and is
// recomputed below (see deriveUserStats), so it is counted here only to report
// how the recomputed number compares with what was there.
const known = new Set(['users', 'userStats', ...SPECS.map((s) => s.source), ...SKIPPED_COLLECTIONS])
const unknownCollections = (await db.listCollections()).map((c) => c.id).filter((n) => !known.has(n))

const oldStatsDocs = (await db.collection('userStats').count().get()).data().count

const skipped = {}
for (const name of SKIPPED_COLLECTIONS) {
  skipped[name] = (await db.collection(name).count().get()).data().count
}

// ── Plan ────────────────────────────────────────────────────────────────────

const plan = planUserMerge(userDocs)
const remap = makeRemap(plan.uidMap)

const built = [buildUserRows(plan)]
for (const spec of SPECS) built.push(buildTable(spec, docsBySource[spec.source] ?? [], remap))

const training = built.find((b) => b.report.table === 'training_records')
const statsRows = deriveUserStats(training.rows, computeUserStats, new Date().toISOString())
built.push({
  rows: statsRows,
  report: {
    table: 'user_stats', source: oldStatsDocs, rows: statsRows.length, collisions: 0,
    unmapped: {}, missingRequired: {}, badValues: {},
  },
})

// ── Report ──────────────────────────────────────────────────────────────────

const blocking = built.filter(
  (b) => Object.keys(b.report.missingRequired).length || Object.keys(b.report.badValues).length,
)

console.log('USERS — merge')
console.log(JSON.stringify(plan.report, null, 2))

console.log('\nTABLES')
console.log(['table'.padEnd(24), 'source'.padStart(7), 'rows'.padStart(7), 'collide'.padStart(8), '  notes'].join(' '))
for (const { report: r } of built) {
  const notes = []
  const un = Object.entries(r.unmapped)
  if (un.length) notes.push(`→ extra: ${un.map(([f, c]) => `${f}×${c}`).join(', ')}`)
  if (Object.keys(r.missingRequired).length) notes.push(`MISSING: ${JSON.stringify(r.missingRequired)}`)
  if (Object.keys(r.badValues).length) notes.push(`BAD VALUES: ${JSON.stringify(r.badValues)}`)
  console.log([
    r.table.padEnd(24), String(r.source).padStart(7), String(r.rows).padStart(7),
    String(r.collisions).padStart(8), '  ' + notes.join(' | '),
  ].join(' '))
}

console.log('\nuser_stats is recomputed from training_records, not copied: "source" is how many summaries existed.')
console.log('\nNOT MIGRATED (cancelled PVP project):', JSON.stringify(skipped))
if (unknownCollections.length) console.log('UNKNOWN COLLECTIONS (no spec — not migrated):', unknownCollections.join(', '))

console.log(`\nretired ids that references are re-pointed away from: ${plan.report.retiredIds}`)
console.log(blocking.length
  ? `\nPROBLEMS: ${blocking.length} table(s) have rows Postgres would reject. Fix before --apply.`
  : '\nNo rows would be rejected by NOT NULL or CHECK constraints.')

if (!APPLY) {
  console.log('\nDRY RUN — nothing was written.')
  process.exit(blocking.length ? 1 : 0)
}

// ── Apply ───────────────────────────────────────────────────────────────────

if (blocking.length) {
  console.error('\nRefusing to apply with the problems above.')
  process.exit(1)
}

const base = need('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
const key = need('SUPABASE_SERVICE_ROLE_KEY')
const headers = (extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra })
console.log(`\nTarget: ${new URL(base).host}`)

// 005 adds users.auth_uid. If it is not there, nothing below can load correctly.
{
  const res = await fetch(`${base}/rest/v1/users?select=auth_uid&limit=0`, { headers: headers() })
  if (!res.ok) {
    console.error(`Schema check failed (HTTP ${res.status}): has migration 005 been run?`)
    process.exit(1)
  }
}

const countOf = async (table) => {
  const res = await fetch(`${base}/rest/v1/${table}?select=*`, {
    method: 'HEAD',
    headers: headers({ Prefer: 'count=exact', Range: '0-0' }),
  })
  const total = (res.headers.get('content-range') ?? '').split('/')[1]
  return total === undefined || total === '*' ? NaN : Number(total)
}

const specByTable = Object.fromEntries([...SPECS].map((s) => [s.table, s]))
const keyColumnsOf = (table) =>
  table === 'users' ? ['uid'] : table === 'user_stats' ? ['uid'] : specByTable[table].keyColumns

const CHUNK = 500
let mismatches = 0
for (const { rows, report } of built) {
  const table = report.table
  const conflict = keyColumnsOf(table).join(',')
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    // Rows deliberately omit nulls so the table default applies, which means
    // they do not all carry the same keys. PostgREST refuses a batch like that
    // ("All object keys must match") unless it is told the full column list;
    // with `columns` given, missing=default fills the gaps with each column's
    // default rather than forcing NULL.
    const columns = Array.from(new Set(chunk.flatMap((r) => Object.keys(r))))
    const res = await fetch(
      `${base}/rest/v1/${table}?on_conflict=${conflict}&columns=${columns.map(encodeURIComponent).join(',')}`,
      {
        method: 'POST',
        headers: headers({
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal,missing=default',
        }),
        body: JSON.stringify(chunk),
      },
    )
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300)
      console.error(`\n${table}: HTTP ${res.status} loading rows ${i}-${i + CHUNK}: ${text}`)
      console.error('Stopping. Nothing already loaded is undone; re-running is safe.')
      process.exit(1)
    }
  }
  const actual = await countOf(table)
  const ok = actual === rows.length
  if (!ok) mismatches++
  console.log(`${ok ? 'ok      ' : 'MISMATCH'} ${table.padEnd(24)} sent ${String(rows.length).padStart(6)}   in table ${String(actual).padStart(6)}`)
}

console.log(mismatches
  ? `\n${mismatches} table(s) do not match. Investigate before relying on this data.`
  : '\nAll tables loaded and counted. Re-running this is safe.')
process.exit(mismatches ? 1 : 0)
