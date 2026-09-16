import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, initializeFirestore, type Firestore } from 'firebase-admin/firestore'

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey,
    }),
  })
}

let adminAuth: Auth | null = null
let adminDb: Firestore | null = null

export function getAdminAuth(): Auth {
  if (!adminAuth) adminAuth = getAuth(getAdminApp())
  return adminAuth
}

// preferRest is load-bearing, not a tuning knob. The Admin SDK's default gRPC
// transport hangs on Vercel's serverless runtime: the call reaches Firestore
// and succeeds, but the promise never settles, so the function burns its whole
// time budget and returns 504. It broke login outright — POST /api/users does
// a single userRef.get() on every sign-in — and every other Admin-SDK route
// here had the same fault waiting.
//
// Set once at initialization because it can only be set before the first
// Firestore call; initializeFirestore throws if the instance already exists,
// which the getApps() reuse above prevents.
export function getAdminFirestore(): Firestore {
  if (adminDb) return adminDb
  const app = getAdminApp()
  try {
    adminDb = initializeFirestore(app, { preferRest: true })
  } catch {
    // Already initialized for this app — happens when a dev-server hot reload
    // swaps this module while the underlying app instance survives. The
    // existing instance already carries the setting from the first call.
    adminDb = getFirestore(app)
  }
  return adminDb
}
