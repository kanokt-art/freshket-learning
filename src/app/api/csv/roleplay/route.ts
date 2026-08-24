import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'
import { parseRoleplayText, type ParsedRoleplayRow } from '@/lib/utils/csvParser'
import type { CSVImportError } from '@/types/tracking'
import type { UserRole } from '@/types/user'

// Roleplay assessment import (FKT-Learning-Master - Roleplay export) — two-phase
// so the admin always sees what will happen BEFORE anything is written:
//   mode=check  → parse + resolve the SUBJECT (Name column) to a user + resolve
//                 the ASSESSOR (Email Address) + diff against existing docs.
//                 Returns new rows, duplicates, unmatched names, skipped test
//                 rows and errors. Writes nothing.
//   mode=commit → same resolution, then writes to `roleplayAssessments`.
//                 Duplicates follow `strategy` ('overwrite' | 'skip').
//
// SUBJECT matching is by NAME (there is no per-trainee email in the file — the
// email column is the grader). The name is matched case-insensitively against
// nickname → English-name first token → Thai-name first token, mirroring how the
// rest of the app resolves people.

interface ResolvedRow extends ParsedRoleplayRow {
  docId: string
  subjectUid: string
  subjectDisplayName: string
  assessorUid: string
  assessorName: string
  assessorRole: UserRole
  existing?: boolean
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x'
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const mode = formData.get('mode') as 'check' | 'commit' | null
    const strategy = (formData.get('strategy') as 'overwrite' | 'skip' | null) ?? 'skip'

    if (!file || !mode || !['check', 'commit'].includes(mode)) {
      return NextResponse.json({ error: 'Missing file or mode' }, { status: 400 })
    }

    const text = await file.text()
    const { data: parsedRows, skipped, errors } = parseRoleplayText(text)
    const allErrors: CSVImportError[] = [...errors]

    const db = getAdminFirestore()

    // ── Build case-insensitive indexes from the users collection (one read) ────
    // emailIndex: lowercased email → assessor. nameIndex: candidate name key →
    // subject, with priority (nickname > EN first token > Thai first token) so a
    // more specific match wins. Both prefer auth docs over csv- docs on a tie,
    // matching useAllUsers' canonical-uid rule.
    const emailIndex = new Map<string, { userId: string; displayName: string; role: UserRole }>()
    const nameIndex = new Map<string, { userId: string; displayName: string; priority: number }>()
    const usersSnap = await db.collection('users').get()

    const firstToken = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    const registerName = (key: string, userId: string, displayName: string, priority: number) => {
      if (!key) return
      const cur = nameIndex.get(key)
      const isCsv = userId.startsWith('csv-')
      if (!cur || priority > cur.priority || (priority === cur.priority && cur.userId.startsWith('csv-') && !isCsv)) {
        nameIndex.set(key, { userId, displayName, priority })
      }
    }

    for (const doc of usersSnap.docs) {
      const d = doc.data()
      const userId = doc.id
      const isCsv = userId.startsWith('csv-')
      const displayName = (d.displayName as string) ?? (d.displayNameEN as string) ?? userId

      const emailKey = String(d.email ?? '').trim().toLowerCase()
      if (emailKey) {
        const cur = emailIndex.get(emailKey)
        if (!cur || (cur.userId.startsWith('csv-') && !isCsv)) {
          emailIndex.set(emailKey, { userId, displayName, role: (d.role as UserRole) ?? 'sale' })
        }
      }

      const nick = String(d.nickname ?? '').trim().toLowerCase()
      registerName(nick, userId, displayName, 3)
      registerName(firstToken(String(d.displayNameEN ?? '')), userId, displayName, 2)
      registerName(firstToken(String(d.displayName ?? '')), userId, displayName, 1)
    }

    // ── Resolve each parsed row ────────────────────────────────────────────────
    const resolved: ResolvedRow[] = []
    const unmatched: string[] = []
    for (const row of parsedRows) {
      const nameKey = row.subjectName.trim().toLowerCase()
      const hit = nameIndex.get(nameKey) ?? nameIndex.get(firstToken(row.subjectName))
      if (!hit) {
        if (!unmatched.includes(row.subjectName)) unmatched.push(row.subjectName)
        continue
      }
      const assessor = emailIndex.get(row.assessorEmail)
      // Deterministic id from the form-submission timestamp + subject so a
      // re-import updates the same doc instead of duplicating.
      const docId = row.takenAt
        ? `csv-rp-${slug(row.takenAt)}-${hit.userId}`
        : `csv-rp-${hit.userId}-${row.type}-${row.round}`
      resolved.push({
        ...row,
        docId,
        subjectUid: hit.userId,
        subjectDisplayName: hit.displayName,
        assessorUid: assessor?.userId ?? 'csv-assessor',
        assessorName: assessor?.displayName ?? (row.assessorEmail.split('@')[0] || 'ผู้ประเมิน'),
        assessorRole: assessor?.role ?? 'team_lead',
      })
    }

    // ── Diff against existing docs ─────────────────────────────────────────────
    if (resolved.length > 0) {
      const refs = resolved.map((r) => db.collection('roleplayAssessments').doc(r.docId))
      const snaps = await db.getAll(...refs)
      snaps.forEach((snap, i) => { resolved[i].existing = snap.exists })
    }

    const fresh = resolved.filter((r) => !r.existing)
    const duplicates = resolved.filter((r) => r.existing)

    const summarize = (r: ResolvedRow) => ({
      subjectName: r.subjectDisplayName,
      rawName: r.subjectName,
      assessorName: r.assessorName,
      round: r.round,
      type: r.type,
      takenAt: r.takenAt,
    })

    if (mode === 'check') {
      return NextResponse.json({
        newRows: fresh.map(summarize),
        duplicates: duplicates.map(summarize),
        unmatched,
        skipped,
        errors: allErrors,
      })
    }

    // ── Commit ─────────────────────────────────────────────────────────────────
    const toWrite = strategy === 'overwrite' ? [...fresh, ...duplicates] : fresh
    const skippedDup = strategy === 'overwrite' ? 0 : duplicates.length
    const batchId = db.collection('csvImports').doc().id

    const batch = db.batch()
    for (const r of toWrite) {
      const createdAt = r.takenAt && !isNaN(new Date(r.takenAt).getTime())
        ? Timestamp.fromDate(new Date(r.takenAt))
        : Timestamp.now()
      batch.set(db.collection('roleplayAssessments').doc(r.docId), {
        id: r.docId,
        createdAt,
        assessorUid: r.assessorUid,
        assessorName: r.assessorName,
        assessorRole: r.assessorRole,
        subjectUid: r.subjectUid,
        subjectName: r.subjectDisplayName,
        subjectTeam: r.team,
        round: r.round,
        type: r.type,
        overallNote: r.overallNote,
        topics: r.ratings.map((t) => ({ key: t.key, rating: t.rating, comment: '' })),
        source: 'csv_import',
        importBatchId: batchId,
      }, { merge: true })
    }
    await batch.commit()

    await db.collection('csvImports').doc(batchId).set({
      id: batchId,
      type: 'roleplay',
      fileName: file.name,
      totalRows: parsedRows.length,
      successRows: toWrite.length,
      skippedRows: skippedDup + skipped.length,
      failedRows: unmatched.length + errors.length,
      errors: allErrors,
      importedAt: Timestamp.now(),
    })

    return NextResponse.json({
      batchId,
      written: toWrite.length,
      skipped: skippedDup,
      skippedTest: skipped.length,
      unmatched,
      errors: allErrors,
    })
  } catch (e) {
    console.error('POST /api/csv/roleplay', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
