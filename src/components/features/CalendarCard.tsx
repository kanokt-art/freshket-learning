'use client'

import { useEffect, useState } from 'react'
import {
  isCalendarConnected,
  connectGoogleCalendar,
  fetchCalendarEvents,
  getStoredAccessToken,
  type CalendarEvent,
} from '@/lib/googleCalendar'

// Calendar panel backed by the signed-in user's own Google Calendar (primary
// calendar, incremental OAuth consent — see src/lib/googleCalendar.ts). Three
// granularities share one card: Day (flat event list, matches the original
// design), Month and Year (grouped by day / by month respectively) — switching
// only changes the query range and how the list is grouped, not the card
// layout. Demo mode never calls Google's API; it shows a fixed illustrative
// schedule spread across whichever granularity is active.

type ViewMode = 'day' | 'month' | 'year'

const EVENT_TEMPLATES: { title: string; tag: string; note?: string; hour: number }[] = [
  { title: 'Algebra', tag: 'QOA_SH24_BC_09_S_A', note: 'Recording', hour: 10 },
  { title: 'Geometry', tag: 'QOA_SH24_BC_08_S_A', hour: 11 },
  { title: 'Math Review Session', tag: 'QOA_SH24_BC_10_S_B', hour: 12 },
  { title: 'Calculus', tag: 'QOA_SH24_BC_04_S_A', hour: 13 },
  { title: 'Geometry', tag: 'QOA_SH24_BC_09_S_A', hour: 15 },
]
const MONTH_VIEW_DEMO_DAYS = [3, 4, 6, 10, 15]
const YEAR_VIEW_DEMO_MONTHS = [0, 2, 5, 7, 10]

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
function endOfDay(d: Date) { const r = new Date(d); r.setHours(23, 59, 59, 999); return r }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }
function startOfYear(d: Date) { return new Date(d.getFullYear(), 0, 1) }
function endOfYear(d: Date) { return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999) }

function rangeFor(mode: ViewMode, refDate: Date): { from: Date; to: Date; maxResults: number } {
  if (mode === 'month') return { from: startOfMonth(refDate), to: endOfMonth(refDate), maxResults: 50 }
  if (mode === 'year') return { from: startOfYear(refDate), to: endOfYear(refDate), maxResults: 100 }
  return { from: startOfDay(refDate), to: endOfDay(refDate), maxResults: 20 }
}

function headingFor(mode: ViewMode, refDate: Date): string {
  if (mode === 'year') return String(refDate.getFullYear())
  if (mode === 'month') return refDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const diffDays = Math.round((startOfDay(refDate).getTime() - startOfDay(new Date()).getTime()) / 86400000)
  const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : diffDays === -1 ? 'Yesterday' : refDate.toLocaleDateString('en-GB', { weekday: 'long' })
  return `${label}, ${refDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

function demoEventsFor(mode: ViewMode, refDate: Date): CalendarEvent[] {
  const build = (date: Date, hour: number, i: number): CalendarEvent => {
    const start = new Date(date); start.setHours(hour, 0, 0, 0)
    const end = new Date(start); end.setHours(hour + 1)
    const t = EVENT_TEMPLATES[i]
    return { id: `demo-${i}`, title: t.title, tag: t.tag, note: t.note, start, end, isAllDay: false }
  }
  if (mode === 'day') return EVENT_TEMPLATES.map((t, i) => build(refDate, t.hour, i))
  if (mode === 'month') {
    const lastDay = endOfMonth(refDate).getDate()
    return EVENT_TEMPLATES.map((t, i) => {
      const d = new Date(refDate.getFullYear(), refDate.getMonth(), Math.min(MONTH_VIEW_DEMO_DAYS[i], lastDay))
      return build(d, t.hour, i)
    })
  }
  return EVENT_TEMPLATES.map((t, i) => build(new Date(refDate.getFullYear(), YEAR_VIEW_DEMO_MONTHS[i], 12), t.hour, i))
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface MonthGridCell { date: Date; inMonth: boolean }

// Monday-start 6-or-7-row grid covering the full month, padded with the
// trailing days of the previous/next month so every week row is complete.
function monthGridCells(refDate: Date): MonthGridCell[] {
  const year = refDate.getFullYear()
  const month = refDate.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = endOfMonth(refDate).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const cells: MonthGridCell[] = []
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, i - firstWeekday + 1)
    cells.push({ date, inMonth: date.getMonth() === month })
  }
  return cells
}

function MonthGrid({ refDate, events, onSelectDay }: { refDate: Date; events: CalendarEvent[]; onSelectDay: (d: Date) => void }) {
  const today = new Date()
  const eventDays = new Set(events.map((ev) => ev.start.toDateString()))
  return (
    <div className="grid grid-cols-7 gap-y-1 text-center px-1 pb-3">
      {WEEKDAY_LABELS.map((d) => (
        <div key={d} className="text-xs font-bold text-gray-400 py-1">{d}</div>
      ))}
      {monthGridCells(refDate).map(({ date, inMonth }) => {
        const isToday = date.toDateString() === today.toDateString()
        const hasEvent = eventDays.has(date.toDateString())
        return (
          <button
            key={date.toISOString()}
            type="button"
            onClick={() => onSelectDay(date)}
            className="py-0.5 flex items-center justify-center"
          >
            <span className={`size-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
              isToday ? 'bg-freshket-500 text-white'
                : hasEvent ? 'bg-freshket-100 text-freshket-700'
                : inMonth ? 'text-gray-700 hover:bg-gray-100'
                : 'text-gray-300'
            }`}>
              {date.getDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface EventGroup { key: string; label: string; date: Date; events: CalendarEvent[] }

function groupEvents(events: CalendarEvent[], mode: ViewMode): EventGroup[] | null {
  if (mode === 'day') return null
  const map = new Map<string, EventGroup>()
  for (const ev of events) {
    const key = mode === 'month' ? ev.start.toDateString() : `${ev.start.getFullYear()}-${ev.start.getMonth()}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: mode === 'month'
          ? ev.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          : ev.start.toLocaleDateString('en-GB', { month: 'long' }),
        date: ev.start,
        events: [],
      })
    }
    map.get(key)!.events.push(ev)
  }
  return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
}

function EventRow({ ev, highlight }: { ev: CalendarEvent; highlight: boolean }) {
  return (
    <a
      href={ev.htmlLink}
      target={ev.htmlLink ? '_blank' : undefined}
      rel="noopener noreferrer"
      className={`block rounded-xl px-3.5 py-3 transition-colors ${
        highlight ? 'bg-orange-500 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-800'
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold truncate">{ev.title}</p>
        {ev.tag && (
          <span className={`shrink-0 text-xs font-mono px-1.5 py-0.5 rounded ${
            highlight ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            {ev.tag}
          </span>
        )}
      </div>
      <p className={`text-xs mt-0.5 ${highlight ? 'text-white/80' : 'text-gray-400'}`}>
        {ev.isAllDay ? 'ทั้งวัน' : formatTime(ev.start)}
        {ev.note && <span> · {ev.note}</span>}
      </p>
    </a>
  )
}

const VIEW_TABS: { mode: ViewMode; label: string }[] = [
  { mode: 'day', label: 'วัน' },
  { mode: 'month', label: 'เดือน' },
  { mode: 'year', label: 'ปี' },
]

export function CalendarCard({ demoMode = false }: { demoMode?: boolean }) {
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [refDate, setRefDate] = useState(() => new Date())
  // On localhost the real Google Calendar OAuth/API almost never works —
  // the authorized redirect URI and the "Google Calendar API" enablement in
  // Cloud Console are both set up for the production domain only — so local
  // dev previews the mock schedule regardless of the Demo/Live toggle. This
  // is the only practical way to review the calendar's design without a real
  // connection until that setup is done. Detected in an effect (not during
  // render) so the client's first render still matches the server-rendered
  // HTML — reading window.location during render would mismatch SSR.
  const [isLocalDev, setIsLocalDev] = useState(false)
  const useMock = demoMode || isLocalDev
  const [connected, setConnected] = useState(demoMode)
  const [events, setEvents] = useState<CalendarEvent[]>(demoMode ? demoEventsFor('day', new Date()) : [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLocalDev(['localhost', '127.0.0.1'].includes(window.location.hostname))
  }, [])

  useEffect(() => {
    if (useMock) return
    setConnected(isCalendarConnected())
  }, [useMock])

  // Re-fetch (or regenerate demo data) whenever the granularity or the
  // anchor date changes, once connected — keeps changePeriod/setViewMode as
  // plain state setters instead of duplicating the fetch call at every call site.
  useEffect(() => {
    if (useMock) { setEvents(demoEventsFor(viewMode, refDate)); return }
    if (!connected) return
    const token = getStoredAccessToken()
    if (!token) { setConnected(false); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    const { from, to, maxResults } = rangeFor(viewMode, refDate)
    fetchCalendarEvents(token, from, to, maxResults)
      .then((evs) => { if (!cancelled) setEvents(evs) })
      .catch((e) => {
        if (cancelled) return
        setConnected(isCalendarConnected())
        setError(e instanceof Error ? e.message : 'โหลดปฏิทินไม่สำเร็จ')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [viewMode, refDate, connected, useMock])

  async function handleConnect() {
    if (useMock) return
    setError(null)
    setLoading(true)
    try {
      await connectGoogleCalendar()
      setConnected(true)
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(e instanceof Error ? e.message : 'เชื่อมต่อ Google Calendar ไม่สำเร็จ')
      }
      setLoading(false)
    }
  }

  function changePeriod(delta: number) {
    setRefDate((d) => {
      const next = new Date(d)
      if (viewMode === 'day') next.setDate(next.getDate() + delta)
      else if (viewMode === 'month') next.setMonth(next.getMonth() + delta)
      else next.setFullYear(next.getFullYear() + delta)
      return next
    })
  }

  const heading = headingFor(viewMode, refDate)
  const [headingMain, headingRest] = heading.includes(',') ? heading.split(',').map((s) => s.trim()) : [heading, null]
  const groups = groupEvents(events, viewMode)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h3 className="text-base font-bold text-gray-900">
          {headingMain}{headingRest && <span className="font-normal text-gray-500">, {headingRest}</span>}
          {isLocalDev && !demoMode && <span className="ml-2 text-xs font-normal text-gray-400">(ตัวอย่าง)</span>}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => changePeriod(-1)} title="ก่อนหน้า"
            className="size-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <button type="button" onClick={() => changePeriod(1)} title="ถัดไป"
            className="size-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 pb-3">
        {VIEW_TABS.map((t) => (
          <button
            key={t.mode}
            type="button"
            onClick={() => setViewMode(t.mode)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
              viewMode === t.mode ? 'bg-freshket-100 text-freshket-700' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-3 pb-3 flex-1">
        {!connected && !useMock ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
            <p className="text-xs text-gray-400 mb-3">เชื่อมต่อ Google Calendar เพื่อดูนัดหมาย</p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-xs font-bold transition-colors disabled:opacity-60"
            >
              {loading ? 'กำลังเชื่อมต่อ...' : 'เชื่อมต่อ Google Calendar'}
            </button>
            {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-4 text-center">
            <p className="text-xs text-rose-600 mb-2">{error}</p>
            <button type="button" onClick={handleConnect} className="text-xs font-bold text-rose-700 underline">
              ลองเชื่อมต่อใหม่
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-2 px-2 py-1">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />)}
          </div>
        ) : (
          <>
            {viewMode === 'month' && (
              <MonthGrid refDate={refDate} events={events} onSelectDay={(d) => { setViewMode('day'); setRefDate(d) }} />
            )}
            {events.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-gray-400">ไม่มีนัดหมาย</p>
              </div>
            ) : viewMode === 'day' ? (
              <div className="space-y-2">
                {events.map((ev, i) => <EventRow key={ev.id} ev={ev} highlight={i === 1} />)}
              </div>
            ) : viewMode === 'month' ? (
              <div className="rounded-xl border border-gray-100 p-3">
                <p className="text-xs font-bold text-gray-500 mb-2.5">กิจกรรมในเดือนนี้</p>
                {/* Capped to roughly 3 rows tall — a busy month scrolls inside this
                    box instead of pushing the whole dashboard column down. */}
                <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {groups!.map((g) => (
                    <div key={g.key}>
                      <p className="text-xs font-bold text-gray-400 px-1 mb-1.5">{g.label}</p>
                      <div className="space-y-2">
                        {g.events.map((ev) => <EventRow key={ev.id} ev={ev} highlight={false} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {groups!.map((g) => (
                  <div key={g.key}>
                    <p className="text-xs font-bold text-gray-400 px-1 mb-1.5">{g.label}</p>
                    <div className="space-y-2">
                      {g.events.map((ev) => <EventRow key={ev.id} ev={ev} highlight={false} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
