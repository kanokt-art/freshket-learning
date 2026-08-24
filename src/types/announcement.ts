import type { UserRole } from './user'

// News-feed announcements authored by admins and shown on the team dashboard.
export interface Announcement {
  id: string
  title: string
  body: string
  imageUrl?: string
  isPublished: boolean
  /** Roles allowed to see this post. Empty/undefined = every role. */
  targetRoles?: UserRole[]
  /** Departments allowed to see this post. Empty/undefined = every department. */
  targetDepartments?: string[]
  createdAt: Date
  createdBy: string
  authorName?: string
}

// Recommended banner dimensions surfaced in the composer and used for the
// preview aspect ratio (3:1 landscape, like most LMS feed banners).
export const ANNOUNCEMENT_BANNER = {
  width: 1200,
  height: 400,
  ratioClass: 'aspect-[3/1]',
  hint: 'แนะนำ 1200 × 400 px (อัตราส่วน 3:1) · JPG หรือ PNG',
}

// A post reaches a reader when it's published AND matches both audience gates.
// An empty (or missing) target list means "everyone" for that dimension.
export function isAnnouncementVisibleTo(
  a: Announcement,
  role?: UserRole,
  department?: string | null,
): boolean {
  if (!a.isPublished) return false
  if (a.targetRoles && a.targetRoles.length > 0) {
    if (!role || !a.targetRoles.includes(role)) return false
  }
  if (a.targetDepartments && a.targetDepartments.length > 0) {
    if (!department || !a.targetDepartments.includes(department)) return false
  }
  return true
}
