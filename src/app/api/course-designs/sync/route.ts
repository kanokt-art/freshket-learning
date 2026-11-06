import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
import { syncCourseDesigns } from '@/lib/server/courseDesigns'

// POST /api/course-designs/sync
//
// Course Designs decide who a course is for and when it opens; the course documents carry a projection of that
// (see lib/courses/designProjection.ts) because the rest of the app reads it there. The editor calls this after it
// saves, publishes, hides or deletes a Course Design, and it can be called again at any time: it only rewrites
// the courses whose projection no longer matches.
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.response
  try {
    const { updated } = await syncCourseDesigns(getStore())
    return NextResponse.json({ updated })
  } catch (err) {
    console.error('course-designs/sync failed', err)
    return NextResponse.json({ error: 'ซิงก์ Course Design ไม่สำเร็จ' }, { status: 500 })
  }
}
