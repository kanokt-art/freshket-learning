import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'

const ALLOWED_DOMAIN = 'freshket.co'

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json()

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 })
    }

    const adminAuth = getAdminAuth()
    const decoded = await adminAuth.verifyIdToken(idToken)

    if (!decoded.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return NextResponse.json({ error: 'Access denied: unauthorized domain', allowed: false }, { status: 403 })
    }

    return NextResponse.json({ allowed: true, uid: decoded.uid, email: decoded.email })
  } catch (e) {
    console.error('POST /api/auth/verify', e)
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}
