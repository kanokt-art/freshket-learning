import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { parseEmployeeCSV, parseTrainingResultCSV } from '@/lib/utils/csvParser'
import type { CSVImportError } from '@/types/tracking'

type ImportType = 'employees' | 'training_results'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as ImportType | null

    if (!file || !type) {
      return NextResponse.json({ error: 'Missing file or type' }, { status: 400 })
    }

    if (!['employees', 'training_results'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const batchId = db.collection('csvImports').doc().id
    const now = Timestamp.now()

    let successRows = 0
    let failedRows = 0
    let allErrors: CSVImportError[] = []
    const totalRows: number[] = []

    if (type === 'employees') {
      const { data, errors } = await parseEmployeeCSV(file)
      allErrors = errors
      totalRows.push(data.length + errors.filter((e) => e.row > 0).length)

      const batch = db.batch()
      for (const emp of data) {
        // Find or create user doc by email
        const snap = await db.collection('users').where('email', '==', emp.email).limit(1).get()
        if (snap.empty) {  // QuerySnapshot.empty is a property
          const ref = db.collection('users').doc()
          batch.set(ref, {
            email: emp.email,
            displayName: emp.displayName,
            role: emp.role,
            teamId: emp.teamId ?? null,
            employeeId: emp.employeeId,
            department: emp.department ?? null,
            position: emp.position ?? null,
            photoURL: null,
            createdAt: now,
            updatedAt: now,
            importBatchId: batchId,
          })
        } else {
          const ref = snap.docs[0].ref
          batch.update(ref, {
            displayName: emp.displayName,
            role: emp.role,
            teamId: emp.teamId ?? null,
            employeeId: emp.employeeId,
            department: emp.department ?? null,
            position: emp.position ?? null,
            updatedAt: now,
            importBatchId: batchId,
          })
        }
        successRows++
      }
      failedRows = errors.filter((e) => e.row > 0).length
      await batch.commit()

    } else {
      const { data, errors } = await parseTrainingResultCSV(file)
      allErrors = errors
      totalRows.push(data.length + errors.filter((e) => e.row > 0).length)

      const batch = db.batch()
      for (const result of data) {
        // Look up user by email
        const userSnap = await db.collection('users').where('email', '==', result.employeeEmail).limit(1).get()
        if (userSnap.empty) {
          allErrors.push({
            row: successRows + failedRows + 2,
            field: 'employeeEmail',
            message: `ไม่พบผู้ใช้อีเมล ${result.employeeEmail}`,
            rawValue: result.employeeEmail,
          })
          failedRows++
          continue
        }

        const userId = userSnap.docs[0].id
        const ref = db.collection('trainingRecords').doc(`${userId}_${result.courseId}`)
        batch.set(ref, {
          userId,
          courseId: result.courseId,
          courseTitle: result.courseTitle,
          status: result.status,
          score: result.score ?? null,
          completedAt: result.completedAt ? Timestamp.fromDate(new Date(result.completedAt)) : null,
          attemptCount: 1,
          source: 'csv_import',
          importBatchId: batchId,
          updatedAt: now,
        }, { merge: true })
        successRows++
      }
      failedRows += errors.filter((e) => e.row > 0).length
      await batch.commit()
    }

    // Save import log
    await db.collection('csvImports').doc(batchId).set({
      id: batchId,
      type,
      fileName: file.name,
      totalRows: totalRows[0] ?? successRows + failedRows,
      successRows,
      failedRows,
      errors: allErrors,
      importedAt: now,
    })

    return NextResponse.json({ batchId, successRows, failedRows, errors: allErrors })
  } catch (e) {
    console.error('POST /api/csv/import', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
