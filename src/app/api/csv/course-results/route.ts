import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'
import { parseCourseScoreText, type ParsedCourseScore } from '@/lib/utils/csvParser'
import type { CSVImportError } from '@/types/tracking'
import { computeUserStats } from '@/types/stats'

// Per-course score import (นำเข้าผลคะแนน) — two-phase so the admin always sees
// duplicates BEFORE anything is written:
//   mode=check  → parse + resolve users + diff against existing trainingRecords;
//                 returns new rows, duplicates (old → new values) and unmatched
//                 emails. Writes nothing.
//   mode=commit → same resolution, then writes. Duplicate rows follow
//                 `strategy`: 'overwrite' replaces the existing record,
//                 'skip' leaves it untouched.

interface ResolvedRow extends ParsedCourseScore {
  userId: string
  displayName: string
  existing?: { score: number | null; status: string }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const courseId = (formData.get('courseId') as string | null)?.trim()
    const courseTitle = ((formData.get('courseTitle') as string | null) ?? '').trim()
    const mode = formData.get('mode') as 'check' | 'commit' | null
    const strategy = (formData.get('strategy') as 'overwrite' | 'skip' | null) ?? 'skip'

    if (!file || !courseId || !mode || !['check', 'commit'].includes(mode)) {
      return NextResponse.json({ error: 'Missing file, courseId or mode' }, { status: 400 })
    }

    const text = await file.text()
    const { data: rows, errors } = parseCourseScoreText(text)
    const allErrors: CSVImportError[] = [...errors]

    const db = getAdminFirestore()

    // ── Build a CASE-INSENSITIVE email → user index ────────────────────────────
    // A per-row `where('email','==',...)` query is case-SENSITIVE, but user docs
    // don't store emails uniformly: saveLocalImportedUsers writes the raw-case
    // email, so a doc can hold "Sirinrat.S@freshket.co" while the CSV (and this
    // parser) lowercases to "sirinrat.s@freshket.co" → the exact query misses it
    // and the employee reads as "not found" despite existing. The entire client
    // codebase matches emails via `.toLowerCase()`; do the same here. Loading the
    // collection once is also cheaper than N point queries. When both an auth doc
    // and a csv- doc share an email, prefer the auth doc (its uid is canonical,
    // same tiebreak useAllUsers applies).
    const emailIndex = new Map<string, { userId: string; displayName: string }>()
    const usersSnap = await db.collection('users').get()
    for (const doc of usersSnap.docs) {
      const d = doc.data()
      const key = String(d.email ?? '').trim().toLowerCase()
      if (!key) continue
      const isCsv = doc.id.startsWith('csv-')
      const existing = emailIndex.get(key)
      // Keep the first non-csv match; only let a csv doc fill a gap.
      if (existing && !isCsv && existing.userId.startsWith('csv-')) {
        // upgrade a previously-stored csv uid to the auth uid
      } else if (existing) {
        continue
      }
      emailIndex.set(key, { userId: doc.id, displayName: (d.displayName as string) ?? key })
    }

    // ── Resolve each row's email against the index (case-insensitive) ──────────
    const resolved: ResolvedRow[] = []
    const unmatched: string[] = []
    const seenEmails = new Set<string>()
    for (const row of rows) {
      // In-file duplicate (same email appears twice — normal for a Pre+Post
      // export) — silently keep the LAST occurrence so a corrected/later row
      // wins. Not surfaced as an error; it's expected, not a data problem.
      if (seenEmails.has(row.email)) {
        const idx = resolved.findIndex((r) => r.email === row.email)
        if (idx >= 0) resolved.splice(idx, 1)
      }
      seenEmails.add(row.email)

      const hit = emailIndex.get(row.email)
      if (!hit) {
        if (!unmatched.includes(row.email)) unmatched.push(row.email)
        continue
      }
      resolved.push({ ...row, userId: hit.userId, displayName: hit.displayName })
    }

    // ── Diff against existing records for THIS course ──────────────────────────
    if (resolved.length > 0) {
      const refs = resolved.map((r) => db.collection('trainingRecords').doc(`${r.userId}_${courseId}`))
      const snaps = await db.getAll(...refs)
      snaps.forEach((snap, i) => {
        if (snap.exists) {
          const d = snap.data()!
          resolved[i].existing = { score: (d.score as number | null) ?? null, status: String(d.status ?? 'not_started') }
        }
      })
    }

    const fresh = resolved.filter((r) => !r.existing)
    const duplicates = resolved.filter((r) => r.existing)

    if (mode === 'check') {
      return NextResponse.json({
        newRows: fresh.map((r) => ({ email: r.email, displayName: r.displayName, score: r.score ?? null, status: r.status })),
        duplicates: duplicates.map((r) => ({
          email: r.email,
          displayName: r.displayName,
          existingScore: r.existing!.score,
          existingStatus: r.existing!.status,
          newScore: r.score ?? null,
          newStatus: r.status,
        })),
        unmatched,
        errors: allErrors,
      })
    }

    // ── Commit ─────────────────────────────────────────────────────────────────
    const toWrite = strategy === 'overwrite' ? [...fresh, ...duplicates] : fresh
    const skipped = strategy === 'overwrite' ? 0 : duplicates.length
    const batchId = db.collection('csvImports').doc().id
    const now = Timestamp.now()

    const batch = db.batch()
    const touchedUids = new Set<string>()
    for (const r of toWrite) {
      touchedUids.add(r.userId)
      const completedAt = r.completedAt
        ? Timestamp.fromDate(new Date(r.completedAt))
        : r.status === 'completed' ? now : null
      batch.set(db.collection('trainingRecords').doc(`${r.userId}_${courseId}`), {
        userId: r.userId,
        courseId,
        courseTitle,
        status: r.status,
        // Omit the field entirely when there's no score. Writing `null` made
        // "no score" indistinguishable from a real 0 for any `!== undefined`
        // guard downstream (it corrupted the average-score card).
        ...(r.score != null ? { score: r.score } : {}),
        completedAt,
        source: 'csv_import',
        importBatchId: batchId,
        updatedAt: now,
      }, { merge: true })
    }
    await batch.commit()

    // Refresh per-user aggregates so dashboards reflect the import immediately.
    const statsNow = new Date()
    for (const uid of Array.from(touchedUids)) {
      const recs = await db.collection('trainingRecords').where('userId', '==', uid).get()
      const records = recs.docs.map((d) => ({
        status: String(d.data().status ?? 'not_started'),
        score: (d.data().score as number | undefined) ?? null,
      }))
      await db.collection('userStats').doc(uid).set({ ...computeUserStats(uid, records), updatedAt: statsNow })
    }

    await db.collection('csvImports').doc(batchId).set({
      id: batchId,
      type: 'course_results',
      courseId,
      courseTitle,
      fileName: file.name,
      totalRows: rows.length,
      successRows: toWrite.length,
      skippedRows: skipped,
      failedRows: unmatched.length + errors.length,
      errors: allErrors,
      importedAt: now,
    })

    return NextResponse.json({
      batchId,
      written: toWrite.length,
      skipped,
      unmatched,
      errors: allErrors,
    })
  } catch (e) {
    console.error('POST /api/csv/course-results', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
