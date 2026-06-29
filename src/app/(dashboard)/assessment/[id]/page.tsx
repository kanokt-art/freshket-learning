'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAssessment } from '@/hooks/useFirestore'
import type { Question, DragPair } from '@/types/assessment'

type ReturnCtx = { courseId: string; step: 'pre' | 'post' }

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TakeAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: assessment, loading } = useAssessment(id)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | Record<string, string>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)
  const [returnCtx, setReturnCtx] = useState<ReturnCtx | null>(null)

  // Read course context written by course detail page before navigation
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('assessment_return')
      if (raw) setReturnCtx(JSON.parse(raw))
    } catch {}
  }, [])

  const questions = assessment?.questions.slice().sort((a, b) => a.order - b.order) ?? []
  const total = questions.length
  const current = questions[currentIndex]

  function setAnswer(questionId: string, value: string | Record<string, string>) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  function calcScore(): number {
    if (!assessment) return 0
    let earned = 0
    let totalPts = 0
    for (const q of questions) {
      totalPts += q.points
      const ans = answers[q.id]
      if (q.type === 'multiple_choice') {
        const correct = q.choices?.find((c) => c.isCorrect)
        if (correct && ans === correct.id) earned += q.points
      } else if (q.type === 'drag_drop') {
        const map = ans as Record<string, string>
        if (map && q.dragPairs) {
          const allCorrect = q.dragPairs.every((p) => map[p.id] === p.right)
          if (allCorrect) earned += q.points
        }
      }
      // open_ended: not auto-graded
    }
    return totalPts > 0 ? Math.round((earned / totalPts) * 100) : 0
  }

  function handleSubmit() {
    const s = calcScore()
    // Save step progress to localStorage so course detail page can re-read it
    if (returnCtx) {
      try {
        const progKey = `course_prog_${returnCtx.courseId}`
        const existing: Record<string, boolean> = JSON.parse(localStorage.getItem(progKey) ?? '{}')
        const field = returnCtx.step === 'pre' ? 'preDone' : 'postDone'
        localStorage.setItem(progKey, JSON.stringify({ ...existing, [field]: true }))
      } catch {}
      sessionStorage.removeItem('assessment_return')
    }
    setScore(s)
    setSubmitted(true)
  }

  function handleBack() {
    if (returnCtx) {
      router.push(`/courses/${returnCtx.courseId}`)
    } else {
      router.back()
    }
  }

  const canGoNext = !!answers[current?.id ?? ''] || current?.type === 'open_ended'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-gray-400 gap-3">
        <p className="text-sm">ไม่พบแบบทดสอบนี้</p>
        <button onClick={() => router.back()} className="text-sm text-freshket-600 hover:underline">← กลับ</button>
      </div>
    )
  }

  if (submitted) {
    return <ResultScreen score={score} passingScore={assessment.passingScore} total={total} questions={questions} answers={answers} onBack={handleBack} fromCourse={!!returnCtx} />
  }

  const progress = ((currentIndex) / total) * 100

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{assessment.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">ข้อ {currentIndex + 1} จาก {total}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${progress}%`, background: '#00ce7c' }}
        />
      </div>

      {/* Question area */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-6">
        <div className="w-full max-w-2xl">
          {current && (
            <QuestionView
              key={current.id}
              question={current}
              answer={answers[current.id]}
              onAnswer={(v) => setAnswer(current.id, v)}
            />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-normal text-gray-600 rounded-xl hover:bg-gray-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          ย้อนกลับ
        </button>

        <div className="flex gap-1.5">
          {questions.map((_, i) => (
            <button key={i} onClick={() => setCurrentIndex(i)}
              className={`size-2 rounded-full transition-all ${
                i === currentIndex ? 'bg-freshket-500 w-4' : answers[questions[i].id] ? 'bg-freshket-300' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {currentIndex < total - 1 ? (
          <button
            onClick={() => setCurrentIndex((i) => i + 1)}
            disabled={!canGoNext}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ถัดไป
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all"
          >
            ส่งคำตอบ
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Question View ─────────────────────────────────────────────────────────────
function QuestionView({
  question,
  answer,
  onAnswer,
}: {
  question: Question
  answer: string | Record<string, string> | undefined
  onAnswer: (v: string | Record<string, string>) => void
}) {
  return (
    <div className="animate-float-up space-y-6">
      {/* Question text */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <p className="text-base font-bold text-gray-900 leading-relaxed">{question.text}</p>
        <p className="text-xs text-gray-400 mt-2">{question.points} คะแนน</p>
      </div>

      {/* Answer area */}
      {question.type === 'multiple_choice' && (
        <MultipleChoiceInput
          choices={question.choices ?? []}
          selected={answer as string | undefined}
          onSelect={onAnswer}
        />
      )}

      {question.type === 'open_ended' && (
        <OpenEndedInput
          value={answer as string | undefined}
          onChange={onAnswer}
        />
      )}

      {question.type === 'drag_drop' && (
        <DragDropInput
          pairs={question.dragPairs ?? []}
          value={answer as Record<string, string> | undefined}
          onChange={onAnswer}
        />
      )}
    </div>
  )
}

// ── Multiple Choice ───────────────────────────────────────────────────────────
function MultipleChoiceInput({
  choices,
  selected,
  onSelect,
}: {
  choices: { id: string; text: string; isCorrect: boolean }[]
  selected: string | undefined
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {choices.map((choice, i) => (
        <button key={choice.id} type="button" onClick={() => onSelect(choice.id)}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
            selected === choice.id
              ? 'border-freshket-500 bg-freshket-50'
              : 'border-gray-100 bg-white hover:border-gray-200'
          }`}>
          <div className={`size-8 rounded-full border-2 flex items-center justify-center shrink-0 text-sm font-bold transition-all ${
            selected === choice.id
              ? 'border-freshket-500 bg-freshket-500 text-white'
              : 'border-gray-200 text-gray-400'
          }`}>
            {String.fromCharCode(65 + i)}
          </div>
          <span className={`text-sm font-normal ${selected === choice.id ? 'text-freshket-700' : 'text-gray-700'}`}>
            {choice.text}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Open Ended ────────────────────────────────────────────────────────────────
function OpenEndedInput({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (v: string) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <label className="text-xs font-bold text-gray-500 block mb-2">คำตอบของคุณ</label>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="พิมพ์คำตอบที่นี่..."
        className="w-full text-sm text-gray-800 placeholder:text-gray-300 resize-none focus:outline-none leading-relaxed"
      />
    </div>
  )
}

// ── Drag & Drop Matching ──────────────────────────────────────────────────────
function DragDropInput({
  pairs,
  value,
  onChange,
}: {
  pairs: DragPair[]
  value: Record<string, string> | undefined
  onChange: (v: Record<string, string>) => void
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const matched = value ?? {}

  // Shuffle right-side options once
  const [rightOptions] = useState(() => [...pairs].sort(() => Math.random() - 0.5).map((p) => p.right))

  // Right items already placed in a slot
  const usedRights = new Set(Object.values(matched))

  function handleDrop(pairId: string, rightText: string) {
    const prev = matched[pairId]
    const newMap = { ...matched, [pairId]: rightText }
    // If rightText was used by another pair, clear it
    for (const [k, v] of Object.entries(newMap)) {
      if (k !== pairId && v === rightText) delete newMap[k]
    }
    if (prev) {
      // The previous value of this slot is now free — no action needed
    }
    onChange(newMap)
    setDragging(null)
  }

  function clearSlot(pairId: string) {
    const newMap = { ...matched }
    delete newMap[pairId]
    onChange(newMap)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="grid grid-cols-2 gap-6">
        {/* Left: items to match */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-400">รายการ</p>
          {pairs.map((pair) => (
            <div key={pair.id} className="group">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-normal text-gray-800">
                {pair.left}
              </div>
              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragging) handleDrop(pair.id, dragging) }}
                className={`mt-1 flex items-center justify-between min-h-[40px] px-3 py-2 rounded-xl border-2 border-dashed text-xs transition-all ${
                  matched[pair.id]
                    ? 'border-freshket-300 bg-freshket-50 text-freshket-700 font-normal'
                    : 'border-gray-200 text-gray-300'
                }`}
              >
                <span>{matched[pair.id] ?? 'ลากคำตอบมาวางที่นี่'}</span>
                {matched[pair.id] && (
                  <button onClick={() => clearSlot(pair.id)} className="ml-2 text-freshket-400 hover:text-freshket-600 transition-colors">
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Right: draggable options */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-400">คำตอบ (ลากไปจับคู่)</p>
          <div className="flex flex-col gap-2">
            {rightOptions.map((opt) => (
              <div
                key={opt}
                draggable
                onDragStart={() => setDragging(opt)}
                onDragEnd={() => setDragging(null)}
                className={`px-3 py-2.5 rounded-xl border-2 text-sm font-normal cursor-grab active:cursor-grabbing transition-all select-none ${
                  usedRights.has(opt)
                    ? 'border-gray-100 bg-gray-50 text-gray-300 opacity-40'
                    : dragging === opt
                    ? 'border-freshket-400 bg-freshket-50 text-freshket-700 scale-95'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-freshket-300 hover:bg-freshket-50/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                  </svg>
                  {opt}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Result Screen ─────────────────────────────────────────────────────────────
function ResultScreen({
  score,
  passingScore,
  total,
  questions,
  answers,
  onBack,
  fromCourse,
}: {
  score: number
  passingScore: number
  total: number
  questions: Question[]
  answers: Record<string, string | Record<string, string>>
  onBack: () => void
  fromCourse?: boolean
}) {
  const passed = score >= passingScore
  const openEndedCount = questions.filter((q) => q.type === 'open_ended').length

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-auto">
      <div className="max-w-lg mx-auto w-full p-6 space-y-5">

        {/* Score card */}
        <div className="animate-pop-in bg-white rounded-3xl border border-gray-100 shadow-md p-8 text-center">
          {/* Score circle */}
          <div className={`size-24 rounded-full border-4 flex items-center justify-center mx-auto mb-4 ${
            passed ? 'border-freshket-500 bg-freshket-50' : 'border-rose-400 bg-rose-50'
          }`}>
            <span className={`text-3xl font-bold ${passed ? 'text-freshket-600' : 'text-rose-600'}`}>{score}</span>
          </div>
          <p className={`text-lg font-bold ${passed ? 'text-freshket-600' : 'text-rose-600'}`}>
            {passed ? 'ผ่านแบบทดสอบ!' : 'ยังไม่ผ่าน'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            คะแนน {score} / 100 · เกณฑ์ผ่าน {passingScore}%
          </p>
          {openEndedCount > 0 && (
            <p className="text-xs text-amber-600 mt-2 bg-amber-50 px-3 py-1.5 rounded-full inline-block">
              Open-Ended {openEndedCount} ข้อ รอผู้สอนตรวจ
            </p>
          )}
        </div>

        {/* Answer review */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-500">สรุปคำตอบ</p>
          {questions.map((q, i) => {
            const ans = answers[q.id]
            let isCorrect: boolean | null = null
            let correctLabel = ''

            if (q.type === 'multiple_choice') {
              const correctChoice = q.choices?.find((c) => c.isCorrect)
              isCorrect = ans === correctChoice?.id
              correctLabel = correctChoice?.text ?? ''
            } else if (q.type === 'drag_drop') {
              const map = ans as Record<string, string>
              isCorrect = q.dragPairs?.every((p) => map?.[p.id] === p.right) ?? false
            }

            return (
              <div key={q.id} className={`bg-white rounded-xl border p-4 ${
                isCorrect === true ? 'border-freshket-200' : isCorrect === false ? 'border-rose-200' : 'border-gray-100'
              }`}>
                <div className="flex items-start gap-2">
                  <span className="size-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                    {isCorrect === true ? (
                      <svg className="size-5 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : isCorrect === false ? (
                      <svg className="size-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="size-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-700 line-clamp-2">ข้อ {i + 1}: {q.text}</p>
                    {q.type === 'open_ended' && ans && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">คำตอบ: {ans as string}</p>
                    )}
                    {isCorrect === false && correctLabel && (
                      <p className="text-xs text-freshket-600 mt-1">เฉลย: {correctLabel}</p>
                    )}
                  </div>
                  <span className="text-xs font-bold text-gray-400 shrink-0">{isCorrect ? q.points : 0}/{q.points}</span>
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={onBack}
          className="w-full py-3 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all">
          {fromCourse ? '← กลับไปหลักสูตร' : 'กลับ'}
        </button>
      </div>
    </div>
  )
}
