'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { relativeTime } from '@/lib/utils/dateFormatter'
import { formatPersonName } from '@/lib/users/displayName'
import type { TeamActivity, TeamActivityKind } from '@/lib/team/teamActivity'

// The lead's home: what the team has done lately — Key Take Aways, course scores, Shadow Visits — newest
// first, with a filter per kind. A visit the lead has not reviewed yet says so; every row opens where the
// lead reads it in full and responds.

interface Person { uid: string; displayName: string; displayNameEN?: string; nickname?: string; email?: string; photoURL?: string | null }

type Filter = 'all' | TeamActivityKind

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'takeaway', label: 'Key Take Away' },
  { id: 'score', label: 'คะแนน' },
  { id: 'shadow', label: 'Shadow Visit' },
]

const PAGE = 6

const scoreTone = (s: number) =>
  s >= 80 ? 'bg-freshket-100 text-freshket-700' : s >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'

function KindIcon({ kind }: { kind: TeamActivityKind }) {
  if (kind === 'takeaway') {
    return (
      <span className="size-6 rounded-full bg-freshket-100 text-freshket-700 flex items-center justify-center ring-2 ring-white">
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>
      </span>
    )
  }
  if (kind === 'score') {
    return (
      <span className="size-6 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center ring-2 ring-white">
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" /></svg>
      </span>
    )
  }
  return (
    <span className="size-6 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center ring-2 ring-white">
      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
    </span>
  )
}

function Avatar({ person, kind }: { person?: Person; kind: TeamActivityKind }) {
  const initial = (person?.nickname || person?.displayName || '?').charAt(0)
  return (
    <div className="relative shrink-0">
      {person?.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.photoURL} alt="" className="size-10 rounded-full object-cover border border-gray-100" />
      ) : (
        <div className="size-10 rounded-full bg-freshket-100 border border-freshket-200 flex items-center justify-center text-freshket-700 text-sm font-bold">{initial}</div>
      )}
      <span className="absolute -bottom-1 -right-1"><KindIcon kind={kind} /></span>
    </div>
  )
}

const ACTION: Record<TeamActivityKind, string> = {
  takeaway: 'เขียน Key Take Away',
  score: 'เรียนจบหลักสูตร',
  shadow: 'ส่ง Shadow Visit',
}

function Row({ item, person }: { item: TeamActivity; person?: Person }) {
  const name = person ? formatPersonName(person) : 'สมาชิกในทีม'
  return (
    <Link href={item.href} className="flex gap-3 px-5 py-3.5 hover:bg-gray-50 transition-all duration-150">
      <Avatar person={person} kind={item.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-gray-700 leading-snug min-w-0">
            <span className="font-bold text-gray-900">{name}</span>{' '}
            {item.kind === 'score' && item.failed ? 'ทำแบบทดสอบไม่ผ่าน' : ACTION[item.kind]}
          </p>
          <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{relativeTime(item.at)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 min-w-0">
          <p className="text-xs text-gray-500 truncate">{item.kind === 'shadow' ? `ร้าน ${item.title}` : item.title}</p>
          {item.kind === 'score' && item.score !== undefined && (
            <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${item.failed ? 'bg-rose-50 text-rose-600' : scoreTone(item.score)}`}>
              {Math.round(item.score)} คะแนน
            </span>
          )}
          {item.kind === 'shadow' && (
            item.reviewed
              ? <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">รีวิวแล้ว</span>
              : <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">รอรีวิว</span>
          )}
        </div>
        {item.kind === 'takeaway' && item.text && (
          <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-2 bg-slate-50 rounded-xl px-3 py-2">{item.text}</p>
        )}
      </div>
    </Link>
  )
}

export function TeamActivityCard({ items, people, loading }: {
  items: readonly TeamActivity[]
  people: readonly Person[]
  loading?: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState(PAGE)
  const byUid = useMemo(() => new Map(people.map((p) => [p.uid, p])), [people])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, takeaway: 0, score: 0, shadow: 0 }
    for (const i of items) c[i.kind]++
    return c
  }, [items])
  const waiting = useMemo(() => items.filter((i) => i.kind === 'shadow' && !i.reviewed).length, [items])
  const list = filter === 'all' ? items : items.filter((i) => i.kind === filter)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">งานจากทีม</h2>
            <p className="text-xs text-gray-400 mt-0.5">Key Take Away, คะแนน และ Shadow Visit ล่าสุดของสมาชิกในทีม</p>
          </div>
          {waiting > 0 && (
            <button
              type="button"
              onClick={() => { setFilter('shadow'); setShown(PAGE) }}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all duration-150"
            >
              <span className="size-1.5 rounded-full bg-amber-500" />
              รอคุณรีวิว {waiting} Visit
            </button>
          )}
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto -mx-1 px-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { setFilter(f.id); setShown(PAGE) }}
              aria-pressed={filter === f.id}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-all duration-150 ${
                filter === f.id
                  ? 'bg-freshket-100 text-freshket-700 border-freshket-200'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
              <span className={filter === f.id ? 'text-freshket-600' : 'text-gray-400'}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="p-10 text-center text-sm text-gray-400">กำลังโหลด…</div>
      ) : list.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm font-bold text-gray-600">ยังไม่มีความเคลื่อนไหว</p>
          <p className="text-xs text-gray-400 mt-1">เมื่อสมาชิกในทีมเขียน Key Take Away ทำแบบทดสอบ หรือส่ง Shadow Visit จะขึ้นที่นี่</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100">
            {list.slice(0, shown).map((item) => <Row key={item.id} item={item} person={byUid.get(item.uid)} />)}
          </div>
          {list.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + 10)}
              className="w-full py-3 text-sm font-bold text-freshket-700 border-t border-gray-100 hover:bg-gray-50 transition-all duration-150"
            >
              ดูเพิ่ม ({list.length - shown})
            </button>
          )}
        </>
      )}
    </div>
  )
}
