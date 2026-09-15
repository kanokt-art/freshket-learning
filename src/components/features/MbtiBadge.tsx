'use client'

import { useMyBucketResult } from '@/hooks/useFirestore'
import { MBTI_DEFINITION } from '@/lib/bucketAssessments'

// Pastel pill showing a person's MBTI code, for profile headers and people
// lists. Someone who hasn't taken the questionnaire gets a grey placeholder
// pill rather than nothing, so the row keeps its shape and "not taken yet"
// reads as a real state instead of looking like a rendering gap.
//
// Introvert/extravert types get different pastel hues, keyed off the first
// letter, so two codes read as visibly different at a glance instead of every
// badge being the same colour.
const AXIS_TONE: Record<string, string> = {
  I: 'bg-violet-100 text-violet-700 border-violet-200',
  E: 'bg-amber-100 text-amber-700 border-amber-200',
}

const FALLBACK_TONE = 'bg-freshket-100 text-freshket-700 border-freshket-200'
const EMPTY_TONE = 'bg-gray-100 text-gray-400 border-gray-200'

export function MbtiBadge({ uid, className = '' }: { uid: string | undefined; className?: string }) {
  const { data: result } = useMyBucketResult(uid, MBTI_DEFINITION.id)

  const code = result?.code
  const tone = !code
    ? EMPTY_TONE
    : AXIS_TONE[code.charAt(0).toUpperCase()] ?? FALLBACK_TONE

  return (
    <span
      title={code ? `${MBTI_DEFINITION.title}: ${code}` : `ยังไม่ได้ทำ${MBTI_DEFINITION.title}`}
      className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border tracking-wide ${tone} ${className}`}
    >
      {code ?? '—'}
    </span>
  )
}
