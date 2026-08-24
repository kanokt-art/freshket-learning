'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

// Super-admin-only sub-nav for the Course Management area (Main / Course / Role Play).
// "Course" has no page of its own — hovering reveals a dropdown to the pages that
// actually live under it (create course, assessment).
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

  return (
    <nav className="flex items-center gap-6 px-6 bg-white border-b border-gray-100">
      <Link href="/courses" className={tabCls(isMainActive)}>Main</Link>

      <div className="relative group">
        <span className={`${tabCls(isCourseActive)} cursor-default select-none`}>
          Course
          <svg className="size-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </span>

        <div className="absolute left-0 top-full pt-2 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150 ease-out z-40">
          <div className="w-44 bg-white rounded-xl border border-gray-100 shadow-lg py-1.5">
            <button type="button" onClick={openCreate} className="block w-full text-left px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
              สร้างหลักสูตรใหม่
            </button>
            <Link href="/assessment" className="block px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
              แบบทดสอบ
            </Link>
          </div>
        </div>
      </div>

      <Link href="/courses/roleplay" className={tabCls(isRoleplayActive)}>Role Play</Link>
    </nav>
  )
}
