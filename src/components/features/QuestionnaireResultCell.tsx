'use client'

import { OpenableMbtiPill } from '@/components/features/MbtiBadge'
import { useMyBucketResult } from '@/hooks/useFirestore'

// What a results table shows for a learner of a questionnaire course: the type they got. MBTI opens the
// full type card on click, for whoever is reading the table (super_admin, manager, team lead). A
// questionnaire with no type card just shows its result as a pill. No result yet reads as a dash.
export function QuestionnaireResultCell({ definitionId, code, ownerName }: {
  definitionId: string
  code: string | undefined
  ownerName?: string
}) {
  if (!code) return <span className="text-xs text-gray-300">—</span>
  if (definitionId === 'mbti') return <OpenableMbtiPill code={code} ownerName={ownerName} />
  return (
    <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border bg-freshket-100 text-freshket-700 border-freshket-200">
      {code}
    </span>
  )
}

/** The same, for one person's own result (a row in their training history, where there is no roster query). */
export function UserQuestionnaireResult({ uid, definitionId, ownerName }: { uid: string; definitionId: string; ownerName?: string }) {
  const { data, loading } = useMyBucketResult(uid, definitionId)
  if (loading) return <span className="text-xs text-gray-300">…</span>
  return <QuestionnaireResultCell definitionId={definitionId} code={data?.code} ownerName={ownerName} />
}
