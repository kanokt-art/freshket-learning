'use client'

import { useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { CourseManagementTabs } from '@/components/layout/CourseManagementTabs'
import { MyCourseTabs } from '@/components/layout/MyCourseTabs'
import { MandatorySlideViewer } from '@/components/features/MandatorySlideViewer'
import { SlidePreviewArea } from '@/components/features/MandatoryPreview'
import { MandatoryArchiveRail, MandatoryMonthHeader } from '@/components/features/MandatoryArchive'
import { DEMO_MANDATORY_ITEMS, formatDate, groupByMonth, groupByYear, type MandatoryItem } from '@/lib/mandatory'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'

// Learner-facing Mandatory Reading — a read-only list of published weekly
// Product Knowledge slides, reached from the My Course tab bar. Admins author
// these under Freshket Tools → Mandatory; here users just read them.
export default function MyMandatoryPage() {
  const { user } = useAuth()
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user?.role, user?.department)
  const [viewing, setViewing] = useState<MandatoryItem | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const isSuperAdmin = user?.role === 'super_admin'

  // Only published items are visible to learners.
  const items = useMemo(
    () => DEMO_MANDATORY_ITEMS.filter((i) => i.isPublished),
    [],
  )
  const monthGroups = useMemo(() => groupByMonth(items), [items])
  const yearGroups = useMemo(() => groupByYear(monthGroups), [monthGroups])

  function jumpTo(key: string) {
    setActiveKey(key)
    document.getElementById(`mandatory-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!user) return null

  return (
    <div className="flex flex-col h-full bg-white">
      <Header title="Mandatory Reading" subtitle={`คู่มือ Product Knowledge รายสัปดาห์ · ${items.length} ฉบับ`} />
      {isSuperAdmin && <CourseManagementTabs />}
      <MyCourseTabs />

      <div className="flex-1 overflow-auto">
        {moduleLoading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !allowedModules.has('lms') ? (
          <div className="flex items-center justify-center p-6 py-20">
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center max-w-xs">
              <p className="text-sm font-bold text-gray-900 mb-1">Module ไม่ได้เปิดใช้งาน</p>
              <p className="text-xs text-gray-400 leading-relaxed">หลักสูตร ยังไม่ได้เปิดสำหรับแผนกของคุณ<br />กรุณาติดต่อ Admin</p>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-8 pt-4">
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                <p className="text-sm">ยังไม่มี Mandatory Reading</p>
              </div>
            ) : (
              <div className="flex gap-6 items-start">
                <MandatoryArchiveRail years={yearGroups} activeKey={activeKey} onJump={jumpTo} />

                <div className="flex-1 min-w-0 space-y-6">
                  {monthGroups.map((group) => (
                    <section key={group.key} id={`mandatory-${group.key}`} className="scroll-mt-4">
                      <MandatoryMonthHeader group={group} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mt-3">
                        {group.items.map((item) => (
                          <MandatoryCard key={item.id} item={item} onView={() => setViewing(item)} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {viewing && <MandatorySlideViewer item={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

// ── Card — visually matches CourseCard on the Course tab ───────────────────────
function MandatoryCard({ item, onView }: { item: MandatoryItem; onView: () => void }) {
  return (
    <button
      type="button"
      onClick={onView}
      className="flex flex-col text-left rounded-2xl bg-white border border-gray-100 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 overflow-hidden group"
    >
      <div className="p-4 pb-0">
        <SlidePreviewArea isPublished={item.isPublished} weekLabel={item.weekLabel} />
      </div>
      <div className="flex flex-col flex-1 p-4 gap-2">
        <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-freshket-600 transition-colors">{item.title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{item.description}</p>
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">{formatDate(item.publishedAt)}</span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-freshket-500 text-white text-xs font-bold group-hover:bg-freshket-600 transition-colors">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
            เปิดดู
          </span>
        </div>
      </div>
    </button>
  )
}
