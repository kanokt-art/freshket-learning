import { NextRequest, NextResponse } from 'next/server'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'

// POST /api/points/adjust
// Body: { idToken, targetUserId, points, reason }
// Requires super_admin role. Writes to pointsLedger + updates userPoints total.
export async function POST(req: NextRequest) {
  try {
    const { idToken, targetUserId, points, reason } = await req.json()

    if (!idToken || !targetUserId || points === undefined || !reason?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (typeof points !== 'number' || points === 0) {
      return NextResponse.json({ error: 'points must be a non-zero number' }, { status: 400 })
    }

    // Verify caller is super_admin
    const decoded = await getAdminAuth().verifyIdToken(idToken)
    const db = getAdminFirestore()

    const callerSnap = await db.collection('users').doc(decoded.uid).get()
    if (!callerSnap.exists || callerSnap.data()?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Target user must exist
    const targetSnap = await db.collection('users').doc(targetUserId).get()
    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    const now = Timestamp.now()
    const batch = db.batch()

    // Write ledger entry
    const ledgerRef = db.collection('pointsLedger').doc()
    batch.set(ledgerRef, {
      userId:      targetUserId,
      points:      points,
      type:        'admin_adjust',
      description: reason.trim(),
      createdAt:   now,
      createdBy:   decoded.uid,
      metadata: {
        adminDisplayName: callerSnap.data()?.displayName ?? decoded.email,
      },
    })

    // Update (or create) userPoints document
    const pointsRef = db.collection('userPoints').doc(targetUserId)
    const pointsSnap = await pointsRef.get()
    if (pointsSnap.exists) {
      batch.update(pointsRef, {
        totalPoints: FieldValue.increment(points),
        lastUpdated: now,
      })
    } else {
      batch.set(pointsRef, {
        userId:      targetUserId,
        totalPoints: points,
        lastUpdated: now,
      })
    }

    await batch.commit()

    // Push notification to the target user about the point adjustment
    try {
      const notifMsg = points > 0
        ? `Admin ปรับเพิ่มคะแนน +${points} pts — ${reason.trim()}`
        : `Admin ปรับลดคะแนน ${points} pts — ${reason.trim()}`
      await db.collection('notifications').doc(targetUserId).collection('items').add({
        type: 'admin_adjust',
        title: 'การปรับคะแนนจาก Admin',
        body: notifMsg,
        refPath: '/points',
        read: false,
        createdAt: now,
      })
    } catch { /* notification failure must not block the main response */ }

    return NextResponse.json({ ok: true, ledgerId: ledgerRef.id, points })
  } catch (e) {
    console.error('POST /api/points/adjust', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
