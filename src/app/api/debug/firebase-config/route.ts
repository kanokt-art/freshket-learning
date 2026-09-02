import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'

// TEMP DEBUG ROUTE — diagnoses the production "Invalid token" 401 by comparing
// the Admin SDK's project (used to verify Google ID tokens) against the
// client-side Firebase project (used to issue them). A mismatch here is the
// classic cause: tokens minted for project A always fail verifyIdToken() under
// project B's service account. No secrets are returned — only booleans/prefixes.
// DELETE this route once the mismatch is confirmed/fixed.
export async function GET() {
  const adminProjectId = process.env.FIREBASE_PROJECT_ID ?? null
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ?? null
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY ?? ''

  let adminInitError: string | null = null
  try {
    getAdminAuth()
  } catch (e) {
    adminInitError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    adminProjectId,
    clientProjectId,
    projectIdsMatch: !!adminProjectId && adminProjectId === clientProjectId,
    clientEmailPrefix: clientEmail ? clientEmail.slice(0, 8) + '…' : null,
    clientEmailLooksValid: !!clientEmail?.endsWith('.iam.gserviceaccount.com'),
    privateKeyPresent: privateKeyRaw.length > 0,
    privateKeyHasEscapedNewlines: privateKeyRaw.includes('\\n'),
    privateKeyHasRealNewlines: privateKeyRaw.includes('\n'),
    privateKeyLength: privateKeyRaw.length,
    adminInitError,
  })
}
