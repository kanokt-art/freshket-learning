'use client'

import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { authedFetch } from '@/lib/api/authedFetch'
import { getDemoMode } from '@/lib/demo/demoMode'
import {
  RANGES, rowsInRange, rangeStart, trendOf, departmentStats, statusCounts, prePostAverages,
  type DashRow, type RangeId, type Grain,
} from '@/lib/courses/dashboardData'
import type { AttemptAnalytics } from '@/lib/assessment/analytics'

// A course's dashboard: who joined and when, how they scored before and after, who passed, which departments they
// come from, and — for a quiz built in the app — the questions missed most and how long people take. Read-only;
// the numbers come from the same learners and records as "สรุปผลการเรียน". Quiz attempts are read through the
// server (api/assessment/analytics), because only the server may read them.

const DEMO_MODE = getDemoMode()

// Chart colours. Two series that must be told apart (started / finished, before / after) use blue and
// green, which stay apart under colour-blind simulation; one-series charts use a single hue; the status
// colours are the reserved good / critical pair, never reused for a series. All sit on white.
const C = {
  blue: '#2a78d6',      // before the course / joined
  green: '#00a862',     // after the course / finished
  orange: '#eb6834',    // questions missed
  good: '#0ca30c',
  critical: '#d03b3b',
  neutral: '#c3c2b7',
  grid: '#e1e0d9',
  muted: '#898781',
}

const nf = new Intl.NumberFormat('th-TH')

function dayLabel(iso: string, grain: Grain): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return grain === 'month'
    ? date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
    : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  if (m >= 10) return `${m} นาที`
  return m > 0 ? `${m} นาที ${s % 60} วินาที` : `${s} วินาที`
}

export function CourseDashboard({ courseId, rows }: { courseId: string; rows: DashRow[] }) {
  const [range, setRange] = useState<RangeId>('90d')
  const scoped = useMemo(() => rowsInRange(rows, range), [rows, range])
  const trend = useMemo(() => trendOf(scoped, range), [scoped, range])
  const status = useMemo(() => statusCounts(scoped), [scoped])
  const prePost = useMemo(() => prePostAverages(scoped), [scoped])
  const depts = useMemo(() => departmentStats(scoped), [scoped])

  // Quiz attempts: the previous numbers stay (dimmed) while a new range loads.
  const [quiz, setQuiz] = useState<AttemptAnalytics | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  useEffect(() => {
    if (DEMO_MODE || !courseId) return
    let cancelled = false
    setQuizLoading(true)
    const since = rangeStart(range)
    authedFetch(`/api/assessment/analytics?courseId=${encodeURIComponent(courseId)}${since ? `&since=${encodeURIComponent(since.toISOString())}` : ''}`)
      .then(async (res) => (res.ok ? ((await res.json()) as AttemptAnalytics) : null))
      .then((data) => { if (!cancelled) setQuiz(data) })
      .catch(() => { if (!cancelled) setQuiz(null) })
      .finally(() => { if (!cancelled) setQuizLoading(false) })
    return () => { cancelled = true }
  }, [courseId, range])

  const joined = scoped.filter((r) => !!r.record && r.record.status !== 'not_started').length
  const finishedPct = joined > 0 ? Math.round((status.completed / joined) * 100) : null
  const hasQuiz = !!quiz && quiz.attempts > 0

  const trendData = trend.points.map((p) => ({ ...p, label: dayLabel(p.date, trend.grain) }))
  const grainLabel = trend.grain === 'day' ? 'รายวัน' : trend.grain === 'week' ? 'รายสัปดาห์ (เริ่มวันจันทร์)' : 'รายเดือน'
  const maxDept = Math.max(1, ...depts.map((d) => d.learners))
  const deptWithScores = depts.filter((d) => d.avgPre !== null || d.avgPost !== null)

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8 space-y-5">

      {/* Date range: one row above everything it scopes */}
      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
          <legend className="sr-only">ช่วงเวลา</legend>
          {RANGES.map((r) => (
            <label key={r.id}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all select-none ${range === r.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <input type="radio" name="dash-range" value={r.id} checked={range === r.id} onChange={() => setRange(r.id)} className="sr-only" />
              {r.label}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-gray-400">นับผู้เรียนที่เริ่มเรียนในช่วงนี้ · {nf.format(scoped.length)} คน</p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="ผู้เข้าอบรม" value={nf.format(joined)} hint={`จากผู้เรียน ${nf.format(scoped.length)} คน`} />
        <Tile label="เรียนจบ" value={finishedPct === null ? '—' : `${finishedPct}%`} hint={`${nf.format(status.completed)} คน`} />
        <Tile label="คะแนนก่อนเรียนเฉลี่ย" value={prePost.pre === null ? '—' : String(prePost.pre)} />
        <Tile label="คะแนนหลังเรียนเฉลี่ย" value={prePost.post === null ? '—' : String(prePost.post)}
          hint={prePost.delta === null ? undefined : `${prePost.delta >= 0 ? '+' : ''}${prePost.delta} เทียบก่อนเรียน (${prePost.pairs} คนที่มีครบทั้งคู่)`}
          tone={prePost.delta === null ? undefined : prePost.delta >= 0 ? 'good' : 'bad'} />
        <Tile label="เวลาทำแบบทดสอบเฉลี่ย" value={hasQuiz && quiz!.avgElapsedMs !== null ? duration(quiz!.avgElapsedMs) : '—'}
          hint={hasQuiz ? `${nf.format(quiz!.attempts)} ครั้ง · เฉลี่ย ${quiz!.avgAttemptsPerLearner ?? '—'} ครั้ง/คน` : 'เฉพาะแบบทดสอบที่สร้างในระบบ'} />
      </div>

      {/* Trend */}
      <Card title="จำนวนผู้เข้าอบรมตามช่วงเวลา" subtitle={grainLabel}
        legend={[{ label: 'เริ่มเรียน', color: C.blue }, { label: 'เรียนจบ', color: C.green }]}>
        {trendData.length === 0 ? (
          <Empty text="ยังไม่มีผู้เริ่มเรียนในช่วงเวลานี้" />
        ) : (
          <div className="h-64" role="img" aria-label="กราฟเส้นจำนวนผู้เริ่มเรียนและเรียนจบตามช่วงเวลา">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: C.grid }} tick={{ fontSize: 12, fill: C.muted }} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: C.muted }} />
                <Tooltip cursor={{ stroke: C.muted, strokeWidth: 1 }} content={<TrendTooltip />} />
                <Line type="monotone" dataKey="started" name="เริ่มเรียน" stroke={C.blue} strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: C.blue, stroke: '#fff', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="completed" name="เรียนจบ" stroke={C.green} strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: C.green, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <TableView caption="ตารางจำนวนผู้เข้าอบรม" head={['ช่วง', 'เริ่มเรียน', 'เรียนจบ']}
          body={trendData.map((p) => [p.label, String(p.started), String(p.completed)])} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pass / fail */}
        <Card title="ผ่าน / ไม่ผ่าน" subtitle={`ผู้เรียน ${nf.format(scoped.length)} คน`}>
          <StatusBar status={status} total={scoped.length} />
          {hasQuiz && (
            <p className="text-xs text-gray-500 mt-4 leading-relaxed">
              แบบทดสอบที่ทำเสร็จ {nf.format(quiz!.passed + quiz!.failed)} ครั้ง: ผ่าน {nf.format(quiz!.passed)} · ไม่ผ่าน {nf.format(quiz!.failed)}
              {quiz!.timedOut > 0 && ` · หมดเวลา ${nf.format(quiz!.timedOut)}`}
            </p>
          )}
        </Card>

        {/* Departments */}
        <Card title="ผู้เรียนแยกตามแผนก" subtitle="เรียงจากมากไปน้อย">
          {depts.length === 0 ? <Empty text="ยังไม่มีข้อมูล" /> : (
            <ul className="space-y-2.5">
              {depts.slice(0, 8).map((d) => (
                <li key={d.department} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3" title={`${d.department}: ${d.learners} คน`}>
                  <span className="text-xs text-gray-600 truncate">{d.department}</span>
                  <span className="h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(d.learners / maxDept) * 100}%`, background: C.green }} /></span>
                  <span className="text-xs font-bold text-gray-800 text-right">{nf.format(d.learners)}</span>
                </li>
              ))}
              {depts.length > 8 && <li className="text-xs text-gray-400">และอีก {depts.length - 8} แผนก (ดูในตาราง)</li>}
            </ul>
          )}
          <TableView caption="ตารางผู้เรียนแยกตามแผนก" head={['แผนก', 'ผู้เรียน', 'ก่อนเรียน', 'หลังเรียน']}
            body={depts.map((d) => [d.department, String(d.learners), d.avgPre === null ? '—' : String(d.avgPre), d.avgPost === null ? '—' : String(d.avgPost)])} />
        </Card>
      </div>

      {/* Before / after by department */}
      <Card title="คะแนนก่อน–หลังเรียนเฉลี่ย แยกตามแผนก" subtitle="เฉพาะแผนกที่มีคะแนน"
        legend={[{ label: 'ก่อนเรียน', color: C.blue }, { label: 'หลังเรียน', color: C.green }]}>
        {deptWithScores.length === 0 ? <Empty text="ยังไม่มีคะแนนก่อน/หลังเรียน" /> : (
          <ul className="space-y-3.5">
            {deptWithScores.slice(0, 8).map((d) => (
              <li key={d.department} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3">
                <span className="text-xs text-gray-600 truncate" title={d.department}>{d.department}</span>
                <div className="space-y-1.5">
                  <ScoreBar value={d.avgPre} color={C.blue} label={`${d.department} ก่อนเรียน`} />
                  <ScoreBar value={d.avgPost} color={C.green} label={`${d.department} หลังเรียน`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Missed questions: only a quiz built in the app leaves answers to read */}
      <Card title="ข้อที่ตอบผิดบ่อย"
        subtitle={hasQuiz ? (quiz!.questionBasis === 'post' ? 'จากแบบทดสอบหลังเรียน · เฉพาะข้อที่ระบบตรวจเอง' : 'จากแบบทดสอบทุกครั้ง · เฉพาะข้อที่ระบบตรวจเอง') : 'ใช้ได้กับแบบทดสอบที่สร้างในระบบเท่านั้น'}>
        <div className={quizLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {!hasQuiz ? (
            <Empty text={DEMO_MODE ? 'โหมดเดโมไม่มีข้อมูลการทำแบบทดสอบ' : 'ยังไม่มีการทำแบบทดสอบที่สร้างในระบบ (Google Form ดูข้อที่ผิดจากในระบบไม่ได้)'} />
          ) : quiz!.mostMissed.length === 0 ? (
            <Empty text="ยังไม่มีข้อที่ตอบผิด" />
          ) : (
            <ol className="space-y-3">
              {quiz!.mostMissed.map((q, i) => (
                <li key={`${q.assessmentId}:${q.questionId}`} title={`ผิด ${q.wrong} จาก ${q.answered} ครั้ง`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-gray-400 w-5 pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug line-clamp-2">{q.text}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${q.wrongRate}%`, background: C.orange }} /></span>
                        <span className="text-xs text-gray-500 shrink-0 w-40 text-right"><span className="font-bold text-gray-800">{q.wrongRate}%</span> · ผิด {q.wrong} จาก {q.answered}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {hint && (
        <p className={`text-xs mt-1 leading-snug ${tone === 'good' ? 'text-freshket-700 font-bold' : tone === 'bad' ? 'text-rose-600 font-bold' : 'text-gray-400'}`}>{hint}</p>
      )}
    </div>
  )
}

function Card({ title, subtitle, legend, children }: {
  title: string
  subtitle?: string
  legend?: { label: string; color: string }[]
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {legend && (
          <ul className="flex items-center gap-4">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-4 h-0.5 rounded-full" style={{ background: l.color }} />
                {l.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 text-center py-8">{text}</p>
}

function ScoreBar({ value, color, label }: { value: number | null; color: string; label: string }) {
  return (
    <div className="flex items-center gap-3" title={value === null ? `${label}: ยังไม่มีคะแนน` : `${label}: ${value}`}>
      <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        {value !== null && <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />}
      </span>
      <span className="text-xs font-bold text-gray-700 w-8 text-right">{value === null ? '—' : value}</span>
    </div>
  )
}

// One whole (the learners) split into four states: a tall segmented bar with a 2px gap between parts and the
// share printed inside where it fits. The legend names the parts and gives each count, with a mark as well as a
// colour so no state rests on colour alone.
function StatusBar({ status, total }: { status: { completed: number; failed: number; inProgress: number; notStarted: number }; total: number }) {
  const parts = [
    { key: 'completed', label: 'ผ่านแล้ว', n: status.completed, color: C.good, ink: '#fff', icon: 'check' },
    { key: 'failed', label: 'ไม่ผ่าน', n: status.failed, color: C.critical, ink: '#fff', icon: 'cross' },
    { key: 'inProgress', label: 'กำลังเรียน', n: status.inProgress, color: C.blue, ink: '#fff', icon: 'play' },
    { key: 'notStarted', label: 'ยังไม่เริ่ม', n: status.notStarted, color: C.neutral, ink: '#0b0b0b', icon: 'dot' },
  ] as const
  if (total === 0) return <Empty text="ยังไม่มีผู้เรียน" />
  return (
    <div>
      <div className="flex gap-0.5 h-7" role="img" aria-label={parts.map((p) => `${p.label} ${p.n} คน`).join(', ')}>
        {parts.filter((p) => p.n > 0).map((p) => {
          const pct = (p.n / total) * 100
          return (
            <div key={p.key} title={`${p.label}: ${p.n} คน (${Math.round(pct)}%)`}
              className="h-full rounded flex items-center pl-2 text-xs font-bold overflow-hidden whitespace-nowrap"
              style={{ width: `${pct}%`, background: p.color, color: p.ink }}>
              {pct >= 12 ? `${Math.round(pct)}%` : ''}
            </div>
          )
        })}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-xs text-gray-600">
            <span className="size-3.5 rounded flex items-center justify-center shrink-0" style={{ background: p.color, color: p.ink }} aria-hidden="true">
              <svg className="size-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                {p.icon === 'check' && <path d="M5 13l4 4L19 7" />}
                {p.icon === 'cross' && <path d="M6 6l12 12M18 6L6 18" />}
                {p.icon === 'play' && <path d="M8 5l11 7-11 7z" fill="currentColor" />}
                {p.icon === 'dot' && <circle cx="12" cy="12" r="2.5" fill="currentColor" />}
              </svg>
            </span>
            {p.label} <span className="font-bold text-gray-900">{nf.format(p.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-lg px-3 py-2">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-3 h-0.5 rounded-full" style={{ background: p.color }} />
          <span className="font-bold text-gray-900">{p.value}</span> {p.name}
        </p>
      ))}
    </div>
  )
}

// The same numbers as a table, for anyone who would rather read them than hover a chart.
function TableView({ caption, head, body }: { caption: string; head: string[]; body: string[][] }) {
  if (body.length === 0) return null
  return (
    <details className="mt-4 group">
      <summary className="text-xs font-bold text-gray-500 cursor-pointer select-none hover:text-gray-700">ดูเป็นตาราง</summary>
      <div className="mt-2 max-h-60 overflow-auto rounded-xl border border-gray-100">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">{head.map((h) => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {body.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} className={`px-3 py-1.5 ${j === 0 ? 'text-gray-700' : 'text-gray-600 tabular-nums'}`}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
