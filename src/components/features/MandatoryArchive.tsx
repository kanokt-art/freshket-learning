'use client'

import { useState } from 'react'
import type { MonthGroup, YearGroup } from '@/lib/mandatory'

// Side rail + month header for the Mandatory Reading archive. Weekly content
// accumulates forever, so the rail is the jump nav (year → month → count) and
// the sticky month header keeps the reader oriented while scrolling.

export function MandatoryArchiveRail({
  years,
  activeKey,
  onJump,
}: {
  years: YearGroup[]
  activeKey: string | null
  onJump: (key: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(
    // Past years start collapsed — only the newest year is open.
    () => new Set(years.slice(1).map(y => y.year)),
  )

  function toggle(year: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  if (years.length === 0) return null

  return (
    <nav className="hidden lg:block w-52 shrink-0">
      <div className="sticky top-0 card-ds p-3">
        <p className="text-xs font-bold text-gray-400 px-2 pb-2">คลังย้อนหลัง</p>
        <div className="space-y-1">
          {years.map(y => {
            const isCollapsed = collapsed.has(y.year)
            return (
              <div key={y.year}>
                <button
                  type="button"
                  onClick={() => toggle(y.year)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-bold text-gray-900 hover:bg-gray-50 transition-colors"
                >
                  <svg
                    className={`size-3.5 text-gray-400 transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  {y.year}
                  <span className="ml-auto text-xs font-normal text-gray-400">{y.count}</span>
                </button>

                {!isCollapsed && (
                  <div className="pl-4 space-y-0.5 mt-0.5">
                    {y.months.map(m => {
                      const isActive = m.key === activeKey
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => onJump(m.key)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-freshket-100 text-freshket-700 font-bold'
                              : 'text-gray-600 font-normal hover:bg-gray-50'
                          }`}
                        >
                          <span className="truncate">{m.label.replace(` ${m.year}`, '')}</span>
                          <span className={`ml-auto text-xs font-normal ${isActive ? 'text-freshket-600' : 'text-gray-400'}`}>
                            {m.items.length}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export function MandatoryMonthHeader({ group }: { group: MonthGroup }) {
  return (
    <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-slate-50/90 backdrop-blur-sm flex items-center gap-3">
      <h2 className="text-base font-bold text-gray-900">{group.label}</h2>
      <span className="text-sm font-normal text-gray-400">{group.items.length} ฉบับ</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}
