import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

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

export function getAdminFirestore(): Firestore {
  if (!adminDb) adminDb = getFirestore(getAdminApp())
  return adminDb
}
