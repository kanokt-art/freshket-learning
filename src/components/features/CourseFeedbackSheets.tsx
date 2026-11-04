'use client'

import { useEffect, useMemo, useState } from 'react'
import { StarsDisplay, StarsInput } from '@/components/common/Stars'
import { get, save } from '@/lib/data/collection'
import { useAllUsers, useFirestoreList } from '@/hooks/useFirestore'
import { alertError } from '@/lib/ui/alert'
import { formatPersonName } from '@/lib/users/displayName'
import { getDemoMode } from '@/lib/demo/demoMode'

// Two sheets on the course page.
//  · LearnerFeedbackSheet — the learner rates the course they finished (stars, required) and says what they
//    learned or want changed (optional). One per learner per course; saving again edits it.
//  · FeedbackReaderSheet — for a super_admin: what learners wrote about this course, and their Key Take Away.
//    Nobody else can read it (policies.ts / viewOf), so a team lead or manager never sees what a learner said
//    about a course.
// On a phone each rises from the bottom as a white card; on a wide screen it is a panel on the right.

function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <aside className="fixed inset-x-0 bottom-0 max-h-[88vh] rounded-t-3xl sm:rounded-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none z-50 w-full sm:w-[26rem] bg-white shadow-2xl flex flex-col overflow-hidden animate-sheet-up sm:animate-slide-in-right">
        <div className="sm:hidden flex justify-center pt-2.5 shrink-0"><span className="h-1 w-10 rounded-full bg-gray-200" /></div>
        <div className="flex items-start gap-2 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">{title}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  )
}

export function LearnerFeedbackSheet({ uid, courseId, courseTitle, onClose }: {
  uid: string; courseId: string; courseTitle: string; onClose: () => void
}) {
  const id = `${uid}_${courseId}`
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    get<{ rating?: number; comment?: string }>('learnerFeedback', id)
      .then((fb) => { if (!cancelled && fb) { setRating(fb.rating ?? null); setComment(fb.comment ?? '') } })
      .catch(() => { /* none yet */ })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [id])

  async function submit() {
    if (!rating) return
    setSaving(true)
    try {
      const now = new Date()
      await save('learnerFeedback', { id, uid, courseId, courseTitle, rating, comment: comment.trim(), updatedAt: now, createdAt: now })
      setSent(true)
    } catch (e) {
      void alertError('ส่ง Feedback ไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet title="Feedback หลักสูตร" subtitle={courseTitle} onClose={onClose}>
      {sent ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
          <div className="size-12 rounded-full bg-freshket-100 flex items-center justify-center">
            <svg className="size-6 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          </div>
          <p className="text-sm font-bold text-gray-900">ขอบคุณสำหรับ Feedback</p>
          <p className="text-xs text-gray-400">ทีมที่ดูแลหลักสูตรจะนำไปปรับปรุง แก้ไขได้ทุกเมื่อ</p>
          <button type="button" onClick={onClose} className="mt-2 px-4 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150">ปิด</button>
        </div>
      ) : (
        <div className="px-5 py-5 space-y-5">
          <p className="text-xs text-gray-500 leading-relaxed">ความเห็นของคุณจะเห็นเฉพาะผู้ดูแลระบบ ไม่ส่งถึงหัวหน้าของคุณ</p>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-2">ให้คะแนนหลักสูตรนี้ <span className="text-rose-500">*</span></p>
            <StarsInput value={rating} onChange={setRating} disabled={!loaded} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-2">สิ่งที่ได้เรียนรู้ / อยากให้ปรับปรุง <span className="font-normal text-gray-400">(ไม่บังคับ)</span></label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="เล่าให้ฟังได้เลย…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!rating || saving}
            className="w-full py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'กำลังส่ง…' : 'ส่ง Feedback'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

type Row = { id: string; uid?: string; name?: string; rating?: number; comment?: string; text?: string; updatedAt?: Date | string }

// Demo mode has no database: the reader opens with a few made-up learners so the sheet can be seen.
const ago = (days: number) => new Date(Date.now() - days * 86_400_000)
const DEMO_FEEDBACK: Row[] = [
  { id: 'd1', name: 'Somchai (Chai) Chandee', rating: 5, comment: 'เนื้อหาชัดเจนมาก เอาไปใช้คุยกับลูกค้าได้ทันที อยากให้มีตัวอย่างร้านจริงเพิ่ม', updatedAt: ago(1) },
  { id: 'd2', name: 'Niracha (Nira) Sudjai', rating: 4, comment: 'วิดีโอยาวไปนิดนึง แต่ส่วนสรุปสาระสำคัญช่วยได้เยอะ', updatedAt: ago(3) },
  { id: 'd3', name: 'Malee (Mali) Sriwong', rating: 3, updatedAt: ago(6) },
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

export function FeedbackReaderSheet({ courseId, courseTitle, onClose }: { courseId: string; courseTitle: string; onClose: () => void }) {
  const [tab, setTab] = useState<'feedback' | 'takeaway'>('feedback')
  const where = [{ type: 'where' as const, field: 'courseId', op: '==' as const, value: courseId }]
  // Demo mode has no database behind it: the sheet opens empty.
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
    <Sheet title="Feedback ผู้เรียน" subtitle={courseTitle} onClose={onClose}>
      <div className="px-5 pt-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-100">
          {([['feedback', `Feedback หลักสูตร ${feedback.length}`], ['takeaway', `Key Take Away ${takeaways.length}`]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-all duration-150 ${tab === id ? 'bg-white text-gray-900 font-bold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'feedback' && (
        <div className="px-5 py-4 space-y-3">
          {avg !== null && (
            <div className="rounded-2xl bg-amber-50/60 border border-amber-100 px-4 py-3 flex items-center gap-3">
              <p className="text-2xl font-black text-gray-900 tabular-nums">{avg.toFixed(1)}</p>
              <div>
                <StarsDisplay value={Math.round(avg)} />
                <p className="text-xs text-gray-400 mt-0.5">จาก {rated.length} คน</p>
              </div>
            </div>
          )}
          {feedback.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีผู้เรียนส่ง Feedback หลักสูตรนี้</p>
          ) : sortNew(feedback).map((f) => (
            <div key={f.id} className="rounded-2xl border border-gray-100 p-4 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-gray-900">{nameOf(f)}</p>
                <span className="text-xs text-gray-400">{dmy(f.updatedAt)}</span>
                {typeof f.rating === 'number' && <StarsDisplay value={f.rating} className="ml-auto" />}
              </div>
              {f.comment?.trim() && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{f.comment.trim()}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'takeaway' && (
        <div className="px-5 py-4 space-y-3">
          {takeaways.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีผู้เรียนเขียน Key Take Away ของหลักสูตรนี้</p>
          ) : sortNew(takeaways).map((t) => (
            <div key={t.id} className="rounded-2xl border border-gray-100 p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900">{nameOf(t)}</p>
                <span className="text-xs text-gray-400">{dmy(t.updatedAt)}</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{(t.text ?? '').trim() || '—'}</p>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
