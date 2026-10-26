import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
import { newId } from '@/lib/server/dataApi'
import { refreshManyUserStats } from '@/lib/server/userStats'
import { parseCourseScoreText, type ParsedCourseScore } from '@/lib/utils/csvParser'
import type { CSVImportError } from '@/types/tracking'

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

    const store = getStore()

    // ── Build a CASE-INSENSITIVE email → user index ────────────────────────────
    // Emails are stored as typed (the HR import keeps the raw case, so a profile
    // can hold "Sirinrat.S@freshket.co" while the CSV — and this parser —
    // lowercases to "sirinrat.s@freshket.co"). The entire client codebase matches
    // emails via `.toLowerCase()`; do the same here. Loading the people once is
    // also cheaper than N point queries. If two profiles share an email, the one
    // HR imported (`csv-…`, the person's stable id) wins over one made at a
    // first login.
    const emailIndex = new Map<string, { userId: string; displayName: string }>()
    for (const d of await store.query('users')) {
      const key = String(d.email ?? '').trim().toLowerCase()
      if (!key) continue
      const existing = emailIndex.get(key)
      if (existing && (existing.userId.startsWith('csv-') || !d.id.startsWith('csv-'))) continue
      emailIndex.set(key, { userId: d.id, displayName: (d.displayName as string) ?? key })
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
      const found = new Map(
        (await store.getMany('trainingRecords', resolved.map((r) => `${r.userId}_${courseId}`))).map((d) => [d.id, d]),
      )
      for (const r of resolved) {
        const d = found.get(`${r.userId}_${courseId}`)
        if (d) r.existing = { score: (d.score as number | null) ?? null, status: String(d.status ?? 'not_started') }
      }
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
    const batchId = newId()
    const now = new Date()

    const touchedUids = new Set<string>()
    const docs: Array<{ id: string; data: Record<string, unknown> }> = []
    for (const r of toWrite) {
      touchedUids.add(r.userId)
      const completedAt = r.completedAt
        ? new Date(r.completedAt)
        : r.status === 'completed' ? now : null
      docs.push({ id: `${r.userId}_${courseId}`, data: {
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
      } })
    }
    // A merge: fields the file does not carry (lesson progress, a pre-test score)
    // are left as they are.
    await store.setMany('trainingRecords', docs, { merge: true })

    // Refresh per-user aggregates so dashboards reflect the import immediately.
    await refreshManyUserStats(store, Array.from(touchedUids))

    await store.set('csvImports', batchId, {
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
    }, { merge: false })

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
