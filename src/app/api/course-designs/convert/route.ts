import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
import { newId } from '@/lib/server/dataApi'
import { convertLiveCoursesToDesigns, syncCourseDesigns } from '@/lib/server/courseDesigns'

// POST /api/course-designs/convert
//
// The one-time move to Course Designs: every course that is live but not in any Course Design gets a Course
// Design of its own, with the audience and dates it already had, so learners see no change. It then hands those
// courses over to the Course Designs (the same sync the editor runs). Running it again changes nothing.
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.response
  try {
    const store = getStore()
    const { converted } = await convertLiveCoursesToDesigns(store, gate.uid, newId)
    const { updated } = await syncCourseDesigns(store)
    return NextResponse.json({ converted, updated })
  } catch (err) {
    console.error('course-designs/convert failed', err)
    return NextResponse.json({ error: 'แปลงหลักสูตรเป็น Course Design ไม่สำเร็จ' }, { status: 500 })
  }
}
