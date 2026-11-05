'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { announce } from '@/lib/notifications/announce'
import { getDemoMode } from '@/lib/demo/demoMode'
import { alertError, alertInfo, alertSuccess, confirmAction } from '@/lib/ui/alert'
import type { ShadowRecord } from '@/types/shadow'

// "Push ไป Slack" on a Shadow Visit, for a super_admin: send the visit to the trainer × team-lead Slack group
// (tagging the sender's Team Lead) and ring the bell for the sender's manager and team leads again — for a visit
// that never went out, or to nudge a review. It asks first, and it can be sent again. The server checks the
// caller really is a super_admin; the button just is not shown to anyone else.

export function ShadowPushButton({ record, size = 'md' }: { record: Pick<ShadowRecord, 'id' | 'storeName'>; size?: 'sm' | 'md' }) {
  const { user } = useAuth()
  const [pushing, setPushing] = useState(false)
  if (user?.role !== 'super_admin') return null

  async function push(e: React.MouseEvent) {
    // On a list card the button sits inside the card that opens the visit.
    e.stopPropagation()
    e.preventDefault()
    const ok = await confirmAction({
      title: `ส่ง Shadow Visit "${record.storeName}" ไป Slack?`,
      text: 'โพสต์ลงกลุ่ม Trainer × Team Lead (แท็ก Team Lead ของผู้ส่ง) และส่งกระดิ่งถึง Manager / Team Lead ของผู้ส่งอีกครั้ง ถ้าเคยส่งแล้วจะส่งซ้ำ',
      confirmText: 'ส่ง',
    })
    if (!ok) return
    if (getDemoMode()) {
      await alertInfo('Demo Mode', 'โหมด Demo ไม่ส่งไป Slack จริง')
      return
    }
    setPushing(true)
    try {
      const res = await announce({ kind: 'shadow_push', recordId: record.id })
      if (res.posted) await alertSuccess('ส่งไป Slack แล้ว', 'กระดิ่งของ Manager / Team Lead ถูกส่งซ้ำด้วย')
      else await alertError('ส่งไป Slack ไม่สำเร็จ', 'ตรวจว่า Vercel มี SLACK_WEBHOOK_URL (หรือ SLACK_BOT_TOKEN + SLACK_TRAINER_CHANNEL_ID) และ Visit นี้บันทึกในระบบแล้ว กระดิ่งอาจถูกส่งไปแล้ว')
    } finally {
      setPushing(false)
    }
  }

  return (
    <button
      type="button"
      onClick={push}
      disabled={pushing}
      title="ส่ง Shadow Visit นี้ไป Slack"
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 font-bold text-gray-700 hover:bg-gray-50 hover:border-freshket-300 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-xs'
      }`}
    >
      <svg className="size-3.5 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
      {pushing ? 'กำลังส่ง…' : 'Push ไป Slack'}
    </button>
  )
}
