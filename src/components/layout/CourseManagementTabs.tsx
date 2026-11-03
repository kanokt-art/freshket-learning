'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

// Super-admin-only nav for the Course Management area (Main / Course / Role Play).
//
// Two levels, no dropdowns (the same as the Administration nav): the top tabs are the areas; "Course"
// shows its two pages as a second row of sub tabs underneath — create a course, create an assessment —
// so both are visible and one click away. Creating a course is a window on the Main page, not a page of
// its own, so that sub tab opens it there.
export function CourseManagementTabs() {
  const pathname = usePathname()
  const router = useRouter()

  // Open the course-create modal. Fires an event for the already-on-/courses
  // case and leaves a flag for the coming-from-another-tab case, then navigates.
  function openCreate() {
    sessionStorage.setItem('fk_open_create_course', '1')
    window.dispatchEvent(new Event('fk:create-course'))
    router.push('/courses')
  }

  const isMainActive = pathname === '/courses' || (pathname.startsWith('/courses/') && !pathname.startsWith('/courses/roleplay'))
  const isRoleplayActive = pathname.startsWith('/courses/roleplay')
  const isCourseActive = pathname === '/assessment'

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-1 px-1 py-3 text-sm border-b-2 transition-colors ${
      active
        ? 'text-freshket-600 font-bold border-freshket-500'
        : 'text-gray-500 font-normal border-transparent hover:text-gray-700'
    }`

  const subCls = (active: boolean) =>
    `inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition-colors whitespace-nowrap ${
      active
        ? 'bg-freshket-100 text-freshket-700 border-freshket-200 font-bold'
        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900'
    }`

  return (
    <div className="bg-white border-b border-gray-100">
      <nav className="flex items-center gap-6 px-6">
        <Link href="/courses" className={tabCls(isMainActive)}>Main</Link>
        <Link href="/assessment" className={tabCls(isCourseActive)}>Course</Link>
        <Link href="/courses/roleplay" className={tabCls(isRoleplayActive)}>Role Play</Link>
      </nav>

      {isCourseActive && (
        <div className="flex items-center gap-2 px-6 py-2.5 border-t border-gray-100 bg-slate-50/60 overflow-x-auto">
          <button type="button" onClick={openCreate} className={subCls(false)}>สร้างหลักสูตร</button>
          <Link href="/assessment" aria-current="page" className={subCls(true)}>สร้างแบบทดสอบ</Link>
        </div>
      )}
    </div>
  )
}
