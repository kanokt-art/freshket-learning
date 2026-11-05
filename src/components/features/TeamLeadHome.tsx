'use client'

import { coursesForTeam, isInCourseTarget } from '@/lib/courses/audience'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAllUsers, useAllTrainingRecords, useUserStats, useMyTrainingRecords, useCourses, useAnnouncements, useTeams } from '@/hooks/useFirestore'
import { relativeTime } from '@/lib/utils/dateFormatter'
import { managedMembers } from '@/lib/users/managedMembers'
import { statsAvgScore, type UserStats } from '@/types/stats'
import { useTeamActivity } from '@/hooks/useTeamActivity'
import { TeamActivityCard } from '@/components/features/TeamActivityCard'
import { HomeHighlightsRow } from '@/components/features/HomeHighlights'
import { useHomeHighlights } from '@/hooks/useHomeHighlights'
import { UserTable, UserSidePanel } from '@/components/features/MemberDirectory'
import type { UserProfile } from '@/types/user'

// Team-lead / manager home — 3-column dashboard:
//   center → Latest, team course progress, the team's member table
//   right  → the courses I still have to take, then what the team has done (take-aways, scores, Shadow Visits)
export function TeamLeadHome() {
  const router = useRouter()
  const { user } = useAuth()
  const { data: allUsers } = useAllUsers()
  const { data: stats, loading: statsLoading } = useUserStats()
  const hasStats = !statsLoading && stats.length > 0
  // Only fall back to the whole trainingRecords collection while summaries
  // haven't been built yet.
  const { data: allRecords } = useAllTrainingRecords(!hasStats)
  const { data: ownRecords } = useMyTrainingRecords(user?.uid ?? '')
  const { data: courses } = useCourses()
  // Records of a closed course are left out until it is published again.
  const myRecords = useMemo(
    () => ownRecords.filter((r) => courses.find((c) => c.id === r.courseId)?.isPublished !== false),
    [ownRecords, courses],
  )
  const { data: announcements } = useAnnouncements()
  const { data: teams } = useTeams()

  const firstName = user?.nickname ?? user?.displayName?.split(' ')[0] ?? 'คุณ'

  // Teams this lead/manager oversees — derived from the team docs' managerId /
  // teamLeadId (same source OrgBoard uses), plus any explicit visibleTeamIds and
  // their own teamId. Keeps the dashboard in step with the /manager roster.
  const members = useMemo(() => managedMembers(user, allUsers, teams), [allUsers, teams, user])

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
        isInCourseTarget(c, user) &&
        recordStatus[c.id] !== 'completed',
      )
      .map((c) => ({ course: c, status: recordStatus[c.id] }))
  }, [courses, user, recordStatus])

  // Only courses aimed at me or at the people I look after, not every course in the company.
  const publishedCourses = useMemo(() => coursesForTeam(courses, user, members), [courses, user, members])
  const highlights = useHomeHighlights(user)
  const announcementBodies = useMemo(() => new Map(announcements.map((a) => [`announcement:${a.id}`, a.body])), [announcements])
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null)

  const memberUids = useMemo(() => members.map((m) => m.uid), [members])
  const courseTitles = useMemo(() => new Map(courses.map((c) => [c.id, c.title])), [courses])
  const activity = useTeamActivity(memberUids, user?.uid ?? '', courseTitles)

  // Per course: how many of the people it is for (among my team) have finished it.
  const teamProgress = useMemo(() => {
    const finished = new Set(activity.records.filter((r) => r.status === 'completed').map((r) => `${r.userId}_${r.courseId}`))
    const m = new Map<string, { done: number; total: number }>()
    for (const c of publishedCourses) {
      const audience = members.filter((u) => isInCourseTarget(c, u))
      m.set(c.id, { done: audience.filter((u) => finished.has(`${u.uid}_${c.id}`)).length, total: audience.length })
    }
    return m
  }, [activity.records, publishedCourses, members])

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

        {/* ── CENTER: News feed (one card, posts split by dividers) ─── */}
        <div className="lg:col-span-9 flex flex-col gap-5">
          <HomeHighlightsRow uid={user?.uid ?? ''} candidates={highlights.visible} pins={highlights.pins} hidden={highlights.hidden} bodies={announcementBodies} />

          <TeamCourseProgressCard courses={publishedCourses} progress={teamProgress} onOpen={(id) => router.push(`/courses/${id}?view=report`)} />

          {/* The people I look after, shortest tenure first; every column sorts */}
          <UserTable users={members} restrict={false} onSelect={setSelectedMember} selectedUid={selectedMember?.uid} />
        </div>

        {/* ── RIGHT: continue learning ─────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">
          <ContinueLearningCard items={pending} onOpen={(id) => router.push(`/courses/${id}`)} greeting={firstName} />
          <TeamActivityCard items={activity.items} people={members} loading={activity.loading} />
        </div>
      </div>

      {selectedMember && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setSelectedMember(null)}
        >
          <UserSidePanel user={selectedMember} onClose={() => setSelectedMember(null)} />
        </div>
      )}
    </div>
  )
}

// ── Team progress per course: a row of course cards to scroll sideways ─────────
// Each card says how many of the team the course is for have finished it; a tap opens the course's
// report, where the lead sees who is where.
function TeamCourseProgressCard({ courses, progress, onOpen }: {
  courses: { id: string; title: string; description?: string; thumbnailUrl?: string; category?: string }[]
  progress: ReadonlyMap<string, { done: number; total: number }>
  onOpen: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-5">
      <div className="px-5 flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">ติดตามการเรียนของทีม</h3>
          <p className="text-xs text-gray-400 mt-0.5">แตะหลักสูตรเพื่อดูว่าน้องในทีมเรียนถึงไหนแล้ว</p>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{courses.length} หลักสูตร</span>
      </div>
      {courses.length === 0 ? (
        <p className="text-xs text-gray-400 py-6 text-center">ยังไม่มีหลักสูตรที่เผยแพร่</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-5 pb-2 scroll-px-5">
          {courses.map((c) => {
            const p = progress.get(c.id) ?? { done: 0, total: 0 }
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
            return (
              <button key={c.id} type="button" onClick={() => onOpen(c.id)}
                className="snap-start shrink-0 w-56 rounded-2xl border border-gray-100 overflow-hidden text-left hover:border-gray-200 hover:shadow-sm transition-all duration-150">
                <div className="h-28 bg-gradient-to-br from-freshket-200 to-emerald-100 flex items-center justify-center">
                  {c.thumbnailUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.thumbnailUrl} alt="" className="size-full object-cover" />
                    : <svg className="size-8 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>}
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-gray-800 line-clamp-2 min-h-[2.5rem] leading-snug">{c.title}</p>
                  {p.total > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-gray-500">เรียนจบแล้ว</span>
                        <span className="font-bold text-gray-800 tabular-nums">{p.done}/{p.total} คน</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1.5">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: '#00ce7c' }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2">ไม่มีน้องในทีมที่ต้องเรียน</p>
                  )}
                </div>
              </button>
            )
          })}
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

// ── Continue learning ─────────────────────────────────────────────────────────
function ContinueLearningCard({ items, onOpen, greeting }: {
  items: { course: { id: string; title: string; thumbnailUrl?: string }; status?: string }[]
  onOpen: (courseId: string) => void
  greeting: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900">หลักสูตรที่ต้องเรียน</h3>
        {items.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">{items.length}</span>}
      </div>
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
          {items.map(({ course, status }) => course && (
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
                <p className={`text-xs font-bold mt-1 ${status === 'failed' ? 'text-rose-600' : 'text-freshket-600'}`}>
                  {status === 'in_progress' ? 'กำลังเรียน · เรียนต่อ →' : status === 'failed' ? 'ยังไม่ผ่าน · ทำใหม่ →' : 'ยังไม่เริ่ม · เริ่มเรียน →'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
