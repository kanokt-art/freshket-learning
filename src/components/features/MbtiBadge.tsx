'use client'

import { useMyBucketResult } from '@/hooks/useFirestore'
import { MBTI_DEFINITION } from '@/lib/bucketAssessments'

// Pastel pill showing a person's MBTI code, for profile headers and people
// lists. Renders nothing until the result exists, so a user who hasn't taken
// the questionnaire simply has no badge rather than an empty placeholder.
//
// Each of the four MBTI axes gets its own pastel hue, keyed off the first
// letter, so two types read as visibly different at a glance instead of every
// badge being the same green.
const AXIS_TONE: Record<string, string> = {
  I: 'bg-violet-100 text-violet-700 border-violet-200',
  E: 'bg-amber-100 text-amber-700 border-amber-200',
}

const FALLBACK_TONE = 'bg-freshket-100 text-freshket-700 border-freshket-200'

export function MbtiBadge({ uid, className = '' }: { uid: string | undefined; className?: string }) {
  const { data: result } = useMyBucketResult(uid, MBTI_DEFINITION.id)
  if (!result?.code) return null

  const tone = AXIS_TONE[result.code.charAt(0).toUpperCase()] ?? FALLBACK_TONE

  return (
    <span
      title={`${MBTI_DEFINITION.title}: ${result.code}`}
      className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border tracking-wide ${tone} ${className}`}
    >
      {result.code}
    </span>
  )
}
