import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

// TEMPORARY diagnostic — remove once the login hang is resolved.
//
// Times a single Admin-SDK Firestore read on the live runtime. Sign-in was
// returning 504 and the reads themselves are the suspect, but every route that
// does one sits behind an auth gate that also does one, so there was no way to
// measure the read in isolation from outside. This does exactly one read of a
// document that does not exist (cheap, no data exposed) and reports how long
// it took, with a hard timeout so the probe itself answers instead of hanging.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  const t0 = Date.now()
  const steps: Record<string, unknown> = {}

  try {
    const db = getAdminFirestore()
    steps.getInstanceMs = Date.now() - t0

    const tRead = Date.now()
    const read = db.collection('users').doc('__diag_nonexistent__').get()
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('read did not settle within 15s')), 15_000),
    )

    const snap = await Promise.race([read, timeout])
    steps.readMs = Date.now() - tRead
    steps.exists = snap.exists
    steps.totalMs = Date.now() - t0
    return NextResponse.json({ ok: true, ...steps })
  } catch (e) {
    steps.totalMs = Date.now() - t0
    steps.error = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, ...steps }, { status: 500 })
  }
}
