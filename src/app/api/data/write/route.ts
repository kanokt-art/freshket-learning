import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/auth'
import { getStore } from '@/lib/server/store'
import { runWrite } from '@/lib/server/dataApi'
import { toResponse, readJson } from '@/lib/server/respond'

// POST /api/data/write — the browser's door to the database. All the decisions are
// in src/lib/server/dataApi.ts; this only authenticates the caller and hands
// over. The actor is the PERSON id and role from the verified token, never
// anything the request body claims.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const gate = await authenticate(req)
  if (!gate.ok) return gate.response

  const body = await readJson(req)
  if (body === null) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  try {
    return toResponse(await runWrite(getStore(), { uid: gate.uid, role: gate.role }, body))
  } catch (e) {
    console.error('/api/data/write', e)
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
