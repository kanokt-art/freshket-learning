'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAllUsers, useAllTrainingRecords, useUserStats, useMyTrainingRecords, useCourses, useAnnouncements, useTeams } from '@/hooks/useFirestore'
import { useNotifications } from '@/hooks/useNotifications'
import type { NotifType } from '@/types/notification'
import { isAnnouncementVisibleTo } from '@/types/announcement'
import { canViewByLevel } from '@/lib/jobLevel'
import { statsAvgScore, type UserStats } from '@/types/stats'
import { getTeamManagerIds, getTeamLeadIds } from '@/types/user'

// Team-lead / manager home — 3-column dashboard:
//   left   → calendar + team member scores
//   center → news feed (announcements)
//   right  → notifications + continue-learning
export function TeamLeadHome() {
  const router = useRouter()
  const { user } = useAuth()
  const { data: allUsers } = useAllUsers()
  const { data: stats, loading: statsLoading } = useUserStats()
  const hasStats = !statsLoading && stats.length > 0
  // Only fall back to the whole trainingRecords collection while summaries
  // haven't been built yet.
  const { data: allRecords } = useAllTrainingRecords(!hasStats)
  const { data: myRecords } = useMyTrainingRecords(user?.uid ?? '')
  const { data: courses } = useCourses()
  const { data: announcements } = useAnnouncements()
  const { data: teams } = useTeams()
  const { items: notifications } = useNotifications(user?.uid)

  const firstName = user?.nickname ?? user?.displayName?.split(' ')[0] ?? 'คุณ'

  // Teams this lead/manager oversees — derived from the team docs' managerId /
  // teamLeadId (same source OrgBoard uses), plus any explicit visibleTeamIds and
  // their own teamId. Keeps the dashboard in step with the /manager roster.
  const members = useMemo(() => {
    if (!user) return []
    const managed = new Set<string>()
    teams.forEach((t) => { if (getTeamManagerIds(t).includes(user.uid) || getTeamLeadIds(t).includes(user.uid)) managed.add(t.id) })
    ;(user.visibleTeamIds ?? []).forEach((id) => managed.add(id))
    if (user.teamId) managed.add(user.teamId)
    // Only members at or below the viewer's level (a team_lead never sees the manager).
    return allUsers.filter((u) => u.uid !== user.uid && u.teamId && managed.has(u.teamId) && canViewByLevel(user, u))
  }, [allUsers, teams, user])

  const statsByUid = useMemo(() => {
    const m = new Map<string, UserStats>()
    for (const s of stats) m.set(s.uid, s)
    return m
  }, [stats])

  // Average completed-course score per member (0–100). Prefers the light
  // userStats summary; falls back to scanning raw records only if not built yet.
  const memberScores = useMemo(() => {
    return members
      .map((m) => {
        if (hasStats) {
          const st = statsByUid.get(m.uid)
          return { member: m, avg: st ? statsAvgScore(st) : 0, count: st?.scoredCount ?? 0 }
        }
        const scored = allRecords.filter((r) => r.userId === m.uid && r.status === 'completed' && (r.score ?? 0) > 0)
        const avg = scored.length ? scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length : 0
        return { member: m, avg, count: scored.length }
      })
      .sort((a, b) => b.avg - a.avg)
  }, [members, allRecords, hasStats, statsByUid])

  // Status of my own record per course (for the pending calc below).
  const recordStatus = useMemo(() => {
    const m: Record<string, string> = {}
    myRecords.forEach((r) => { m[r.courseId] = r.status })
    return m
  }, [myRecords])

  // Pending = published courses targeted at me (by role or direct assignment)
  // that I have NOT completed — same definition the /sale dashboard uses, so the
  // "หลักสูตรคงค้าง" card reflects real data instead of only in-progress records.
  const pending = useMemo(() => {
    if (!user) return []
    return courses
      .filter((c) =>
        c.isPublished &&
        (c.targetRoles.includes(user.role) || (c.assignedUserIds?.includes(user.uid) ?? false)) &&
        recordStatus[c.id] !== 'completed',
      )
      .map((c) => ({ course: c, status: recordStatus[c.id] }))
  }, [courses, user, recordStatus])

  // Calendar tasks = upcoming deadlines of courses assigned to me that I haven't
  // finished. (Real Google-Calendar events can be merged in here later.)
  const myDone = useMemo(() => new Set(myRecords.filter((r) => r.status === 'completed').map((r) => r.courseId)), [myRecords])
  const tasks = useMemo(() => {
    if (!user) return []
    const toDate = (d: unknown): Date | null => {
      if (!d) return null
      const dt = d instanceof Date ? d : new Date(d as string)
      return isNaN(dt.getTime()) ? null : dt
    }
    return courses
      .filter((c) => c.isPublished && !myDone.has(c.id) && (c.targetRoles.includes(user.role) || (c.assignedUserIds?.includes(user.uid) ?? false)))
      .map((c) => ({ date: toDate(c.endDate), title: c.title, courseId: c.id }))
      .filter((t): t is { date: Date; title: string; courseId: string } => t.date !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [courses, myDone, user])

  const publishedCourses = useMemo(() => courses.filter((c) => c.isPublished), [courses])
  const publishedNews = announcements.filter((a) => isAnnouncementVisibleTo(a, user?.role, user?.department))

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col">
      {/* Top bar — profile moved here (top-right, white label) */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-5 py-2.5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => router.push('/profile')}
          className="flex items-center gap-2.5 rounded-full bg-white border border-gray-200 shadow-sm pl-3.5 pr-2 py-1.5 hover:bg-gray-50 transition-colors"
        >
          <div className="text-right leading-tight">
            <p className="text-sm font-bold text-gray-900 truncate max-w-[10rem]">{user?.displayName}</p>
            <p className="text-xs text-gray-400 truncate max-w-[10rem]">{user?.position ?? user?.department ?? 'Team Lead'}</p>
          </div>
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt={user.displayName} className="size-9 rounded-full object-cover border border-freshket-200 shrink-0" />
          ) : (
            <div className="size-9 rounded-full bg-freshket-100 border border-freshket-200 flex items-center justify-center text-freshket-700 text-sm font-bold shrink-0">
              {(user?.displayName ?? '?').charAt(0)}
            </div>
          )}
        </button>
      </div>

      <div className="px-5 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">

        {/* ── LEFT ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">
          <CalendarCard tasks={tasks} onOpenTask={(id) => router.push(`/courses/${id}`)} />
          <TeamScoresCard scores={memberScores} onOpenTeam={() => router.push('/manager')} />
        </div>

        {/* ── CENTER: News feed (one card, posts split by dividers) ─── */}
        <div className="lg:col-span-6 flex flex-col gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">นิวส์ฟีด</h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M6 12h12m-9 5.25h6" />
                </svg>
                <svg className="size-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </span>
            </div>

            {publishedNews.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <p className="text-sm">ยังไม่มีข่าวสาร</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {publishedNews.map((a) => (
                  <article key={a.id} className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="size-9 rounded-full bg-freshket-100 flex items-center justify-center text-freshket-600 shrink-0">
                        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" /></svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{a.authorName ?? 'Freshket'}</p>
                        <p className="text-xs text-gray-400">{a.title}</p>
                      </div>
                    </div>
                    {a.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.imageUrl} alt={a.title} className="w-full max-h-80 object-cover rounded-xl mt-3" />
                    )}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-3">{a.body}</p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <AllCoursesCard courses={publishedCourses} onOpen={(id) => router.push(`/courses/${id}`)} />
        </div>

        {/* ── RIGHT: notifications + continue learning ─────────── */}
        <div className="lg:col-span-3 space-y-5">
          <NotificationsCard notifications={notifications} onOpen={(p) => p && p !== '/' && router.push(p)} />
          <ContinueLearningCard items={pending} onOpen={(id) => router.push(`/courses/${id}`)} greeting={firstName} />
        </div>
      </div>
    </div>
  )
}

// ── Calendar (UI only — Google Calendar can be wired in later) ────────────────
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

type Task = { date: Date; title: string; courseId: string }

function CalendarCard({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (courseId: string) => void }) {
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

// ── All available courses ─────────────────────────────────────────────────────
function AllCoursesCard({ courses, onOpen }: {
  courses: { id: string; title: string; description?: string; thumbnailUrl?: string; category?: string }[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col lg:flex-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">หลักสูตรทั้งหมด</h3>
        <span className="text-xs text-gray-400">{courses.length} หลักสูตร</span>
      </div>
      {courses.length === 0 ? (
        <p className="text-xs text-gray-400 py-6 text-center">ยังไม่มีหลักสูตรที่เผยแพร่</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          {courses.map((c) => (
            <button key={c.id} type="button" onClick={() => onOpen(c.id)}
              className="flex items-center gap-3 rounded-xl border border-gray-100 p-2.5 text-left hover:bg-gray-50 hover:border-gray-200 transition-colors">
              <div className="size-12 rounded-lg bg-gradient-to-br from-freshket-200 to-emerald-100 shrink-0 overflow-hidden flex items-center justify-center">
                {c.thumbnailUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.thumbnailUrl} alt={c.title} className="size-full object-cover" />
                  : <svg className="size-6 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-800 truncate">{c.title}</p>
                {c.description && <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{c.description}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Team member scores ────────────────────────────────────────────────────────
function scoreColor(s: number) { return s >= 80 ? 'text-freshket-600' : s >= 60 ? 'text-amber-600' : 'text-rose-600' }
function scoreBar(s: number) { return s >= 80 ? '#00ce7c' : s >= 60 ? '#fbbf24' : '#f87171' }

// Display name as "Firstname (Nickname) Lastname". Prefers the English full name
// (displayNameEN); falls back to the Thai displayName, then the nickname alone.
function formatFullName(u: { displayName: string; displayNameEN?: string; nickname?: string }): string {
  const full = (u.displayNameEN || u.displayName || '').trim()
  if (!full) return u.nickname || '—'
  const parts = full.split(/\s+/)
  const first = parts[0]
  const last = parts.slice(1).join(' ')
  if (!u.nickname) return full
  return last ? `${first} (${u.nickname}) ${last}` : `${first} (${u.nickname})`
}

function TeamScoresCard({ scores, onOpenTeam }: {
  scores: { member: { uid: string; displayName: string; displayNameEN?: string; nickname?: string; photoURL?: string | null }; avg: number; count: number }[]
  onOpenTeam: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900">คะแนนทีม</h3>
        <button onClick={onOpenTeam} className="text-xs font-bold text-freshket-600 hover:text-freshket-700">ดูทั้งหมด</button>
      </div>
      {scores.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">ยังไม่มีสมาชิกในทีม</p>
      ) : (
        <div className="space-y-3">
          {scores.slice(0, 6).map(({ member, avg, count }) => (
            <div key={member.uid} className="flex items-center gap-2.5">
              <div className="size-7 rounded-full bg-freshket-100 flex items-center justify-center text-freshket-700 text-xs font-bold shrink-0">
                {(member.nickname || member.displayName).charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-800 truncate">{formatFullName(member)}</p>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                  <div className="h-full rounded-full" style={{ width: `${avg}%`, background: scoreBar(avg) }} />
                </div>
              </div>
              <span className={`text-xs font-black tabular-nums shrink-0 ${count ? scoreColor(avg) : 'text-gray-300'}`}>
                {count ? Math.round(avg) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Notifications (labels) ────────────────────────────────────────────────────
const NOTIF_LABEL: Record<NotifType, { text: string; cls: string }> = {
  shadow_pending_ack:  { text: 'รอประเมิน', cls: 'bg-orange-100 text-orange-600' },
  shadow_ack_received: { text: 'รับรองแล้ว', cls: 'bg-freshket-100 text-freshket-700' },
  new_course:          { text: 'คอร์สใหม่', cls: 'bg-blue-100 text-blue-600' },
  heart_received:      { text: 'ได้รับใจ', cls: 'bg-rose-100 text-rose-600' },
}

function NotificationsCard({ notifications, onOpen }: {
  notifications: { id: string; type: NotifType; title: string; body: string; read: boolean; refPath: string }[]
  onOpen: (refPath: string) => void
}) {
  const unread = notifications.filter((n) => !n.read).length
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-bold text-gray-900">การแจ้งเตือน</h3>
        {unread > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-freshket-500 text-white text-xs font-bold tabular-nums">{unread}</span>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">ไม่มีการแจ้งเตือน</p>
      ) : (
        <div className="space-y-2">
          {notifications.slice(0, 6).map((n) => {
            const label = NOTIF_LABEL[n.type] ?? { text: 'ข่าว', cls: 'bg-gray-100 text-gray-500' }
            return (
              <button key={n.id} type="button" onClick={() => onOpen(n.refPath)}
                className="w-full text-left flex items-start gap-2 rounded-xl p-2 hover:bg-gray-50 transition-colors">
                <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${label.cls}`}>{label.text}</span>
                <span className={`text-xs flex-1 min-w-0 truncate ${n.read ? 'text-gray-400' : 'text-gray-700 font-bold'}`}>{n.title}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Continue learning ─────────────────────────────────────────────────────────
function ContinueLearningCard({ items, onOpen, greeting }: {
  items: { course: { id: string; title: string; thumbnailUrl?: string }; status?: string }[]
  onOpen: (courseId: string) => void
  greeting: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-3">เรียนรู้ต่อ</h3>
      {items.length === 0 ? (
        <div className="py-6 text-center">
          <div className="size-12 rounded-2xl bg-freshket-50 flex items-center justify-center mx-auto mb-3">
            <svg className="size-6 text-freshket-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-gray-700">ไม่มีหลักสูตรค้าง</p>
          <p className="text-xs text-gray-400 mt-1">{greeting} เรียนจบทุกหลักสูตรแล้ว 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.slice(0, 3).map(({ course, status }) => course && (
            <button key={course.id} type="button" onClick={() => onOpen(course.id)}
              className="w-full flex items-center gap-3 rounded-xl border border-gray-100 p-2.5 text-left hover:bg-gray-50 hover:border-gray-200 transition-colors">
              <div className="size-12 rounded-lg bg-gradient-to-br from-freshket-200 to-emerald-100 shrink-0 overflow-hidden flex items-center justify-center">
                {course.thumbnailUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={course.thumbnailUrl} alt={course.title} className="size-full object-cover" />
                  : <svg className="size-6 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-800 truncate">{course.title}</p>
                <p className="text-xs text-freshket-600 font-bold mt-1">{status === 'in_progress' ? 'เรียนต่อ →' : 'เริ่มเรียน →'}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
