/**
 * One-off script: set role=super_admin for a given email in Firestore.
 * Uses service account from .env.local — delete this file after use.
 *
 * Usage: node scripts/set-super-admin.mjs kanok.t@freshket.co
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const email = process.argv[2]
if (!email) {
  console.error('Usage: node scripts/set-super-admin.mjs <email>')
  process.exit(1)
}

initializeApp({
  credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
})

const auth = getAuth()
const db   = getFirestore()

try {
  // 1. Get UID from Firebase Auth
  const fbUser = await auth.getUserByEmail(email)
  const { uid } = fbUser
  console.log(`✔ Found user  uid=${uid}  email=${email}`)

  // 2. Upsert Firestore document
  const ref = db.collection('users').doc(uid)
  const snap = await ref.get()

  if (snap.exists) {
    await ref.update({
      role:      'super_admin',
      updatedAt: FieldValue.serverTimestamp(),
    })
    console.log(`✔ Updated existing document → role=super_admin`)
  } else {
    // User hasn't logged in yet — create a minimal document
    await ref.set({
      uid,
      email,
      displayName: fbUser.displayName ?? email.split('@')[0],
      photoURL:    fbUser.photoURL ?? null,
      role:        'super_admin',
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
    })
    console.log(`✔ Created new document → role=super_admin`)
  }

  console.log(`\n✅ Done — ${email} is now super_admin`)
} catch (err) {
  if (err.code === 'auth/user-not-found') {
    console.error(`❌ User not found: ${email}\n   Login with Google first to create the account.`)
  } else {
    console.error('❌ Error:', err.message)
  }
  process.exit(1)
}
