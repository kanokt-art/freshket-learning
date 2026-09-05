'use client'

// Plain month calendar driven by the learner's own course deadlines — no
// external connection. This used to call the real Google Calendar API (OAuth
// popup + googleapis.com/calendar/v3), but that requires the "Google Calendar
// API" to be enabled in the project's Google Cloud Console first, which hasn't
// happened yet — so every real user hit a dead "เชื่อมต่อ" button. Pulled the
// Google integration out entirely rather than leave a button that doesn't work
// yet; the code for it (src/lib/googleCalendar.ts) is still there if this gets
// wired back up later once that setup is done.
//
// This mirrors TeamLeadHome's local CalendarCard (same month grid + upcoming-
// deadline cards) so the two dashboards read as one design instead of two
// different calendars.

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export interface CalendarTask {
  date: Date
  title: string
  courseId: string
}

export function CalendarCard({ tasks, onOpenTask }: { tasks: CalendarTask[]; onOpenTask: (courseId: string) => void }) {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  // Which day-numbers in the current month carry a task (for the dot marker).
  const taskDays = new Set(
    tasks.filter((t) => t.date.getFullYear() === year && t.date.getMonth() === month).map((t) => t.date.getDate()),
  )
  // Upcoming tasks (today onward), soonest first — rendered as cards.
  const startOfToday = new Date(year, month, today.getDate()).getTime()
  const upcoming = tasks.filter((t) => t.date.getTime() >= startOfToday).slice(0, 4)

  const fmtTaskDate = (d: Date) => `${d.getDate()} ${TH_MONTHS[d.getMonth()].slice(0, 3)}`

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-900">{TH_MONTHS[month]} {year + 543}</p>
        <span className="text-xs text-gray-400">วันนี้ {today.getDate()}</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {TH_DOW.map((d) => <span key={d} className="text-xs font-bold text-gray-400 py-1">{d}</span>)}
        {cells.map((c, i) => {
          const isToday = c === today.getDate()
          const hasTask = c !== null && taskDays.has(c)
          return (
            <span key={i} className={`relative text-xs py-1.5 rounded-lg ${
              c === null ? '' : isToday ? 'bg-freshket-500 text-white font-bold' : 'text-gray-600 hover:bg-gray-50'
            }`}>
              {c ?? ''}
              {hasTask && (
                <span className={`absolute left-1/2 -translate-x-1/2 bottom-0.5 size-1 rounded-full ${isToday ? 'bg-white' : 'bg-freshket-500'}`} />
              )}
            </span>
          )
        })}
      </div>

      {/* Task cards */}
      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
        {upcoming.length === 0 ? (
          <p className="text-xs text-gray-400 text-center">ไม่มีกิจกรรมที่กำหนด</p>
        ) : (
          upcoming.map((t) => (
            <button key={t.courseId} type="button" onClick={() => onOpenTask(t.courseId)}
              className="w-full flex items-center gap-2.5 rounded-xl border border-gray-100 p-2 text-left hover:bg-gray-50 hover:border-gray-200 transition-colors">
              <div className="shrink-0 w-11 rounded-lg bg-freshket-50 text-freshket-700 text-center py-1">
                <p className="text-sm font-black leading-none">{t.date.getDate()}</p>
                <p className="text-xs leading-none mt-0.5">{TH_MONTHS[t.date.getMonth()].slice(0, 3)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-800 truncate">{t.title}</p>
                <p className="text-xs text-gray-400">กำหนดส่ง {fmtTaskDate(t.date)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
