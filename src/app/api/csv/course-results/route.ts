import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
import { newId } from '@/lib/server/dataApi'
import { refreshManyUserStats } from '@/lib/server/userStats'
import { parseCourseScoreText } from '@/lib/utils/csvParser'
import { groupByPerson, recordPatch, diffOf, type ExistingRecord } from '@/lib/courses/scoreImport'
import type { CSVImportError } from '@/types/tracking'

// Per-course score import (นำเข้าผลคะแนน) — two-phase so the admin always sees what
// will change BEFORE anything is written:
//   mode=check  → parse + resolve users + compare with what is stored; returns
//                 people who are new, people whose record will be updated (stored →
//                 file, for the before and the after score), and unmatched emails.
//                 Writes nothing.
//   mode=commit → same resolution, then writes.
//
// The file has a `type` column: pre (before the course) or post (after). A person
// normally has two rows and both land on ONE record, in separate columns, so the
// gain can be read off it (see lib/courses/scoreImport.ts for exactly what each row
// writes).
//
// UPLOADING THE SAME FILE AGAIN: the new file wins. Every value it carries replaces
// what is stored; a value it leaves blank is left alone. There is no "skip
// duplicates" choice any more: re-uploading a corrected file is the normal way to
// fix a mistake, and skipping would have ignored the correction.

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const courseId = (formData.get('courseId') as string | null)?.trim()
    const courseTitle = ((formData.get('courseTitle') as string | null) ?? '').trim()
    const mode = formData.get('mode') as 'check' | 'commit' | null

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

    // ── One entry per person (their before and after together), then resolve ───
    const people = groupByPerson(rows)
    const resolved: Array<{ person: (typeof people)[number]; userId: string; displayName: string; existing: ExistingRecord | null }> = []
    const unmatched: string[] = []
    for (const person of people) {
      const hit = emailIndex.get(person.email)
      if (!hit) { unmatched.push(person.email); continue }
      resolved.push({ person, userId: hit.userId, displayName: hit.displayName, existing: null })
    }

    // ── What is stored for THIS course ─────────────────────────────────────────
    if (resolved.length > 0) {
      const found = new Map(
        (await store.getMany('trainingRecords', resolved.map((r) => `${r.userId}_${courseId}`))).map((d) => [d.id, d]),
      )
      for (const r of resolved) {
        const d = found.get(`${r.userId}_${courseId}`)
        if (d) r.existing = d as unknown as ExistingRecord
      }
    }

    const fresh = resolved.filter((r) => !r.existing)
    const updates = resolved.filter((r) => r.existing)

    if (mode === 'check') {
      const preview = (r: (typeof resolved)[number]) => ({ email: r.person.email, displayName: r.displayName, ...diffOf(r.person, r.existing) })
      return NextResponse.json({
        newRows: fresh.map(preview),
        duplicates: updates.map(preview),
        unmatched,
        errors: allErrors,
      })
    }

    // ── Commit ─────────────────────────────────────────────────────────────────
    const batchId = newId()
    const now = new Date()

    const docs = resolved.map((r) => ({
      id: `${r.userId}_${courseId}`,
      data: {
        userId: r.userId,
        courseId,
        courseTitle,
        source: 'csv_import',
        importBatchId: batchId,
        updatedAt: now,
        ...recordPatch(r.person, r.existing, now),
      } as Record<string, unknown>,
    }))
    // A merge: fields the file does not carry (lesson progress, a score for a sitting
    // the file has no row for) are left as they are.
    await store.setMany('trainingRecords', docs, { merge: true })

    // Refresh per-user aggregates so dashboards reflect the import immediately.
    await refreshManyUserStats(store, resolved.map((r) => r.userId))

    await store.set('csvImports', batchId, {
      type: 'course_results',
      courseId,
      courseTitle,
      fileName: file.name,
      totalRows: rows.length,
      successRows: resolved.length,
      skippedRows: 0,
      failedRows: unmatched.length + errors.length,
      errors: allErrors,
      importedAt: now,
    }, { merge: false })

    return NextResponse.json({
      batchId,
      written: resolved.length,
      created: fresh.length,
      updated: updates.length,
      unmatched,
      errors: allErrors,
    })
  } catch (e) {
    console.error('POST /api/csv/course-results', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
