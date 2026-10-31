import type { UserProfile } from '@/types/user'

// The HR export is the source of truth: whatever it says wins over what is on file. Within the file
// itself, one person can still appear on several lines (a rehire under a new employee id with the
// same email, the same id twice, a line for the old record and one for the new). One batch may not
// name a person twice, so each is reduced to a single row here.
//
// Which line stands: an Active line beats a non-Active one (someone who came back is working here
// now, however many old lines say Resigned); otherwise the later line, as the newest in the file.

export interface ImportRow {
  profile: UserProfile
  /** The row matched somebody already on file (updated rather than added). */
  matched: boolean
}

export interface ResolvedImport {
  valid: UserProfile[]
  updated: string[]
  duplicates: string[]
  hidden: number
  /** Active on file but absent from the export — minus anyone the export does list. */
  missing: UserProfile[]
}

const isActive = (u: Pick<UserProfile, 'employmentStatus'>) => !u.employmentStatus || u.employmentStatus === 'Active'

export function resolveImportRows(rows: ImportRow[], missing: UserProfile[]): ResolvedImport {
  const winners = new Map<string, ImportRow>()
  const duplicates: string[] = []

  for (const row of rows) {
    const uid = row.profile.uid
    const prev = winners.get(uid)
    if (!prev) { winners.set(uid, row); continue }
    const keepNew = isActive(row.profile) || !isActive(prev.profile)   // later line, unless it would replace an Active with a non-Active
    const kept = keepNew ? row : prev
    const dropped = keepNew ? prev : row
    const reason = isActive(kept.profile) !== isActive(dropped.profile) ? 'ใช้แถวที่ Active' : 'ใช้บรรทัดล่าสุด'
    duplicates.push(`${dropped.profile.displayName} (รหัส ${dropped.profile.employeeId ?? '-'} ซ้ำในไฟล์ — ${reason})`)
    winners.set(uid, kept)
  }

  const kept = Array.from(winners.values())
  return {
    valid: kept.map((r) => r.profile),
    updated: kept.filter((r) => r.matched).map((r) => r.profile.displayName),
    duplicates,
    hidden: kept.filter((r) => !isActive(r.profile)).length,
    // A person the file lists must never also be marked as having dropped out of it.
    missing: missing.filter((m) => !winners.has(m.uid)),
  }
}
