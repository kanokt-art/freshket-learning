'use client'

import { useAuth } from '@/hooks/useAuth'
import { useHomeHighlights } from '@/hooks/useHomeHighlights'
import { Header } from '@/components/layout/Header'
import { AdministrationTabs } from '@/components/layout/AdministrationTabs'
import { HomeHighlightsAdmin } from '@/components/features/HomeHighlights'
import { getDemoMode } from '@/lib/demo/demoMode'

// System → Spotlight: what the learner home's "Latest" row shows. Every course, tool, Mandatory and news
// post appears here as soon as it is created; the super_admin spotlights the ones to feature in each tab.
export default function SpotlightAdminPage() {
  const { user } = useAuth()
  const highlights = useHomeHighlights(user)

  if (user && user.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <p className="text-sm text-gray-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Spotlight หน้าแรก" subtitle="เลือกสิ่งที่จะแสดงในแถว Latest ของหน้าแรกพนักงาน" />
      <AdministrationTabs />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {getDemoMode() && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              Demo Mode: Spotlight เก็บไว้ในเบราว์เซอร์นี้เท่านั้น และหลักสูตร/เครื่องมือที่สร้างใหม่ในโหมดนี้ไม่ได้บันทึกจริง จึงไม่ขึ้นในรายการ
            </p>
          )}
          <HomeHighlightsAdmin
            all={highlights.all}
            pinnedKeys={highlights.pinnedKeys}
            hiddenKeys={highlights.hiddenKeys}
            onToggle={highlights.setPinned}
            onHide={highlights.setHidden}
          />
        </div>
      </div>
    </div>
  )
}
