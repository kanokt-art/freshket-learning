'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FeedbackSheetFrame, SheetButton } from '@/components/features/FeedbackSheetFrame'
import { KIND_LABEL, type HighlightItem, type HighlightKind } from '@/lib/home/highlights'

// The "Latest" row on the learner's home, and the super_admin's list for pinning what it shows.

const KIND_STYLE: Record<HighlightKind, { pill: string; tile: string }> = {
  mandatory: { pill: 'bg-rose-50 text-rose-600', tile: 'bg-rose-50 text-rose-400' },
  tool: { pill: 'bg-sky-50 text-sky-600', tile: 'bg-sky-50 text-sky-400' },
  course: { pill: 'bg-freshket-100 text-freshket-700', tile: 'bg-freshket-50 text-freshket-400' },
  announcement: { pill: 'bg-amber-50 text-amber-700', tile: 'bg-amber-50 text-amber-400' },
}

const KIND_ICON: Record<HighlightKind, string> = {
  mandatory: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  tool: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085',
  course: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342',
  announcement: 'M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46',
}

const shortDate = (d: Date) => (d.getTime() > 0 ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '')

const PinGlyph = ({ className = 'size-3.5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M16 3a1 1 0 0 1 .7 1.7L15 6.4v4.2l2.7 2.7a1 1 0 0 1-.7 1.7h-4v5a1 1 0 0 1-2 0v-5H7a1 1 0 0 1-.7-1.7L9 10.6V6.4L7.3 4.7A1 1 0 0 1 8 3h8Z" /></svg>
)

function Card({ item, pinned, onOpen }: { item: HighlightItem; pinned: boolean; onOpen?: () => void }) {
  const style = KIND_STYLE[item.kind]
  const body = (
    <>
      <div className={`h-28 flex items-center justify-center ${item.imageUrl ? 'bg-gray-100' : style.tile}`}>
        {item.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.imageUrl} alt="" className="size-full object-cover" />
          : <svg className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d={KIND_ICON[item.kind]} /></svg>}
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.pill}`}>{KIND_LABEL[item.kind]}</span>
          {pinned && <span className="text-freshket-600" title="ปักหมุดโดยผู้ดูแล"><PinGlyph /></span>}
          <span className="ml-auto text-xs text-gray-400">{shortDate(item.at)}</span>
        </div>
        <p className="text-sm font-bold text-gray-900 mt-2 line-clamp-2 leading-snug min-h-[2.5rem]">{item.title}</p>
        {item.subtitle && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{item.subtitle}</p>}
      </div>
    </>
  )
  const cls = 'snap-start shrink-0 w-60 sm:w-64 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-left hover:shadow-md transition-all duration-150'
  return onOpen
    ? <button type="button" onClick={onOpen} className={cls}>{body}</button>
    : <Link href={item.href} className={cls}>{body}</Link>
}

/** The learner's row of what is new. A news post opens in a card; everything else goes to its page. */
export function HomeHighlightsRow({ items, pinnedOnly, bodies }: {
  items: readonly HighlightItem[]
  pinnedOnly: boolean
  /** A news post's text, by item key, for the card it opens in. */
  bodies?: ReadonlyMap<string, string>
}) {
  const [reading, setReading] = useState<HighlightItem | null>(null)
  if (items.length === 0) return null
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-900">Latest <span className="ml-2 text-xs font-normal text-gray-400">อัปเดตล่าสุด</span></h2>
      </div>
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-5 px-5 scroll-px-5">
        {items.map((item) => (
          <Card key={item.key} item={item} pinned={pinnedOnly} onOpen={item.kind === 'announcement' ? () => setReading(item) : undefined} />
        ))}
      </div>
      {reading && (
        <FeedbackSheetFrame onClose={() => setReading(null)} footer={<SheetButton onClick={() => setReading(null)}>ปิด</SheetButton>}>
          <div className="text-left">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${KIND_STYLE.announcement.pill}`}>{KIND_LABEL.announcement}</span>
            <h3 className="text-xl font-extrabold text-gray-900 mt-3 leading-snug">{reading.title}</h3>
            {reading.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reading.imageUrl} alt="" className="w-full rounded-xl mt-3 object-cover max-h-56" />
            )}
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mt-3">{bodies?.get(reading.key) ?? reading.subtitle}</p>
          </div>
        </FeedbackSheetFrame>
      )}
    </section>
  )
}

/** The super_admin's list: every published item, newest first, with a Pin / Pinned switch. */
export function HomeHighlightsAdmin({ all, pinnedKeys, onToggle }: {
  all: readonly HighlightItem[]
  pinnedKeys: ReadonlySet<string>
  onToggle: (key: string, on: boolean) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [shown, setShown] = useState(12)
  const pinnedCount = all.filter((i) => pinnedKeys.has(i.key)).length
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">Latest บนหน้าแรกของพนักงาน</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {pinnedCount > 0
            ? `ปักหมุดไว้ ${pinnedCount} รายการ: หน้าแรกจะแสดงเฉพาะรายการที่ปักหมุด`
            : 'ยังไม่ได้ปักหมุด: หน้าแรกจะแสดงรายการใหม่ล่าสุด 6 รายการให้อัตโนมัติ'}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-gray-500">
          <tr>
            <th className="text-left font-bold px-5 py-3">Item</th>
            <th className="text-left font-bold px-3 py-3 hidden sm:table-cell">Type</th>
            <th className="text-center font-bold px-5 py-3 w-36">Home</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {all.slice(0, shown).map((item) => {
            const on = pinnedKeys.has(item.key)
            return (
              <tr key={item.key}>
                <td className="px-5 py-3">
                  <p className="font-bold text-gray-900 line-clamp-1">{item.title}</p>
                  <p className="text-xs text-gray-400 sm:hidden">{KIND_LABEL[item.kind]}</p>
                </td>
                <td className="px-3 py-3 hidden sm:table-cell">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${KIND_STYLE[item.kind].pill}`}>{KIND_LABEL[item.kind]}</span>
                </td>
                <td className="px-5 py-3 text-center">
                  <button
                    type="button"
                    disabled={busy === item.key}
                    onClick={async () => { setBusy(item.key); try { await onToggle(item.key, !on) } finally { setBusy(null) } }}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${
                      on ? 'bg-freshket-600 text-white hover:bg-freshket-700' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <PinGlyph />
                    {on ? 'Pinned' : 'Pin'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {all.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 12)} className="w-full py-3 text-sm font-bold text-freshket-700 border-t border-gray-100 hover:bg-gray-50 transition-all duration-150">
          ดูเพิ่ม ({all.length - shown})
        </button>
      )}
    </div>
  )
}
