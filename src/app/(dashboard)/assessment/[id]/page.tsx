'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { authedFetch } from '@/lib/api/authedFetch'
import { getDemoMode } from '@/lib/demo/demoMode'
import { MOCK_ASSESSMENTS } from '@/lib/utils/mockData'
import { gradeSubmission, sanitizeQuestion } from '@/lib/assessment/grade'
import { quizBriefing, formatMinutes, type QuizBriefing } from '@/lib/assessment/briefing'
import { get as getDoc } from '@/lib/data/collection'
import type { Question, DragPair, Assessment } from '@/types/assessment'

const DEMO_MODE = getDemoMode()

/** mm:ss, clamped at zero so a late tick never shows a negative clock. */
function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// What GET /api/assessment/[id]/take returns — the assessment minus its key.
// googleFormUrl is present only for a Google Form assessment, which carries no
// questions[] (Google owns the response collection, not this app).
interface TakeAssessment {
  id: string
  title: string
  description: string
  passingScore: number
  questions: Question[]
  googleFormUrl?: string
  antiCheatEnabled?: boolean
  /** 0 / absent = untimed. */
  timeLimitMinutes?: number
  /** Whether the course (when opened from one) lets a finished learner sit it again. */
  allowRetake?: boolean
  /** How many times this learner has already sat it. */
  attemptsSoFar?: number
  /** May someone who failed sit it again (on unless the admin turned it off). */
  allowRetakeOnFail?: boolean
  /** Failed it already, with no retake allowed: it cannot be started. */
  retakeBlocked?: boolean
}

// Mirrors courses/[id]/page.tsx's toFormEmbedUrl — converts an ALREADY-RESOLVED
// docs.google.com URL into its embeddable form. forms.gle resolving happens
// separately via /api/resolve-form-url (a browser can't follow that redirect
// itself; the target host sends no CORS headers for a cross-origin fetch).
function toFormEmbedUrl(url: string): string | null {
  if (!url || url.includes('example-')) return null
  if (url.includes('docs.google.com/forms')) {
    const base = url.split('?')[0].replace(/\/(edit|pub|closedform)$/, '/viewform')
    const viewBase = base.endsWith('/viewform') ? base : `${base}/viewform`
    return `${viewBase}?embedded=true`
  }
  return null
}

// What POST /api/assessment/submit returns. `results` is the per-question
// breakdown, which is the only way the result screen can reveal correct answers
// now that the client never holds the key.
export interface SubmitResult {
  score: number
  passed: boolean
  passingScore: number
  pointsEarned: number
  pointsPossible: number
  attemptNumber: number
  results: {
    questionId: string
    correct: boolean | null
    pointsEarned: number
    pointsPossible: number
    correctLabel: string
  }[]
}

// `step` and `lessonId` are present only when the course lesson carried a
// pre/post tag (CourseLesson.quizRole); a plain lesson quiz returns a courseId
// alone. `lessonId` lets a graded quiz tick its own lesson complete on submit —
// those lessons deliberately do NOT auto-complete on open.
type ReturnCtx = { courseId: string; step?: 'pre' | 'post'; lessonId?: string }

const MAX_VIOLATIONS = 3

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TakeAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  // ?preview=1 (super_admin only): a try-out. The quiz is graded here in the browser against
  // the key the admin may already read; nothing is started, submitted, recorded or announced.
  const search = useSearchParams()
  const isPreview = search.get('preview') === '1' && user?.role === 'super_admin'
  // The course the quiz was opened from, so the intro can say how retakes work there.
  const courseIdParam = search.get('courseId')
  const stepParam = search.get('step')
  const [previewSource, setPreviewSource] = useState<Assessment | null>(null)

  // Loaded from the API, not Firestore: the route strips every answer key before
  // it leaves the server, and it enforces isPublished (the old direct-Firestore
  // read did neither).
  const [assessment, setAssessment] = useState<TakeAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | Record<string, string>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [returnCtx, setReturnCtx] = useState<ReturnCtx | null>(null)

  // ── Google Form assessment: resolve forms.gle, then embed ──────────────────
  // A short forms.gle link can't be embedded directly — resolve it to its
  // docs.google.com/forms/... target once (server round trip, see
  // /api/resolve-form-url) and cache the result. A full docs.google.com URL
  // needs no resolving at all.
  const [resolvedFormUrl, setResolvedFormUrl] = useState<string | null>(null)
  const [resolvingForm, setResolvingForm] = useState(false)
  const [formOpened, setFormOpened] = useState(false)
  const [formMarkedDone, setFormMarkedDone] = useState(false)
  useEffect(() => {
    const formUrl = assessment?.googleFormUrl
    if (!formUrl || !formUrl.includes('forms.gle')) return
    let cancelled = false
    setResolvingForm(true)
    // Bounded so a slow/unreachable forms.gle can't leave the spinner stuck
    // forever — always falls through to the "open new tab" fallback within 10s.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    authedFetch('/api/resolve-form-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: formUrl }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (!cancelled) setResolvedFormUrl(json.resolvedUrl)
      })
      .catch(() => { /* falls back to the "open new tab" branch below */ })
      .finally(() => { clearTimeout(timeout); if (!cancelled) setResolvingForm(false) })
    return () => { cancelled = true; clearTimeout(timeout); controller.abort() }
  }, [assessment?.googleFormUrl])

  // No server-side grading exists for a Google Form (Google owns the response
  // collection). Course-level pre/post-test progress fields (preDone/postDone)
  // were removed along with the course-level pre/post-test concept, so there is
  // no course Progress field left to mark here — this now just clears the
  // return flag and lets the learner navigate back via handleBack().
  function handleGoogleFormDone() {
    // Nothing grades a Google Form, so "done" is the learner's word: the lesson is ticked the same way a
    // graded quiz ticks its own (a note the course page picks up when they go back).
    if (returnCtx?.lessonId) {
      try {
        sessionStorage.setItem('assessment_graded_lesson', JSON.stringify({ courseId: returnCtx.courseId, lessonId: returnCtx.lessonId }))
      } catch { /* storage blocked — the lesson stays unticked */ }
    }
    if (returnCtx) sessionStorage.removeItem('assessment_return')
    setFormMarkedDone(true)
  }

  // Timed attempt. The deadline is the SERVER's (from POST /api/assessment/start);
  // this countdown only displays it and triggers the auto-submit. Reloading the
  // page does not reset it, because the server keeps the start time.
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [msLeft, setMsLeft] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!user) return

    // Demo mode never initializes Firebase, so there is no ID token to send and
    // the API would answer 401. Serve the mock quiz locally instead, sanitized
    // through the same helper the server uses so the demo behaves like the real
    // thing (no key in the rendered props, verdict only after submitting).
    if (DEMO_MODE) {
      const found = MOCK_ASSESSMENTS.find((a) => a.id === id)
      setAssessment(found
        ? {
            id: found.id,
            title: found.title,
            description: found.description,
            passingScore: found.passingScore,
            questions: found.questions.map(sanitizeQuestion),
            timeLimitMinutes: found.timeLimitMinutes,
            antiCheatEnabled: found.antiCheatEnabled,
          }
        : null)
      setLoadError(found ? null : 'ไม่พบแบบทดสอบนี้')
      setLoading(false)
      return
    }

    if (isPreview) {
      // Read the full document (with its key) through the data door — super_admin may. The
      // take route would refuse a draft and strips the key we need to grade locally.
      setLoading(true)
      getDoc<Assessment>('assessments', id)
        .then((full) => {
          if (cancelled) return
          if (!full) { setLoadError('ไม่พบแบบทดสอบนี้'); setAssessment(null); return }
          setPreviewSource(full)
          setAssessment({
            id: full.id,
            title: full.title,
            description: full.description,
            passingScore: full.passingScore,
            questions: (full.questions ?? []).map(sanitizeQuestion),
            googleFormUrl: full.googleFormUrl,
            timeLimitMinutes: full.timeLimitMinutes,
            antiCheatEnabled: false, // no fullscreen lock or violation counter while trying it out
          })
        })
        .catch(() => { if (!cancelled) setLoadError('โหลดแบบทดสอบไม่สำเร็จ') })
        .finally(() => { if (!cancelled) setLoading(false) })
      return () => { cancelled = true }
    }

    setLoading(true)
    authedFetch(`/api/assessment/${encodeURIComponent(id)}/take?${new URLSearchParams({ ...(courseIdParam ? { courseId: courseIdParam } : {}), ...(stepParam ? { step: stepParam } : {}) })}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok) {
          setLoadError(json?.error ?? 'โหลดแบบทดสอบไม่สำเร็จ')
          setAssessment(null)
        } else {
          setAssessment(json as TakeAssessment)
        }
      })
      .catch(() => { if (!cancelled) setLoadError('เชื่อมต่อ server ไม่ได้') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, user, isPreview, courseIdParam, stepParam])

  // Read course context written by course detail page before navigation
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('assessment_return')
      if (raw) setReturnCtx(JSON.parse(raw))
    } catch {}
  }, [])

  // ── Anti-cheat (fullscreen enforcement + tab/window-switch detection) ──────
  // Lives on the Assessment itself (not the course that happens to link to it)
  // — the same quiz keeps the same anti-cheat behavior whether it's a course's
  // pre-test, post-test, or a standalone lesson quiz.
  const antiCheatEnabled = !!assessment?.antiCheatEnabled
  const [started, setStarted] = useState(false)
  const [violations, setViolations] = useState(0)
  const [showViolationWarning, setShowViolationWarning] = useState(false)
  const submittingRef = useRef(false)
  const lastViolationAtRef = useRef(0)

  async function handleStartAntiCheat() {
    try { await document.documentElement.requestFullscreen() } catch {}
    setStarted(true)
  }

  // The intro card's button: the clock (and, when the quiz is guarded, fullscreen) begins here.
  function handleBegin() {
    if (antiCheatEnabled) void handleStartAntiCheat()
    else setStarted(true)
  }

  async function handleAckViolationWarning() {
    setShowViolationWarning(false)
    if (!document.fullscreenElement) {
      try { await document.documentElement.requestFullscreen() } catch {}
    }
  }

  useEffect(() => {
    if (!started || !antiCheatEnabled || submitted) return

    function registerViolation() {
      if (submittingRef.current) return
      const now = Date.now()
      // visibilitychange + blur can both fire for the same switch — dedupe
      if (now - lastViolationAtRef.current < 800) return
      lastViolationAtRef.current = now
      setViolations((v) => v + 1)
    }
    function onVisibility() { if (document.hidden) registerViolation() }
    function onBlur() { registerViolation() }
    function onFullscreenChange() { if (!document.fullscreenElement) registerViolation() }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [started, antiCheatEnabled, submitted])

  useEffect(() => {
    if (violations === 0) return
    if (violations >= MAX_VIOLATIONS) {
      setShowViolationWarning(false)
      handleSubmit()
    } else {
      setShowViolationWarning(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [violations])

  const questions = assessment?.questions.slice().sort((a, b) => a.order - b.order) ?? []
  const total = questions.length
  const current = questions[currentIndex]

  // Open the server-side session once the learner can actually start answering —
  // i.e. after the intro card, so the clock doesn't run while they read how the quiz works.
  const readyToStart = !!assessment && !assessment.googleFormUrl && !submitted && started
  useEffect(() => {
    if (DEMO_MODE || isPreview || !readyToStart || sessionId || !user) return
    let cancelled = false
    authedFetch('/api/assessment/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId: id, ...(returnCtx ? { courseId: returnCtx.courseId } : {}), ...(returnCtx?.step ? { step: returnCtx.step } : {}) }),
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const json = await res.json()
        setSessionId(json.sessionId)
        setDeadlineAt(json.deadlineAt ?? null)
      })
      .catch(() => { /* no session → submit still works, just untimed */ })
    return () => { cancelled = true }
  }, [readyToStart, sessionId, user, id, returnCtx, isPreview])

  // Tick the countdown and auto-submit at zero.
  useEffect(() => {
    if (deadlineAt == null || submitted) return
    const tick = () => {
      const left = deadlineAt - Date.now()
      setMsLeft(left)
      if (left <= 0) void handleSubmit()
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt, submitted])

  function setAnswer(questionId: string, value: string | Record<string, string>) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  // Grading happens on the server (POST /api/assessment/submit). The browser no
  // longer has the answer key to grade with, and the score it receives back is
  // the one already written to the training record — it can't be edited into
  // something else on the way to the database.
  async function handleSubmit() {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitError(null)
    setSubmitting(true)

    // Preview: grade locally against the stored key. Nothing is sent, saved or announced and
    // the lesson is not ticked — the same result shape the server returns, so the screen is the same.
    if (isPreview) {
      const source = previewSource?.questions ?? []
      const graded = gradeSubmission(source, answers)
      const passingScore = previewSource?.passingScore ?? 70
      setScore(graded.score)
      setSubmitResult({
        score: graded.score,
        passed: graded.pointsPossible === 0 || graded.score >= passingScore,
        passingScore,
        pointsEarned: graded.pointsEarned,
        pointsPossible: graded.pointsPossible,
        attemptNumber: 1,
        results: graded.answers.map((a) => ({
          questionId: a.questionId,
          correct: a.correct,
          pointsEarned: a.pointsEarned,
          pointsPossible: a.pointsPossible,
          correctLabel: source.find((q) => q.id === a.questionId)?.choices?.find((c) => c.isCorrect)?.text ?? '',
        })),
      })
      if (returnCtx) sessionStorage.removeItem('assessment_return')
      setSubmitted(true)
      setSubmitting(false)
      return
    }

    // Demo mode: grade locally against the mock key. Safe because the data is
    // fictional and nothing is persisted — the real path below never sees a key.
    if (DEMO_MODE) {
      const source = MOCK_ASSESSMENTS.find((a) => a.id === id)
      const graded = gradeSubmission(source?.questions ?? [], answers)
      const passingScore = source?.passingScore ?? 70
      // Mirrors the server rule: nothing auto-gradeable means the score is not a
      // verdict, so don't fail the learner on it (api/assessment/submit).
      const passed = graded.pointsPossible === 0 || graded.score >= passingScore
      setScore(graded.score)
      setSubmitResult({
        score: graded.score,
        passed,
        passingScore,
        pointsEarned: graded.pointsEarned,
        pointsPossible: graded.pointsPossible,
        attemptNumber: 1,
        results: graded.answers.map((a) => ({
          questionId: a.questionId,
          correct: a.correct,
          pointsEarned: a.pointsEarned,
          pointsPossible: a.pointsPossible,
          correctLabel:
            source?.questions.find((q) => q.id === a.questionId)?.choices?.find((c) => c.isCorrect)?.text ?? '',
        })),
      })
      if (returnCtx) sessionStorage.removeItem('assessment_return')
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      setSubmitted(true)
      setSubmitting(false)
      return
    }

    try {
      const res = await authedFetch('/api/assessment/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: id,
          answers,
          ...(returnCtx ? { courseId: returnCtx.courseId } : {}),
          ...(returnCtx?.step ? { step: returnCtx.step } : {}),
          ...(sessionId ? { sessionId } : {}),
          autoSubmitted: violations >= MAX_VIOLATIONS || (deadlineAt != null && Date.now() >= deadlineAt),
        }),
      })

      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        setSubmitError(msg?.error ?? 'ส่งคำตอบไม่สำเร็จ — กรุณาลองอีกครั้ง')
        submittingRef.current = false
        setSubmitting(false)
        return
      }

      const result: SubmitResult = await res.json()

      // The SCORE is intentionally not written to localStorage — the server
      // owns it (see /api/assessment/submit) and it's kept in local state only
      // for the result screen below.
      //
      // A graded (pre/post-tagged) quiz lesson does NOT auto-complete when
      // opened, so that a learner can't finish a course without being
      // assessed. Submitting is what completes it: leave a note the course
      // page picks up when the learner returns.
      if (returnCtx?.lessonId) {
        try {
          sessionStorage.setItem('assessment_graded_lesson', JSON.stringify({
            courseId: returnCtx.courseId, lessonId: returnCtx.lessonId,
          }))
        } catch { /* storage blocked — the lesson stays untick, learner retakes */ }
      }
      if (returnCtx) sessionStorage.removeItem('assessment_return')

      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      setScore(result.score)
      setSubmitResult(result)
      setSubmitted(true)
    } catch {
      setSubmitError('เชื่อมต่อ server ไม่ได้ — คำตอบยังไม่ถูกบันทึก กรุณาลองอีกครั้ง')
      submittingRef.current = false
    } finally {
      setSubmitting(false)
    }
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
      <div className="flex items-center justify-center h-full bg-white">
        <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white text-gray-400 gap-3">
        <p className="text-sm">{loadError ?? 'ไม่พบแบบทดสอบนี้'}</p>
        <button onClick={() => router.back()} className="text-sm text-freshket-600 hover:underline">← กลับ</button>
      </div>
    )
  }

  // A Google Form assessment has no questions here: Google owns the form and its responses, so the page
  // shows the form itself (embedded when Google allows it, else a link) and the learner says when done.
  if (assessment.googleFormUrl) {
    const formUrl = assessment.googleFormUrl
    const embedUrl = toFormEmbedUrl(formUrl.includes('forms.gle') ? (resolvedFormUrl ?? '') : formUrl)
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4 shrink-0">
          <button onClick={handleBack} aria-label="กลับ" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{assessment.title}</p>
            {assessment.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{assessment.description}</p>}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {formMarkedDone ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="size-12 rounded-full bg-freshket-100 flex items-center justify-center">
                <svg className="size-6 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <p className="text-sm font-bold text-gray-900">ส่งแบบทดสอบเรียบร้อย</p>
              <button onClick={handleBack} className="px-4 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150">
                {returnCtx ? 'กลับไปที่หลักสูตร' : 'กลับ'}
              </button>
            </div>
          ) : resolvingForm ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : embedUrl ? (
            <iframe src={embedUrl} title={assessment.title} className="flex-1 w-full" style={{ border: 'none' }} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-gray-500">แบบทดสอบนี้เปิดในหน้าต่างใหม่ของ Google Forms</p>
              <a href={formUrl} target="_blank" rel="noopener noreferrer" onClick={() => setFormOpened(true)}
                className="px-4 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150">
                เปิดแบบทดสอบ
              </a>
            </div>
          )}
        </div>

        {!formMarkedDone && !resolvingForm && (
          <div className="shrink-0 border-t border-gray-100 px-6 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">ส่งแบบฟอร์มให้เรียบร้อยก่อน แล้วกดปุ่มนี้</p>
            <button
              onClick={handleGoogleFormDone}
              disabled={!embedUrl && !formOpened}
              className="px-4 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              ทำเสร็จแล้ว
            </button>
          </div>
        )}
      </div>
    )
  }

  if (!started) {
    return (
      <QuizIntro
        title={assessment.title}
        description={assessment.description}
        briefing={quizBriefing(questions, assessment.passingScore, assessment.timeLimitMinutes)}
        attemptsSoFar={isPreview ? 0 : assessment.attemptsSoFar ?? 0}
        allowRetake={assessment.allowRetake}
        allowRetakeOnFail={assessment.allowRetakeOnFail !== false}
        blocked={!isPreview && assessment.retakeBlocked === true}
        antiCheat={antiCheatEnabled}
        isPreview={isPreview}
        onStart={handleBegin}
        onBack={() => router.back()}
      />
    )
  }

  const previewNote = isPreview ? (
    <p className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs font-bold text-amber-700 text-center">
      โหมดทดลอง (พรีวิวของ Admin) — ไม่บันทึกคะแนน ไม่นับว่าเรียนบทนี้แล้ว และไม่แจ้งเตือนใคร
    </p>
  ) : null

  if (submitted) {
    return (
      <div className="flex flex-col h-full">
      {previewNote}
      <ResultScreen
        score={score}
        passingScore={assessment.passingScore}
        total={total}
        questions={questions}
        answers={answers}
        result={submitResult}
        onBack={handleBack}
        fromCourse={!!returnCtx}
      />
      </div>
    )
  }

  const progress = ((currentIndex) / total) * 100

  return (
    <div className="flex flex-col h-full bg-white">
      {previewNote}
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
        {/* Countdown — turns amber under 5 minutes and red under 1, then the
            attempt auto-submits at zero. */}
        {msLeft != null && (
          <div
            aria-live="polite"
            className={`shrink-0 flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border tabular-nums ${
              msLeft <= 60_000
                ? 'text-rose-600 bg-rose-50 border-rose-200'
                : msLeft <= 300_000
                  ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-gray-600 bg-gray-50 border-gray-200'
            }`}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatCountdown(msLeft)}
          </div>
        )}
        {antiCheatEnabled && (
          <div className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            ป้องกันการทุจริต · แจ้งเตือน {violations}/{MAX_VIOLATIONS}
          </div>
        )}
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
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งคำตอบ'}
            {submitting ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* A failed submit must be loud: the score now lives only on the server, so
          unlike the old localStorage write there is nothing to fall back on. */}
      {submitError && (
        <div className="mx-auto mb-4 max-w-lg px-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {submitError}
          </div>
        </div>
      )}

      {showViolationWarning && (
        <ViolationWarningModal violations={violations} maxViolations={MAX_VIOLATIONS} onAck={handleAckViolationWarning} />
      )}
    </div>
  )
}

// ── Anti-Cheat gate & warning ─────────────────────────────────────────────────
// Shown before the quiz starts, and before the clock does: how long there is, how many questions, what it takes
// to pass, and how retakes work. Every attempt is kept (score, time) and the admin can read them.
function QuizIntro({ title, description, briefing, attemptsSoFar, allowRetake, allowRetakeOnFail, blocked, antiCheat, isPreview, onStart, onBack }: {
  title: string
  description: string
  briefing: QuizBriefing
  attemptsSoFar: number
  allowRetake?: boolean
  allowRetakeOnFail: boolean
  blocked: boolean
  antiCheat: boolean
  isPreview: boolean
  onStart: () => void
  onBack: () => void
}) {
  const { questionCount, timeLimitMinutes, passingScore, passItems } = briefing
  const facts: { label: string; value: string }[] = [
    { label: 'เวลา', value: timeLimitMinutes ? formatMinutes(timeLimitMinutes) : 'ไม่จำกัดเวลา' },
    { label: 'จำนวนข้อ', value: `${questionCount} ข้อ` },
    { label: 'เกณฑ์ผ่าน', value: passItems !== null ? `${passingScore}% (${passItems} ข้อ)` : `${passingScore}%` },
  ]
  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6 overflow-auto">
      <div className="animate-pop-in max-w-lg w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-7">
        <button onClick={onBack} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors mb-3">← กลับ</button>
        <h2 className="text-lg font-bold text-gray-900 leading-snug">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>}

        <div className="grid grid-cols-3 gap-3 mt-5">
          {facts.map((f) => (
            <div key={f.label} className="rounded-xl bg-freshket-50 border border-freshket-200 px-3 py-3 text-center">
              <p className="text-xs text-gray-500">{f.label}</p>
              <p className="text-sm font-bold text-freshket-700 mt-1">{f.value}</p>
            </div>
          ))}
        </div>

        <ul className="mt-5 space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
          {timeLimitMinutes ? (
            <li>เมื่อกดเริ่ม ระบบจะ<span className="font-bold text-gray-900">เริ่มจับเวลา {formatMinutes(timeLimitMinutes)}</span> ทันที หมดเวลาแล้วต้องเริ่มทำใหม่</li>
          ) : (
            <li>แบบทดสอบนี้ไม่จำกัดเวลา</li>
          )}
          <li>
            {!allowRetakeOnFail
              ? <span className="font-bold text-rose-600">แบบทดสอบนี้ทำได้ครั้งเดียว หากไม่ผ่านจะทำซ้ำไม่ได้ (ติดต่อ Admin หากต้องการทำใหม่)</span>
              : allowRetake
                ? 'หากไม่ผ่านสามารถทำได้อีกครั้ง และหลักสูตรนี้ทำซ้ำได้แม้เรียนจบแล้ว'
                : 'หากไม่ผ่านสามารถทำได้อีกครั้ง จนกว่าจะผ่าน (เมื่อผ่านและเรียนจบแล้วจะทำซ้ำไม่ได้)'}
          </li>
          <li>คะแนนจะถูกบันทึกทุกครั้งที่ทำ Admin ดูได้ว่าทำไปกี่ครั้ง ได้กี่คะแนน และใช้เวลาเท่าไร</li>
          {antiCheat && (
            <li>
              แบบทดสอบนี้มีระบบป้องกันการทุจริต จะเข้าสู่โหมดเต็มจอ ห้ามสลับแท็บหรือหน้าต่าง
              หากถูกแจ้งเตือนครบ 3 ครั้งจะ<span className="font-bold text-rose-600">ส่งคำตอบอัตโนมัติ</span>
            </li>
          )}
        </ul>

        {attemptsSoFar > 0 && (
          <p className="mt-4 text-xs font-bold text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
            คุณทำแบบทดสอบนี้ไปแล้ว {attemptsSoFar} ครั้ง — ครั้งนี้จะเป็นครั้งที่ {attemptsSoFar + 1}
          </p>
        )}
        {isPreview && (
          <p className="mt-4 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            โหมดทดลองของ Admin — ไม่จับเวลา และไม่บันทึกคะแนน
          </p>
        )}

        {blocked && (
          <p className="mt-4 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            คุณทำแบบทดสอบนี้ไม่ผ่านแล้ว และแบบทดสอบนี้ไม่เปิดให้ทำซ้ำ — ติดต่อ Admin หากต้องการทำใหม่
          </p>
        )}

        <button onClick={onStart} disabled={blocked}
          className="w-full mt-6 px-5 py-3 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-freshket-500">
          {antiCheat ? 'เข้าสู่โหมดเต็มจอและเริ่มทำแบบทดสอบ' : timeLimitMinutes ? 'เริ่มทำแบบทดสอบและจับเวลา' : 'เริ่มทำแบบทดสอบ'}
        </button>
      </div>
    </div>
  )
}

function ViolationWarningModal({ violations, maxViolations, onAck }: {
  violations: number; maxViolations: number; onAck: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <div className="size-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
          <svg className="size-7 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-1">ตรวจพบการสลับหน้าจอ</h3>
        <p className="text-sm text-gray-600 mb-1">ระบบตรวจพบว่าคุณออกจากโหมดทำแบบทดสอบ ({violations}/{maxViolations} ครั้ง)</p>
        <p className="text-sm text-gray-400 mb-6">หากถูกแจ้งเตือนครบ {maxViolations} ครั้ง ระบบจะส่งคำตอบอัตโนมัติทันที</p>
        <button onClick={onAck}
          className="w-full px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all">
          เข้าใจแล้ว กลับเข้าสู่โหมดเต็มจอ
        </button>
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
  result,
  onBack,
  fromCourse,
}: {
  score: number
  passingScore: number
  total: number
  questions: Question[]
  answers: Record<string, string | Record<string, string>>
  /** Server verdict per question — the client has no key to derive this itself. */
  result: SubmitResult | null
  onBack: () => void
  fromCourse?: boolean
}) {
  const passed = result ? result.passed : score >= passingScore
  const verdictByQuestion = new Map(
    (result?.results ?? []).map((r) => [r.questionId, r]),
  )
  const openEndedCount = questions.filter((q) => q.type === 'open_ended').length

  return (
    <div className="flex flex-col h-full bg-white overflow-auto">
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
            // Verdict and the revealed answer both come from the server response.
            // The sanitized question this page holds has no key to check against.
            const verdict = verdictByQuestion.get(q.id)
            const isCorrect: boolean | null = verdict ? verdict.correct : null
            const correctLabel = verdict?.correctLabel ?? ''

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
                  <span className="text-xs font-bold text-gray-400 shrink-0">
                    {/* Written answers carry no auto-gradeable points, so "0/0"
                        would read as a zero rather than as "not marked yet". */}
                    {q.type === 'open_ended'
                      ? 'รอตรวจ'
                      : `${verdict?.pointsEarned ?? 0}/${verdict?.pointsPossible ?? q.points}`}
                  </span>
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
