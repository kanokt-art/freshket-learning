'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/layout/Header'
import { authedFetch } from '@/lib/api/authedFetch'
import { getBucketAssessment, MBTI_DEFINITION } from '@/lib/bucketAssessments'
import { matchOutcome } from '@/lib/bucketAssessments/scoreBuckets'
import type { BucketResult } from '@/types/bucketAssessment'

// Generic take page for any bucket assessment — the questionnaire it runs is
// chosen by ?assessment=<definitionId>, defaulting to MBTI so existing links
// keep working. Nothing here knows what the questions mean; it renders whatever
// the definition holds and posts the answers to be scored server-side.

export default function BucketAssessmentPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const courseId = searchParams.get('courseId') ?? undefined
  const def = getBucketAssessment(searchParams.get('assessment') ?? undefined) ?? MBTI_DEFINITION

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<BucketResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const questions = useMemo(
    () => def.questions.slice().sort((a, b) => a.order - b.order),
    [def],
  )
  const answeredCount = Object.keys(answers).length
  const progressPct = Math.round((answeredCount / questions.length) * 100)
  const current = questions[index]
  const isLast = index === questions.length - 1
  const allAnswered = answeredCount === questions.length

  const dimensionOf = (dimensionId: string) => def.dimensions.find((d) => d.id === dimensionId)
  const bucketLabel = (dimensionId: string, bucketId: string) =>
    dimensionOf(dimensionId)?.buckets.find((b) => b.id === bucketId)

  const outcome = useMemo(
    () => (result ? matchOutcome(def, result.dimensions.map((d) => d.pick)) : undefined),
    [def, result],
  )

  function choose(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
    if (!isLast) setTimeout(() => setIndex((i) => Math.min(i + 1, questions.length - 1)), 150)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await authedFetch('/api/personality/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitionId: def.id, answers, ...(courseId ? { courseId } : {}) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'ส่งคำตอบไม่สำเร็จ')
      setResult(json as BucketResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ส่งคำตอบไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  // ── Result screen ───────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <Header title="ผลแบบประเมิน" subtitle={def.title} />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
              <p className="text-xs font-bold text-gray-400 mb-2">ผลลัพธ์ของคุณคือ</p>
              <p className="text-4xl font-black text-freshket-600 tracking-wide mb-2">{result.code}</p>
              {outcome && <p className="text-base font-bold text-gray-800">{outcome.title}</p>}
            </div>

            {outcome && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <p className="text-xs font-bold text-gray-500 mb-2">ผลลัพธ์นี้หมายถึงอะไร</p>
                <p className="text-sm text-gray-700 leading-relaxed">{outcome.description}</p>
                {outcome.detail && (
                  <>
                    <div className="h-px bg-gray-100 my-4" />
                    <p className="text-xs font-bold text-gray-500 mb-2">ในการทำงาน</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{outcome.detail}</p>
                  </>
                )}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <p className="text-xs font-bold text-gray-500">รายละเอียดแต่ละด้าน</p>
              {result.dimensions.map((d) => {
                const dim = dimensionOf(d.dimensionId)
                const won = bucketLabel(d.dimensionId, d.pick)
                return (
                  <div key={d.dimensionId}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-gray-400">{dim?.label ?? d.dimensionId}</p>
                      <p className="text-xs font-bold text-freshket-700">{won?.label} · {d.strengthPct}%</p>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${d.strengthPct}%`, background: '#00ce7c' }} />
                    </div>
                    {won?.blurb && <p className="text-xs text-gray-500">{won.blurb}</p>}
                  </div>
                )
              })}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400">
                ผลนี้ถูกบันทึกไว้ในโปรไฟล์ของคุณแล้ว — ทำใหม่ได้ทุกเมื่อ ผลล่าสุดจะแทนที่ผลเดิม
              </p>
            </div>

            <div className="flex gap-2 pb-6">
              <Link href="/profile"
                className="flex-1 py-3 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold text-center transition-colors">
                ดูในโปรไฟล์
              </Link>
              <button type="button"
                onClick={() => { setResult(null); setAnswers({}); setIndex(0) }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                ทำแบบประเมินใหม่
              </button>
            </div>

          </div>
        </div>
      </div>
    )
  }

  // ── Questionnaire ───────────────────────────────────────────────────────────
  const currentDimension = dimensionOf(current.dimensionId)

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title={def.title} subtitle={`${questions.length} ข้อ · ประมาณ ${def.estimatedMinutes} นาที`} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-500">ข้อ {index + 1} จาก {questions.length}</p>
              <p className="text-xs text-gray-400">ตอบแล้ว {answeredCount} ข้อ</p>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%`, background: '#00ce7c' }} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            {currentDimension && (
              <p className="text-xs font-bold text-freshket-600">{currentDimension.label}</p>
            )}
            <p className="text-sm text-gray-700 font-bold">
              {current.text ?? 'เลือกข้อที่ตรงกับคุณมากกว่า'}
            </p>

            <div className="space-y-2.5">
              {current.options.map((o) => {
                const selected = answers[current.id] === o.id
                return (
                  <button key={o.id} type="button" onClick={() => choose(current.id, o.id)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm transition-all duration-150 ${
                      selected
                        ? 'bg-freshket-50 border-freshket-300 text-freshket-800 font-bold'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-freshket-200 hover:bg-freshket-50/40'
                    }`}
                  >
                    <span className="flex items-start gap-2.5">
                      <span className={`shrink-0 size-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        selected ? 'border-freshket-500 bg-freshket-500' : 'border-gray-300'
                      }`}>
                        {selected && (
                          <svg className="size-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 leading-relaxed">{o.text}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 rounded-2xl border border-rose-200 px-4 py-3">
              <p className="text-xs font-bold text-rose-600">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pb-6">
            <button type="button" onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
              className="px-5 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              ก่อนหน้า
            </button>

            {isLast ? (
              <button type="button" onClick={handleSubmit}
                disabled={!allAnswered || submitting}
                className="flex-1 py-3 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting ? 'กำลังประมวลผล...' : allAnswered ? 'ดูผลลัพธ์' : `ยังเหลืออีก ${questions.length - answeredCount} ข้อ`}
              </button>
            ) : (
              <button type="button" onClick={() => setIndex((i) => Math.min(i + 1, questions.length - 1))}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                ถัดไป
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
