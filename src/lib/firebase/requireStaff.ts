// Moved: the gates now live in src/lib/server/auth.ts, which resolves the token
// to a PERSON rather than reading users/{firebaseUid}. This file stays so the
// routes' imports and the StaffGate type keep working.
export { requireStaff } from '@/lib/server/auth'
export type { Gate as StaffGate } from '@/lib/server/auth'
