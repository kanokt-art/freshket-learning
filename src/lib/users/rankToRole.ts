// The role a NEW person gets from their HR rank, when the HR file is imported.
//
// Capped at `manager`. `super_admin` is never granted from a rank: it can read
// every answer key and change everything, so it is set by hand by an existing
// super_admin on the Users page rather than depending on the Rank column of a
// spreadsheet that several people can edit. (Rank JG11 and above — Head of
// Department, VP, C-Level — used to become super_admin automatically on import.)
//
// Applies to people who do not exist yet. Someone already in the system keeps the
// role they have; re-importing the file never changes it.

import type { UserRole } from '@/types/user'

export function rankToRole(rank?: string): UserRole {
  const m = rank?.match(/JG(\d+)/i)
  if (!m) return 'sale'
  const n = parseInt(m[1], 10)
  if (n >= 9) return 'manager'     // Manager / Senior Manager, and everything above
  if (n >= 7) return 'team_lead'   // Senior Supervisor / Assistant Manager
  return 'sale'                    // Officer, Staff, Contract and below
}
