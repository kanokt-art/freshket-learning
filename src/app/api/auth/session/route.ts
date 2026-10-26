import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/auth'

// POST /api/auth/session — "who am I?", called once after Google sign-in.
//
// This is where a login becomes a person (see src/lib/server/identity.ts): an
// existing HR row with the same email is claimed, or a brand-new colleague gets
// a row. The browser never looks up users/{firebaseUid} itself any more — that
// key is no longer what people are filed under.
//
// Returns the person's profile. The Firebase uid they sign in with is NOT in it.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const gate = await authenticate(req)
  if (!gate.ok) return gate.response

  const { authUid, ...profile } = gate.person
  void authUid
  return NextResponse.json({ user: profile })
}
