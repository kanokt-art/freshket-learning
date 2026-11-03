'use client'

import { useMemo, useState } from 'react'
import { saveRoleplayAssessment } from '@/hooks/useFirestore'
import { alertError } from '@/lib/ui/alert'
import {
  RATING_MAX, buildRoleplayAssessment, firstIncomplete, missingInGroup, nextRound, roleplayGroups,
} from '@/lib/roleplay/assessForm'
import type { RoleplayAssessment } from '@/types/roleplay'
import type { UserRole } from '@/types/user'

// The Role Play assessor form, opened from a member's profile (Radar Chart tab). A card with one tab per
// category: a rating for every topic of it (required) and one comment for the category (optional). It
// saves when every topic has a rating.

const dotCls = (n: number, value: number) =>
  n <= value
    ? n <= 3 ? 'bg-rose-400 text-white' : n <= 6 ? 'bg-amber-400 text-white' : 'bg-freshket-500 text-white'
    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'

export function RoleplayAssessCard({ subject, assessor, existing, onClose, onSaved }: {
  subject: { uid: string; name: string; team: string }
  assessor: { uid: string; name: string; role: UserRole }
  /** The member's earlier assessments, for numbering the round. */
  existing: readonly RoleplayAssessment[]
  onClose: () => void
  onSaved: () => void
}) {
  const groups = useMemo(() => roleplayGroups(), [])
  const [type, setType] = useState<'pre' | 'post'>(existing.some((a) => a.type === 'pre') ? 'post' : 'pre')
  const [active, setActive] = useState(groups[0].name)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [groupComments, setGroupComments] = useState<Record<string, string>>({})
  const [overallNote, setOverallNote] = useState('')
  const [saving, setSaving] = useState(false)

  const round = nextRound(existing, type, subject.uid)
  const group = groups.find((g) => g.name === active) ?? groups[0]
  const index = groups.indexOf(group)
  const left = groups.reduce((n, g) => n + missingInGroup(g, ratings), 0)
  const complete = left === 0
  const isLast = index === groups.length - 1

  async function save() {
    const record = buildRoleplayAssessment({ subject, assessor, type, round, ratings, groupComments, overallNote })
    if (!record) {
      const where = firstIncomplete(groups, ratings)
      if (where) setActive(where)
      return
    }
    setSaving(true)
    try {
      await saveRoleplayAssessment({ ...record, id: '' })
      onSaved()
    } catch (e) {
      void alertError('บันทึกการประเมินไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">ประเมิน Role Play · {subject.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">ให้คะแนนทุกหัวข้อ (บังคับ) และเขียนความเห็นของแต่ละหมวดได้ตามต้องการ</p>
          </div>
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-100 shrink-0">
            {(['pre', 'post'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all duration-150 ${
                  type === t ? 'bg-white text-gray-900 font-bold shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'pre' ? 'Pre' : 'Post'}
              </button>
            ))}
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-freshket-100 text-freshket-700 border border-freshket-200 shrink-0">
            รอบที่ {round}
          </span>
          <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shrink-0">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* One tab per category */}
        <div className="flex gap-1 px-3 pt-3 overflow-x-auto" role="tablist">
          {groups.map((g) => {
            const missing = missingInGroup(g, ratings)
            const on = g.name === active
            return (
              <button
                key={g.name}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(g.name)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap rounded-t-xl border-b-2 transition-colors ${
                  on ? 'text-freshket-600 font-bold border-freshket-500' : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                {g.name}
                {missing === 0
                  ? <svg className="size-3.5 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  : <span className="text-xs tabular-nums text-gray-400">{g.topics.length - missing}/{g.topics.length}</span>}
              </button>
            )
          })}
        </div>

        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          <p className="text-xs text-gray-400">
            ให้คะแนน 1–10: <span className="text-rose-500 font-bold">1–3 ต้องพัฒนา</span> · <span className="text-amber-600 font-bold">4–6 พอใช้</span> · <span className="text-freshket-600 font-bold">7–10 ดี</span>
          </p>
          <div className="divide-y divide-gray-50">
            {group.topics.map((t) => {
              const v = ratings[t.key] ?? 0
              return (
                <div key={t.key} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800 leading-snug">{t.label}</p>
                      {t.description && <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{t.description}</p>}
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${v ? 'text-gray-700' : 'text-rose-500'}`}>{v ? `${v}/${RATING_MAX}` : 'ยังไม่ให้คะแนน'}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${t.label} ${n} คะแนน`}
                        aria-pressed={v === n}
                        onClick={() => setRatings((r) => ({ ...r, [t.key]: n }))}
                        className={`size-8 rounded-full text-xs font-bold transition-all duration-150 ${dotCls(n, v)} ${v === n ? 'ring-2 ring-offset-1 ring-gray-300' : ''}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">ความเห็นหมวด {group.name} <span className="font-normal text-gray-400">(ไม่บังคับ)</span></label>
            <textarea
              value={groupComments[group.name] ?? ''}
              onChange={(e) => setGroupComments((c) => ({ ...c, [group.name]: e.target.value }))}
              rows={3}
              placeholder="จุดแข็ง จุดที่ควรพัฒนา หรือคำแนะนำของคุณ…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
            />
          </div>

          {isLast && (
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">บันทึกโดยรวม <span className="font-normal text-gray-400">(ไม่บังคับ)</span></label>
              <textarea
                value={overallNote}
                onChange={(e) => setOverallNote(e.target.value)}
                rows={2}
                placeholder="สรุปภาพรวมการประเมิน…"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-100">
          <p className={`text-xs flex-1 ${complete ? 'text-freshket-600 font-bold' : 'text-gray-400'}`}>
            {complete ? 'ให้คะแนนครบทุกหัวข้อแล้ว' : `ยังไม่ได้ให้คะแนนอีก ${left} หัวข้อ`}
          </p>
          {index > 0 && (
            <button type="button" onClick={() => setActive(groups[index - 1].name)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all duration-150">
              ก่อนหน้า
            </button>
          )}
          {!isLast ? (
            <button type="button" onClick={() => setActive(groups[index + 1].name)}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-gray-700 transition-all duration-150">
              ถัดไป
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={!complete || saving}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกการประเมิน'}
          </button>
        </div>
      </div>
    </div>
  )
}
