'use client'

import Link from 'next/link'
import { useMyBucketResult } from '@/hooks/useFirestore'
import { matchOutcome } from '@/lib/bucketAssessments/scoreBuckets'
import type { BucketAssessmentDefinition } from '@/types/bucketAssessment'

// One profile card per bucket assessment. Renders the learner's result and what
// it means, or an invitation to take it. Driven entirely by the definition, so
// adding a questionnaire to the registry is enough to get a card for it.

export function BucketResultCard({ uid, definition }: {
  uid: string | undefined
  definition: BucketAssessmentDefinition
}) {
  const { data: result } = useMyBucketResult(uid, definition.id)
  const takeHref = `/personality?assessment=${definition.id}`

  if (!result) {
    return (
      <div>
        <p className="text-xs font-bold text-gray-500 mb-2 px-1">{definition.title}</p>
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-6 text-center">
          <p className="text-sm text-gray-500 mb-1">ยังไม่ได้ทำแบบประเมินนี้</p>
          <p className="text-xs text-gray-400 mb-4">
            {definition.questions.length} ข้อ · ประมาณ {definition.estimatedMinutes} นาที
          </p>
          <Link href={takeHref}
            className="inline-block px-5 py-2.5 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors">
            เริ่มทำแบบประเมิน
          </Link>
        </div>
      </div>
    )
  }

  const outcome = matchOutcome(definition, (result.dimensions ?? []).map((d) => d.pick))

  return (
    <div>
      <p className="text-xs font-bold text-gray-500 mb-2 px-1">{definition.title}</p>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="bg-freshket-50 border-b border-freshket-100 px-5 py-4 flex items-center gap-4">
          <div className="size-14 rounded-2xl bg-freshket-200 flex items-center justify-center shrink-0 px-2">
            <span className="text-sm font-black text-freshket-700 tracking-wide text-center leading-tight">
              {result.code}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-freshket-700 leading-tight">
              {outcome?.title ?? result.code}
            </p>
            {outcome?.description && (
              <p className="text-xs font-normal text-freshket-600 mt-0.5 leading-snug">
                {outcome.description}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {outcome?.detail && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-3">
              <p className="text-xs font-bold text-gray-500 mb-1">ในการทำงาน</p>
              <p className="text-xs text-gray-600 leading-relaxed">{outcome.detail}</p>
            </div>
          )}

          {(result.dimensions ?? []).map((d) => {
            const dim = definition.dimensions.find((x) => x.id === d.dimensionId)
            const won = dim?.buckets.find((b) => b.id === d.pick)
            return (
              <div key={d.dimensionId}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400">{dim?.label ?? d.dimensionId}</p>
                  <p className="text-xs font-bold text-gray-600">{won?.label} · {d.strengthPct}%</p>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${d.strengthPct}%`, background: '#00ce7c' }} />
                </div>
                {won?.blurb && <p className="text-xs text-gray-500">{won.blurb}</p>}
              </div>
            )
          })}

          <Link href={takeHref}
            className="block text-center text-xs font-bold text-freshket-600 hover:underline pt-1">
            ทำแบบประเมินใหม่
          </Link>
        </div>
      </div>
    </div>
  )
}
