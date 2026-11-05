'use client'

import { useEffect, useMemo, useState } from 'react'
import { StarsDisplay, StarsInput } from '@/components/common/Stars'
import { Chip, FeedbackSheetFrame, SheetButton } from '@/components/features/FeedbackSheetFrame'
import { get, save } from '@/lib/data/collection'
import { useAllUsers, useFirestoreList } from '@/hooks/useFirestore'
import { alertError } from '@/lib/ui/alert'
import { formatPersonName } from '@/lib/users/displayName'
import { getDemoMode } from '@/lib/demo/demoMode'
import { keepValidTags, tagsFor } from '@/lib/courses/feedbackTags'

// Two sheets on the course page.
//  · LearnerFeedbackSheet — the learner rates the course they finished: big stars, then a few tappable
//    choices ("what did you like?"), then an optional comment, and a big Send button. One per learner per
//    course; saving again edits it.
//  · FeedbackReaderSheet — for a super_admin: what learners wrote about this course, as a timeline, and
//    their Key Take Away. Nobody else can read it (policies.ts / viewOf), so a team lead or manager never
//    sees what a learner said about a course.

export function LearnerFeedbackSheet({ uid, courseId, courseTitle, onClose, inline = false }: {
  uid: string; courseId: string; courseTitle: string; onClose: () => void
  /** In the page (a computer) instead of a card over it (a phone). */
  inline?: boolean
}) {
  const id = `${uid}_${courseId}`
  const [rating, setRating] = useState<number | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    get<{ rating?: number; comment?: string; tags?: string[] }>('learnerFeedback', id)
      .then((fb) => {
        if (cancelled || !fb) return
        setRating(fb.rating ?? null)
        setComment(fb.comment ?? '')
        setTags(Array.isArray(fb.tags) ? fb.tags : [])
      })
      .catch(() => { /* none yet */ })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [id])

  function pickRating(next: number | null) {
    setRating(next)
    setTags((t) => keepValidTags(t, next))
  }
  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  async function submit() {
    if (!rating) return
    setSaving(true)
    try {
      const now = new Date()
      await save('learnerFeedback', {
        id, uid, courseId, courseTitle, rating, tags: keepValidTags(tags, rating), comment: comment.trim(), updatedAt: now, createdAt: now,
      })
      setSent(true)
    } catch (e) {
      void alertError('ส่ง Feedback ไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  if (sent) {
    return (
      <FeedbackSheetFrame inline={inline} onClose={onClose} footer={<SheetButton onClick={onClose}>เสร็จสิ้น</SheetButton>}>
        <div className="size-16 rounded-full bg-freshket-100 flex items-center justify-center mx-auto">
          <svg className="size-8 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </div>
        <h2 className="mt-5 text-xl font-extrabold text-gray-900">ขอบคุณสำหรับ Feedback</h2>
        <p className="mt-2 text-sm text-gray-400">ทีมที่ดูแลหลักสูตรจะนำไปปรับปรุง แก้ไขได้ทุกเมื่อ</p>
      </FeedbackSheetFrame>
    )
  }

  const choices = tagsFor(rating)
  return (
    <FeedbackSheetFrame inline={inline} onClose={onClose} footer={<SheetButton onClick={submit} disabled={!rating || saving}>{saving ? 'กำลังส่ง…' : 'ส่ง Feedback'}</SheetButton>}>
      <h2 className="text-xl font-extrabold text-gray-900 leading-snug px-4">คุณคิดอย่างไรกับหลักสูตรนี้?</h2>
      <p className="mt-1.5 text-sm text-gray-400 px-4 line-clamp-2">{courseTitle}</p>

      <div className="mt-5 flex justify-center">
        <StarsInput value={rating} onChange={pickRating} disabled={!loaded} size="lg" />
      </div>

      {rating !== null && (
        <>
          <p className="mt-5 text-sm text-gray-400">{rating >= 4 ? 'ดีมากเลย คุณชอบอะไรในหลักสูตรนี้?' : 'ขอบคุณที่บอกเรา อยากให้ปรับปรุงอะไร?'}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {choices.map((t) => <Chip key={t} selected={tags.includes(t)} onClick={() => toggleTag(t)}>{t}</Chip>)}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="เล่าเพิ่มเติมได้ (ไม่บังคับ)"
            className="mt-5 w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm text-left outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400 resize-none"
          />
          <p className="mt-3 text-xs text-gray-400">เห็นเฉพาะผู้ดูแลระบบ ไม่ส่งถึงหัวหน้าของคุณ</p>
        </>
      )}
    </FeedbackSheetFrame>
  )
}

type Row = { id: string; uid?: string; name?: string; rating?: number; comment?: string; text?: string; tags?: string[]; updatedAt?: Date | string }

// Demo mode has no database: the reader opens with a few made-up learners so the sheet can be seen.
const ago = (days: number) => new Date(Date.now() - days * 86_400_000)
const DEMO_FEEDBACK: Row[] = [
  { id: 'd1', name: 'Somchai (Chai) Chandee', rating: 5, tags: ['เนื้อหาชัดเจน', 'ใช้งานได้จริง'], comment: 'เนื้อหาชัดเจนมาก เอาไปใช้คุยกับลูกค้าได้ทันที อยากให้มีตัวอย่างร้านจริงเพิ่ม', updatedAt: ago(1) },
  { id: 'd2', name: 'Niracha (Nira) Sudjai', rating: 4, tags: ['ความยาวพอดี'], comment: 'วิดีโอยาวไปนิดนึง แต่ส่วนสรุปสาระสำคัญช่วยได้เยอะ', updatedAt: ago(3) },
  { id: 'd3', name: 'Malee (Mali) Sriwong', rating: 2, tags: ['เนื้อหายาวเกินไป', 'ตัวอย่างไม่พอ'], updatedAt: ago(6) },
]
const DEMO_TAKEAWAYS: Row[] = [
  { id: 't1', name: 'Somchai (Chai) Chandee', text: 'ต้องฟัง Pain ของลูกค้าให้ครบก่อนเสนอสินค้า และสรุปให้ลูกค้ายืนยันทุกครั้ง', updatedAt: ago(1) },
  { id: 't2', name: 'Niracha (Nira) Sudjai', text: 'รู้ข้อมูลร้านล่วงหน้าทำให้คุยได้ตรงจุดขึ้น จะเตรียม Key to Win ก่อนเข้าพบทุกครั้ง', updatedAt: ago(3) },
]

const dmy = (d?: Date | string) => {
  if (!d) return ''
  const t = d instanceof Date ? d : new Date(d)
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

// The dot on the timeline: green for a good rating, amber in the middle, rose for a weak one.
const dotTone = (rating?: number) =>
  rating === undefined ? 'bg-gray-300' : rating >= 4 ? 'bg-freshket-500' : rating === 3 ? 'bg-amber-400' : 'bg-rose-400'

function Timeline({ children }: { children: React.ReactNode }) {
  return <ol className="relative ml-2.5 border-l-2 border-dashed border-gray-200 space-y-4">{children}</ol>
}

function TimelineItem({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-6">
      <span className={`absolute -left-[9px] top-5 size-4 rounded-full ring-4 ring-white ${tone}`} />
      <div className="rounded-2xl bg-gray-50 p-4 space-y-2">{children}</div>
    </li>
  )
}

export function FeedbackReaderSheet({ courseId, courseTitle, onClose }: { courseId: string; courseTitle: string; onClose: () => void }) {
  const [tab, setTab] = useState<'feedback' | 'takeaway'>('feedback')
  const where = [{ type: 'where' as const, field: 'courseId', op: '==' as const, value: courseId }]
  // Demo mode has no database behind it: the sheet opens with samples.
  const live = !getDemoMode()
  const { data: liveFeedback } = useFirestoreList<Row>('learnerFeedback', where, live)
  const { data: liveTakeaways } = useFirestoreList<Row>('takeaways', where, live)
  const feedback = live ? liveFeedback : DEMO_FEEDBACK
  const takeaways = live ? liveTakeaways : DEMO_TAKEAWAYS
  const { data: users } = useAllUsers(live, { includeAll: true })
  const nameOf = useMemo(() => {
    const m = new Map(users.map((u) => [u.uid, formatPersonName(u)] as const))
    return (row: Row) => row.name || (row.uid && m.get(row.uid)) || row.uid || '—'
  }, [users])

  const rated = feedback.filter((f) => typeof f.rating === 'number')
  const avg = rated.length > 0 ? rated.reduce((s, f) => s + (f.rating as number), 0) / rated.length : null
  const sortNew = <T extends Row>(rows: T[]) => rows.slice().sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        className="relative w-full max-h-[92vh] sm:max-h-none sm:h-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-none shadow-2xl flex flex-col overflow-hidden animate-sheet-up sm:animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2.5 shrink-0"><span className="h-1 w-10 rounded-full bg-gray-200" /></div>
        <button type="button" onClick={onClose} aria-label="ปิด" className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-all duration-150">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="px-6 pt-6 sm:pt-7 shrink-0">
          <h2 className="text-xl font-extrabold text-gray-900">Feedback ผู้เรียน</h2>
          <p className="text-sm text-gray-400 mt-0.5 truncate pr-10">{courseTitle}</p>
          <div className="mt-4 inline-flex items-center gap-1 p-1 rounded-full bg-gray-100">
            {([['feedback', `Feedback หลักสูตร ${feedback.length}`], ['takeaway', `Key Take Away ${takeaways.length}`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-all duration-150 ${tab === k ? 'bg-white text-gray-900 font-bold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'feedback' && (
            <div className="space-y-5">
              {avg !== null && (
                <div className="rounded-2xl bg-amber-50 px-4 py-4 flex items-center gap-4">
                  <p className="text-3xl font-black text-gray-900 tabular-nums">{avg.toFixed(1)}</p>
                  <div>
                    <StarsDisplay value={Math.round(avg)} />
                    <p className="text-xs text-gray-400 mt-0.5">จาก {rated.length} คน</p>
                  </div>
                </div>
              )}
              {feedback.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีผู้เรียนส่ง Feedback หลักสูตรนี้</p>
              ) : (
                <Timeline>
                  {sortNew(feedback).map((f) => (
                    <TimelineItem key={f.id} tone={dotTone(f.rating)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{nameOf(f)}</p>
                        <span className="text-xs text-gray-400">{dmy(f.updatedAt)}</span>
                        {typeof f.rating === 'number' && <StarsDisplay value={f.rating} className="ml-auto" />}
                      </div>
                      {f.tags && f.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">{f.tags.map((t) => <Chip key={t}>{t}</Chip>)}</div>
                      )}
                      {f.comment?.trim() && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{f.comment.trim()}</p>}
                    </TimelineItem>
                  ))}
                </Timeline>
              )}
            </div>
          )}

          {tab === 'takeaway' && (
            takeaways.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีผู้เรียนเขียน Key Take Away ของหลักสูตรนี้</p>
            ) : (
              <Timeline>
                {sortNew(takeaways).map((t) => (
                  <TimelineItem key={t.id} tone="bg-freshket-500">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">{nameOf(t)}</p>
                      <span className="text-xs text-gray-400">{dmy(t.updatedAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{(t.text ?? '').trim() || '—'}</p>
                  </TimelineItem>
                ))}
              </Timeline>
            )
          )}
        </div>

        <div className="shrink-0 px-6 pb-6 pt-2"><SheetButton onClick={onClose}>ปิด</SheetButton></div>
      </aside>
    </div>
  )
}
