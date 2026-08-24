import { NextRequest, NextResponse } from 'next/server'
import type { DocumentData } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'

type DocEntry = { id: string; data: DocumentData }

// POST /api/users/dedup
// Finds all user docs that share an email with another doc and merges them
// into a single canonical doc (csv-{employeeId}), deleting duplicates.
export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const db = getAdminFirestore()
    const snap = await db.collection('users').get()

    // Group docs by email
    const byEmail: Record<string, DocEntry[]> = {}
    snap.forEach(doc => {
      const email = String(doc.data().email ?? '').toLowerCase()
      if (!email) return
      if (!byEmail[email]) byEmail[email] = []
      byEmail[email].push({ id: doc.id, data: doc.data() })
    })

    let mergedCount = 0
    let deletedCount = 0
    // Maps old UID → canonical UID so the client can migrate localStorage patches
    const uidMap: Record<string, string> = {}

    for (const docs of Object.values(byEmail)) {
      if (docs.length < 2) continue

      // Pick canonical doc: prefer csv-{empId} pattern, else pick oldest by createdAt
      const empId = docs.find((d: DocEntry) => d.data.employeeId)?.data.employeeId as string | undefined
      const sorted = [...docs].sort((a: DocEntry, b: DocEntry) => {
        const ta = (a.data.createdAt?.toMillis?.() as number) ?? 0
        const tb = (b.data.createdAt?.toMillis?.() as number) ?? 0
        return ta - tb
      })
      const canonicalId = empId ? `csv-${empId}` : sorted[0].id

      // Merge: combine fields from all docs, first non-null value wins
      const merged: Record<string, unknown> = {}
      for (const d of docs) {
        for (const [k, v] of Object.entries(d.data)) {
          if (v !== null && v !== undefined && merged[k] === undefined) merged[k] = v
        }
      }
      merged.uid = canonicalId

      const batch = db.batch()
      batch.set(db.collection('users').doc(canonicalId), merged)
      for (const d of docs) {
        if (d.id !== canonicalId) {
          uidMap[d.id] = canonicalId
          batch.delete(db.collection('users').doc(d.id))
          deletedCount++
        }
      }
      await batch.commit()
      mergedCount++
    }

    return NextResponse.json({ mergedGroups: mergedCount, deletedDocs: deletedCount, uidMap })
  } catch (e) {
    console.error('POST /api/users/dedup', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
