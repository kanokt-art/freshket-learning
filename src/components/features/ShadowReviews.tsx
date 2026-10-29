'use client'

import { useState } from 'react'
import { StarsDisplay, StarsInput } from '@/components/common/Stars'
import { reviewerRoleLabel, slotOf, type Review, type ReviewSlot } from '@/lib/shadow/reviews'

// The reviews a Shadow visit has received, and — for a team lead or manager — the form
// to give their own. Each reviewer has one review of a visit; saving again edits it.
// Shown wherever a visit is opened (the Shadow page, a member's panel).

const dmy = (d: Date | string) => {
  const t = d instanceof Date ? d : new Date(d)
  if (isNaN(t.getTime())) return ''
  return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`
}

export function ShadowReviews({ reviews, viewerUid, viewerRole, canReview, onSave }: {
  reviews: Review[]
  viewerUid?: string
  viewerRole?: string
  /** Is the viewer a lead or above, and not the person who made the visit? */
  canReview: boolean
  onSave: (rating: number, comment: string) => Promise<void> | void
}) {
  const mySlot = slotOf(viewerRole)
  return (
    <div className="space-y-4">
      <SlotBox slot="team_lead" title="Team Lead" reviews={reviews} viewerUid={viewerUid} canReview={canReview && mySlot === 'team_lead'} onSave={onSave} />
      <SlotBox slot="manager" title="Manager" reviews={reviews} viewerUid={viewerUid} canReview={canReview && mySlot === 'manager'} onSave={onSave} />
    </div>
  )
}

// One box per role, each with its own stars and feedback: the team lead's and the
// manager's are given and shown separately. A viewer can only fill in their own box.
function SlotBox({ slot, title, reviews, viewerUid, canReview, onSave }: {
  slot: ReviewSlot
  title: string
  reviews: Review[]
  viewerUid?: string
  canReview: boolean
  onSave: (rating: number, comment: string) => Promise<void> | void
}) {
  const inBox = reviews.filter((r) => slotOf(r.reviewerRole) === slot)
  const mine = inBox.find((r) => r.reviewerUid === viewerUid)
  const [editing, setEditing] = useState(false)
  const showForm = canReview && (!mine || editing)

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-freshket-700">Feedback จาก {title}</p>

      {inBox.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 rounded-xl border border-dashed border-gray-200 p-3">ยังไม่มี feedback จาก {title}</p>
      )}

      {inBox.map((r) => {
        const isMine = r.reviewerUid === viewerUid
        if (isMine && editing) return null   // being edited below
        return (
          <div key={`${r.reviewerUid}-${String(r.reviewedAt)}`} className="rounded-xl border border-freshket-100 bg-freshket-50/50 p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{r.reviewerName || '—'}</p>
                <p className="text-xs text-gray-500">
                  {[reviewerRoleLabel(r.reviewerRole), dmy(r.reviewedAt)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <StarsDisplay value={r.rating} className="shrink-0" />
            </div>
            {r.comment && <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{r.comment}</p>}
            {isMine && canReview && (
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-bold text-freshket-600 hover:underline">
                แก้ไข
              </button>
            )}
          </div>
        )
      })}

      {showForm && (
        <ReviewForm
          initial={mine}
          onCancel={mine ? () => setEditing(false) : undefined}
          onSave={async (rating, comment) => { await onSave(rating, comment); setEditing(false) }}
        />
      )}
    </div>
  )
}

function ReviewForm({ initial, onSave, onCancel }: {
  initial?: Review
  onSave: (rating: number, comment: string) => Promise<void>
  onCancel?: () => void
}) {
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null)
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (rating == null) return
    setSaving(true)
    setError(null)
    try {
      await onSave(rating, comment.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-freshket-200 bg-white p-3 space-y-3">
      <p className="text-xs font-bold text-gray-900">{initial ? 'แก้ไข feedback ของคุณ' : 'ให้คะแนนและ feedback'}</p>
      <div>
        <p className="text-xs text-gray-600 mb-1">คะแนน <span className="text-rose-500">*</span></p>
        <StarsInput value={rating} onChange={setRating} disabled={saving} />
      </div>
      <div>
        <p className="text-xs text-gray-600 mb-1">Feedback</p>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={saving}
          placeholder="สรุปการ Shadow ครบประเด็นไหม? จุดที่ดี? สิ่งที่ควรปรับปรุง?"
          className="w-full px-3 py-2 text-sm text-gray-900 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400 resize-none"
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60">
            ยกเลิก
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={saving || rating == null}
          className="px-4 py-1.5 text-xs font-bold rounded-lg bg-freshket-500 text-white hover:bg-freshket-600 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}
