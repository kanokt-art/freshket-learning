import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

const OLD_IDS = ['res-01', 'res-02', 'res-03', 'res-04', 'res-05', 'res-06']

export async function POST() {
  try {
    const db = getAdminFirestore()
    const results: { id: string; status: 'deleted' | 'not_found' }[] = []

    for (const id of OLD_IDS) {
      const ref = db.collection('resources').doc(id)
      const snap = await ref.get()
      if (snap.exists) {
        await ref.delete()
        results.push({ id, status: 'deleted' })
      } else {
        results.push({ id, status: 'not_found' })
      }
    }

    const deleted = results.filter(r => r.status === 'deleted').length
    return NextResponse.json({ success: true, deleted, results })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
