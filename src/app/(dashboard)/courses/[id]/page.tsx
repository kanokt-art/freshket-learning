'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCourse, useCourseTrainingRecords, useAllUsers, useTeams, useDepartments } from '@/hooks/useFirestore'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { canAccess } from '@/types/user'
import { CATEGORY_LABELS, CATEGORY_COLORS, type Course, type CourseTopic, type CourseLesson, type LessonType } from '@/types/course'
import { STATUS_LABELS, type TrainingStatus } from '@/types/tracking'
import type { TrainingRecord } from '@/types/tracking'
import type { UserProfile, Team, Department } from '@/types/user'
import { YouTubeGatedPlayer, youtubeVideoId } from '@/components/features/YouTubeGatedPlayer'
import { syncTrainingRecord, countCourseLessons } from '@/lib/progress'
import { progKey, statusKey, takeawayKey, readScoped } from '@/lib/courseProgressKeys'

// ── Progress tracking via localStorage (mirrored to Firestore, see persist()) ──
type Progress = {
  preDone: boolean; slideDone: boolean; postDone: boolean; takeawayDone: boolean
  preScore?: number; postScore?: number
  completedLessonIds?: string[]
}

const EMPTY_PROG: Progress = { preDone: false, slideDone: false, postDone: false, takeawayDone: false, completedLessonIds: [] }

function loadProgress(uid: string, courseId: string): Progress {
  if (typeof window === 'undefined' || !uid) return EMPTY_PROG
  try {
    const raw = readScoped(uid, progKey(uid, courseId), `course_prog_${courseId}`)
    return raw ? { ...EMPTY_PROG, ...JSON.parse(raw) } : EMPTY_PROG
  } catch {
    return EMPTY_PROG
  }
}

function saveProgress(uid: string, courseId: string, prog: Progress) {
  if (!uid) return
  localStorage.setItem(progKey(uid, courseId), JSON.stringify(prog))
}

function loadTakeAway(uid: string, courseId: string): string {
  if (typeof window === 'undefined' || !uid) return ''
  try {
    return readScoped(uid, takeawayKey(uid, courseId), `course_takeaway_${courseId}`) ?? ''
  } catch { return '' }
}

// Dual-write: localStorage keeps the learner's own editing instant, and a
// Firestore copy (takeaways/{uid}_{courseId}) makes the reflection readable by
// the learner's team lead / manager on the team page. Best-effort — a failed
// Firestore write never blocks the learner.
function saveTakeAway(courseId: string, text: string, uid?: string, courseTitle?: string) {
  if (!uid) return
  try { localStorage.setItem(takeawayKey(uid, courseId), text) } catch { /* ignore */ }
  ;(async () => {
    try {
      const { getClientFirestore } = await import('@/lib/firebase/client')
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore')
      await setDoc(
        doc(getClientFirestore(), 'takeaways', `${uid}_${courseId}`),
        { uid, courseId, courseTitle: courseTitle ?? '', text, updatedAt: serverTimestamp() },
        { merge: true },
      )
    } catch (e) { console.error('saveTakeAway firestore', e) }
  })()
}

// Derive overall course status from step progress and persist for the list page
function checkAndSaveStatus(uid: string, courseId: string, course: Course, prog: Progress): TrainingStatus {
  const steps = buildSteps(course)
  const allDone = steps.every((s) => {
    if (s.id === 'pre')      return prog.preDone
    if (s.id === 'slide')    return prog.slideDone
    if (s.id === 'takeaway') return prog.takeawayDone
    return prog.postDone
  })
  const anyDone = prog.preDone || prog.slideDone || prog.postDone || prog.takeawayDone
    || (prog.completedLessonIds?.length ?? 0) > 0
  const status: TrainingStatus = allDone ? 'completed' : anyDone ? 'in_progress' : 'not_started'
  if (uid) localStorage.setItem(statusKey(uid, courseId), status)
  return status
}

// Certificate eligibility: gated on the quiz pass-threshold (if the course has a quiz
// with passThresholdPercent set) once all course steps are done. Courses with no quiz
// score to gate on (e.g. Google Form assessments) fall back to "earned on completion".
type CertificateStatus = 'none' | 'locked' | 'earned' | 'below_threshold'

function getCertificateStatus(course: Course, prog: Progress): CertificateStatus {
  if (!course.hasCertificate) return 'none'
  const steps = buildSteps(course)
  const allDone = steps.every((s) => {
    if (s.id === 'pre')      return prog.preDone
    if (s.id === 'slide')    return prog.slideDone
    if (s.id === 'takeaway') return prog.takeawayDone
    return prog.postDone
  })
  if (!allDone) return 'locked'
  const threshold = course.quizSettings?.passThresholdPercent
  if (threshold == null) return 'earned'
  const relevantScore = course.hasPostAssessment ? prog.postScore : course.hasPreAssessment ? prog.preScore : undefined
  if (relevantScore == null) return 'earned'
  return relevantScore >= threshold ? 'earned' : 'below_threshold'
}

// ── Media URL detection & conversion ─────────────────────────────────────────
type MediaType = 'google_slides' | 'youtube' | 'google_drive' | 'unknown'

function detectMediaType(url: string): MediaType {
  if (!url) return 'unknown'
  if (url.includes('docs.google.com/presentation')) return 'google_slides'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('drive.google.com')) return 'google_drive'
  return 'unknown'
}

function toFormEmbedUrl(url: string): string | null {
  if (!url || url.includes('example-') || url.includes('forms.gle')) return null
  if (url.includes('docs.google.com/forms')) {
    const base = url.split('?')[0].replace(/\/(edit|pub|closedform)$/, '/viewform')
    const viewBase = base.endsWith('/viewform') ? base : `${base}/viewform`
    return `${viewBase}?embedded=true`
  }
  return null
}

function toEmbedUrl(url: string): { embedUrl: string; type: MediaType } | null {
  if (!url || url.includes('example-')) return null

  const type = detectMediaType(url)

  if (type === 'google_slides') {
    // Convert /edit, /pub, /present → /embed
    const base = url
      .replace(/\/edit(\?.*)?$/, '/embed')
      .replace(/\/pub(\?.*)?$/, '/embed')
      .replace(/\/present(\?.*)?$/, '/embed')
    const embedUrl = base.includes('/embed')
      ? (base.includes('?') ? base : `${base}?start=false&loop=false&delayms=3000`)
      : null
    return embedUrl ? { embedUrl, type } : null
  }

  if (type === 'youtube') {
    // youtube.com/watch?v=ID or youtu.be/ID
    const m1 = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/)
    const m2 = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    const vid = (m1 ?? m2)?.[1]
    return vid ? { embedUrl: `https://www.youtube.com/embed/${vid}?rel=0`, type } : null
  }

  if (type === 'google_drive') {
    // drive.google.com/file/d/ID/view → /preview
    const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
    // drive.google.com/open?id=ID
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    const fileId = (m1 ?? m2)?.[1]
    return fileId ? { embedUrl: `https://drive.google.com/file/d/${fileId}/preview`, type } : null
  }

  return null
}

// ── Step types ────────────────────────────────────────────────────────────────
type StepId = 'pre' | 'slide' | 'post' | 'takeaway'

interface StepDef {
  id: StepId
  label: string
  sublabel: string
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const { data: course, loading } = useCourse(id)
  // Scoped to this course only (was the whole trainingRecords collection).
  const { data: allRecords } = useCourseTrainingRecords(id)
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user?.role, user?.department)

  const isAdmin = canAccess(user?.role ?? 'sale', 'team_lead')

  // These three are consumed ONLY by <CourseResultsDashboard>, which renders just
  // for admins. Ungated, every learner opening any course pulled the entire users
  // collection (and useDepartments is a second full users read) to feed a
  // component they can never see.
  const { data: allUsers }    = useAllUsers(isAdmin)
  const { data: teams }       = useTeams(isAdmin)
  const { data: departments } = useDepartments(isAdmin)
  const [tab, setTab] = useState<'results' | 'content'>('results')

  const [progress, setProgress] = useState<Progress>(EMPTY_PROG)
  const [activeStep, setActiveStep] = useState<StepId>('pre')

  // Load progress from localStorage on mount. Keyed by uid, so it has to wait
  // for auth to resolve — an anonymous first paint would read nothing.
  useEffect(() => {
    if (!user?.uid) return
    setProgress(loadProgress(user.uid, id))
  }, [id, user?.uid])

  // Re-read progress when user navigates back (window focus / visibility)
  const refreshProgress = useCallback(() => {
    if (!user?.uid) return
    setProgress(loadProgress(user.uid, id))
  }, [id, user?.uid])

  useEffect(() => {
    window.addEventListener('focus', refreshProgress)
    document.addEventListener('visibilitychange', refreshProgress)
    return () => {
      window.removeEventListener('focus', refreshProgress)
      document.removeEventListener('visibilitychange', refreshProgress)
    }
  }, [refreshProgress])

  // Set initial active step to first unlocked incomplete step
  useEffect(() => {
    if (!course || !user?.uid) return
    const steps = buildSteps(course)
    const prog = loadProgress(user.uid, id)
    const firstPending = steps.find((s) => !isDone(s.id, prog))
    if (firstPending) setActiveStep(firstPending.id)
    else setActiveStep(steps[steps.length - 1]?.id ?? 'slide')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, id, user?.uid])

  // ── Mirror progress to Firestore (the admin ↔ user link) ────────────────────
  // Single sync point: covers step completions, per-lesson completions, and the
  // scores the assessment page writes back to localStorage (picked up on focus).
  // Only fires once the learner has actually done something, so merely opening a
  // course — or an admin previewing it — doesn't create an empty record.
  const progressKey = JSON.stringify(progress)
  useEffect(() => {
    if (!course || !user?.uid) return
    const prog: Progress = JSON.parse(progressKey)
    const started = prog.preDone || prog.slideDone || prog.postDone || prog.takeawayDone
      || (prog.completedLessonIds?.length ?? 0) > 0
    if (!started) return
    const status = checkAndSaveStatus(user.uid, course.id, course, prog)
    void syncTrainingRecord(user.uid, user.displayName, course, {
      status,
      score: prog.postScore ?? prog.preScore,
      completedLessonIds: prog.completedLessonIds ?? [],
      totalLessons: countCourseLessons(course),
    })
  }, [course, user?.uid, user?.displayName, progressKey])

  if (loading || moduleLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Same module gate the /courses list applies. Without it this route was the one
  // hole in the LMS module: a department with `lms` switched off was blocked at
  // the list but could still open any course by direct URL.
  if (!allowedModules.has('lms')) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center max-w-xs">
            <div className="size-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="size-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">Module ไม่ได้เปิดใช้งาน</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              หลักสูตร ยังไม่ได้เปิดสำหรับแผนกของคุณ<br />กรุณาติดต่อ Admin
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 gap-3">
        <p className="text-sm text-gray-400">ไม่พบหลักสูตรนี้</p>
        <button onClick={() => router.back()} className="text-sm text-freshket-600 hover:underline">← กลับ</button>
      </div>
    )
  }

  const steps = buildSteps(course)
  const catColor = CATEGORY_COLORS[course.category]

  function isDone(stepId: StepId, prog = progress): boolean {
    if (stepId === 'pre')      return prog.preDone
    if (stepId === 'slide')    return prog.slideDone
    if (stepId === 'post')     return prog.postDone
    if (stepId === 'takeaway') return prog.takeawayDone
    return false
  }

  function isLocked(stepId: StepId): boolean {
    if (stepId === 'pre') return false
    if (stepId === 'slide') return !!(course!.hasPreAssessment && !progress.preDone)
    if (stepId === 'post') return !progress.slideDone
    if (stepId === 'takeaway') {
      const lastRequired = course!.hasPostAssessment ? 'postDone' : course!.slideUrl ? 'slideDone' : 'preDone'
      return !progress[lastRequired as keyof Progress]
    }
    return false
  }

  // localStorage write path (instant + offline). The Firestore mirror is handled
  // by the sync effect above, which also covers progress written by the
  // assessment page (scores) and picked up on window focus.
  function persist(next: Progress) {
    if (!user?.uid) return
    saveProgress(user.uid, id, next)
    checkAndSaveStatus(user.uid, id, course!, next)
    setProgress(next)
  }

  // Marks a single lesson complete (video lessons call this at ≥95% watched;
  // other lesson types when the learner opens them).
  function markLessonComplete(lessonId: string) {
    const done = progress.completedLessonIds ?? []
    if (done.includes(lessonId)) return
    persist({ ...progress, completedLessonIds: [...done, lessonId] })
  }

  function markSlideDone() {
    const next = { ...progress, slideDone: true }
    persist(next)
    if (course!.hasPostAssessment) setActiveStep('post')
    else if (course!.hasKeyTakeAway) setActiveStep('takeaway')
  }

  function markTakeAwayDone(text: string) {
    saveTakeAway(id, text, user?.uid, course?.title)
    persist({ ...progress, takeawayDone: true })
  }

  function startAssessment(assessmentId: string, step: 'pre' | 'post') {
    sessionStorage.setItem('assessment_return', JSON.stringify({ courseId: id, step }))
    router.push(`/assessment/${assessmentId}`)
  }

  function openGoogleForm(url: string, step: 'pre' | 'post') {
    window.open(url, '_blank', 'noopener,noreferrer')
    // Mark done after user opens it (optimistic — they can mark manually)
  }

  function markFormDone(step: 'pre' | 'post') {
    const field = step === 'pre' ? 'preDone' : 'postDone'
    const next = { ...progress, [field]: true }
    persist(next)
    if (step === 'pre' && course!.slideUrl) setActiveStep('slide')
    else if (step === 'pre' && course!.hasKeyTakeAway) setActiveStep('takeaway')
    if (step === 'post' && course!.hasKeyTakeAway) setActiveStep('takeaway')
  }

  const currentStep = steps.find((s) => s.id === activeStep) ?? steps[0]

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      {/* select-none: this bar is app chrome, not content. Without it, clicking
          the title (or caret-browsing) drops a blinking text caret in the heading,
          which looks like the title is editable. */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4 shrink-0 select-none">
        <button onClick={() => router.push('/courses')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${catColor}`}>
              {CATEGORY_LABELS[course.category]}
            </span>
            {course.isRequired && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
                บังคับ
              </span>
            )}
          </div>
          <h1 className="text-sm font-bold text-gray-900 truncate">{course.title}</h1>
        </div>
        {/* Tab switcher — admin/lead only */}
        {isAdmin && (
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setTab('results')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                tab === 'results' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ผลการเรียน
            </button>
            <button
              type="button"
              onClick={() => setTab('content')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                tab === 'content' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              เนื้อหา
            </button>
          </div>
        )}

        {/* Steps pill — content tab only */}
        {(!isAdmin || tab === 'content') && (
          <div className="shrink-0 text-xs font-bold text-freshket-600 bg-freshket-50 px-3 py-1.5 rounded-full border border-freshket-200">
            {steps.filter((s) => isDone(s.id)).length} / {steps.length} ขั้นตอน
          </div>
        )}
      </div>

      {/* ── Results dashboard tab ───────────────────────────────────────── */}
      {isAdmin && tab === 'results' && (
        <CourseResultsDashboard
          courseId={id}
          course={course}
          allRecords={allRecords}
          allUsers={allUsers}
          teams={teams}
          departments={departments}
        />
      )}

      {/* ── Content tab ──────────────────────────────────────────────────── */}
      {(!isAdmin || tab === 'content') && <>

      {/* ── Mobile stepper (tabs) ─────────────────────────────────────────── */}
      <div className="lg:hidden bg-white border-b border-gray-100 px-4 overflow-x-auto">
        <div className="flex gap-1 py-2">
          {steps.map((step, i) => {
            const done = isDone(step.id)
            const locked = isLocked(step.id)
            const active = activeStep === step.id
            return (
              <button key={step.id}
                onClick={() => !locked && setActiveStep(step.id)}
                disabled={locked}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  active ? 'bg-freshket-500 text-white' :
                  done ? 'bg-freshket-50 text-freshket-600' :
                  locked ? 'text-gray-300 cursor-not-allowed' :
                  'text-gray-500 hover:bg-gray-100'
                }`}>
                <StepIcon index={i + 1} done={done} locked={locked} active={active} small />
                {step.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar (desktop) ──────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-gray-100 p-4 gap-2 shrink-0">
          <p className="text-xs font-bold text-gray-400 mb-1 px-2">ขั้นตอนการเรียน</p>
          {steps.map((step, i) => {
            const done  = isDone(step.id)
            const locked = isLocked(step.id)
            const active = activeStep === step.id
            return (
              <button key={step.id}
                onClick={() => !locked && setActiveStep(step.id)}
                disabled={locked}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                  active ? 'bg-freshket-500 text-white shadow-sm' :
                  done ? 'bg-freshket-50 text-freshket-700' :
                  locked ? 'opacity-40 cursor-not-allowed' :
                  'text-gray-600 hover:bg-gray-50'
                }`}>
                <StepIcon index={i + 1} done={done} locked={locked} active={active} />
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{step.label}</p>
                  <p className={`text-xs truncate ${active ? 'text-white/70' : 'text-gray-400'}`}>
                    {done ? 'เสร็จแล้ว' : locked ? 'ยังไม่ถึงขั้นตอนนี้' : step.sublabel}
                  </p>
                </div>
                {done && !active && (
                  <svg className="size-4 text-freshket-500 shrink-0 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            )
          })}

          {/* Course info */}
          <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
            {course.hasCertificate && (
              <CertificateStatusBadge status={getCertificateStatus(course, progress)} passThresholdPercent={course.quizSettings?.passThresholdPercent} />
            )}
            <p className="text-sm text-gray-400 px-2">{course.description}</p>
          </div>
        </aside>

        {/* ── Content area (less padding for slide view) ───────────────── */}
        <main className={`flex-1 overflow-auto ${currentStep?.id === 'slide' ? 'p-4' : 'p-6'}`}>
          {currentStep && (
            <StepContent
              step={currentStep}
              course={course}
              done={isDone(currentStep.id)}
              progress={progress}
              courseId={id}
              onMarkSlideDone={markSlideDone}
              onStartAssessment={startAssessment}
              onOpenGoogleForm={openGoogleForm}
              onMarkFormDone={markFormDone}
              onMarkTakeAwayDone={markTakeAwayDone}
              onLessonComplete={markLessonComplete}
              onNext={() => {
                const idx = steps.findIndex((s) => s.id === currentStep.id)
                if (idx < steps.length - 1) setActiveStep(steps[idx + 1].id)
              }}
              hasNext={steps.findIndex((s) => s.id === currentStep.id) < steps.length - 1}
            />
          )}
        </main>
      </div>

      </> /* end content tab */}
    </div>
  )
}

// ── Build steps array from course config ──────────────────────────────────────
function buildSteps(course: ReturnType<typeof useCourse>['data'] & object): StepDef[] {
  const steps: StepDef[] = []
  if (course.hasPreAssessment) steps.push({ id: 'pre', label: 'Pre-Assessment', sublabel: 'ทำแบบทดสอบก่อนเรียน' })
  if (course.slideUrl) steps.push({ id: 'slide', label: 'สื่อการสอน', sublabel: 'เรียนจากสไลด์' })
  if (course.hasPostAssessment) steps.push({ id: 'post', label: 'Post-Assessment', sublabel: 'ทำแบบทดสอบหลังเรียน' })
  if (course.hasKeyTakeAway) steps.push({ id: 'takeaway', label: 'Key Take Away', sublabel: 'สรุปสิ่งที่ได้เรียนรู้' })
  if (steps.length === 0) steps.push({ id: 'slide', label: 'สื่อการสอน', sublabel: 'เรียนจากสไลด์' })
  return steps
}

// ── Certificate status ───────────────────────────────────────────────────────
function CertificateStatusBadge({ status, passThresholdPercent }: {
  status: CertificateStatus; passThresholdPercent?: number
}) {
  if (status === 'none') return null
  const style = status === 'earned'
    ? 'bg-freshket-50 text-freshket-700'
    : status === 'below_threshold'
    ? 'bg-rose-50 text-rose-600'
    : 'bg-gray-50 text-gray-400'
  return (
    <div className={`px-2.5 py-2 rounded-xl text-xs font-bold flex items-start gap-2 ${style}`}>
      <svg className="size-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m6 3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>
        {status === 'earned' && 'ได้รับใบประกาศนียบัตร'}
        {status === 'below_threshold' && `คะแนนไม่ถึงเกณฑ์ (${passThresholdPercent}%) — ยังไม่ได้รับใบประกาศ`}
        {status === 'locked' && 'เรียนให้ครบเพื่อรับใบประกาศนียบัตร'}
      </span>
    </div>
  )
}

// ── Step Icon ─────────────────────────────────────────────────────────────────
function StepIcon({
  index, done, locked, active, small,
}: {
  index: number; done: boolean; locked: boolean; active: boolean; small?: boolean
}) {
  const size = small ? 'size-5 text-xs' : 'size-7 text-xs'
  if (locked) return (
    <div className={`${size} rounded-full border-2 border-gray-200 flex items-center justify-center shrink-0`}>
      <svg className={small ? 'size-3' : 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    </div>
  )
  if (done) return (
    <div className={`${size} rounded-full bg-freshket-500 flex items-center justify-center shrink-0`}>
      <svg className={small ? 'size-3' : 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </div>
  )
  return (
    <div className={`${size} rounded-full flex items-center justify-center shrink-0 font-bold ${
      active ? 'bg-white text-freshket-600' : 'border-2 border-gray-200 text-gray-400'
    }`}>
      {index}
    </div>
  )
}

// ── Step Content ──────────────────────────────────────────────────────────────
function StepContent({
  step,
  course,
  done,
  progress,
  courseId,
  onMarkSlideDone,
  onStartAssessment,
  onOpenGoogleForm,
  onMarkFormDone,
  onMarkTakeAwayDone,
  onLessonComplete,
  onNext,
  hasNext,
}: {
  step: StepDef
  course: Course
  done: boolean
  progress: Progress
  courseId: string
  onMarkSlideDone: () => void
  onStartAssessment: (id: string, step: 'pre' | 'post') => void
  onOpenGoogleForm: (url: string, step: 'pre' | 'post') => void
  onMarkFormDone: (step: 'pre' | 'post') => void
  onMarkTakeAwayDone: (text: string) => void
  onLessonComplete: (lessonId: string) => void
  onNext: () => void
  hasNext: boolean
}) {
  if (step.id === 'pre') return (
    <AssessmentStep
      label="ก่อนเรียน"
      description="ทำแบบทดสอบก่อนเรียนเพื่อวัดความรู้พื้นฐาน"
      courseTitle={course.title}
      assessmentType={course.assessmentType}
      assessmentId={course.preAssessmentId}
      formUrl={course.preFormUrl}
      done={done}
      onStart={() => {
        if (course.assessmentType === 'self' && course.preAssessmentId)
          onStartAssessment(course.preAssessmentId, 'pre')
      }}
      onOpenForm={() => { if (course.preFormUrl) onOpenGoogleForm(course.preFormUrl, 'pre') }}
      onMarkDone={() => onMarkFormDone('pre')}
      onNext={onNext}
      hasNext={hasNext}
    />
  )

  if (step.id === 'post') return (
    <AssessmentStep
      label="หลังเรียน"
      description="ทำแบบทดสอบหลังเรียนเพื่อวัดความเข้าใจ"
      courseTitle={course.title}
      assessmentType={course.assessmentType}
      assessmentId={course.postAssessmentId}
      formUrl={course.postFormUrl}
      done={done}
      onStart={() => {
        if (course.assessmentType === 'self' && course.postAssessmentId)
          onStartAssessment(course.postAssessmentId, 'post')
      }}
      onOpenForm={() => { if (course.postFormUrl) onOpenGoogleForm(course.postFormUrl, 'post') }}
      onMarkDone={() => onMarkFormDone('post')}
      onNext={onNext}
      hasNext={hasNext}
    />
  )

  if (step.id === 'takeaway') return (
    <TakeAwayStep
      course={course}
      courseId={courseId}
      done={done}
      onDone={onMarkTakeAwayDone}
      onNext={onNext}
      hasNext={hasNext}
    />
  )

  // Slide step
  return (
    <SlideStep
      course={course} done={done} onDone={onMarkSlideDone} onNext={onNext} hasNext={hasNext}
      completedLessonIds={progress.completedLessonIds ?? []}
      onLessonComplete={onLessonComplete}
    />
  )
}

// ── Slide Step ────────────────────────────────────────────────────────────────
const MEDIA_LABELS: Record<MediaType, string> = {
  google_slides: 'Google Slides',
  youtube:       'YouTube',
  google_drive:  'Google Drive',
  unknown:       'สื่อการสอน',
}

function SlideStep({
  course, done, onDone, onNext, hasNext, completedLessonIds, onLessonComplete,
}: {
  course: Course; done: boolean; onDone: () => void; onNext: () => void; hasNext: boolean
  completedLessonIds: string[]; onLessonComplete: (lessonId: string) => void
}) {
  if (course.topics && course.topics.length > 0) {
    return (
      <LessonBrowserStep
        course={course} done={done} onDone={onDone} onNext={onNext} hasNext={hasNext}
        completedLessonIds={completedLessonIds} onLessonComplete={onLessonComplete}
      />
    )
  }

  const media = toEmbedUrl(course.slideUrl ?? '')
  const rawUrl = course.slideUrl ?? ''

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-xl bg-freshket-100 flex items-center justify-center text-freshket-600 shrink-0">
          {media?.type === 'youtube' ? (
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          ) : media?.type === 'google_drive' ? (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          ) : (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-gray-900 truncate">{course.title}</h2>
          <p className="text-xs text-gray-400">{media ? MEDIA_LABELS[media.type] : 'สื่อการสอน'}</p>
        </div>
        <div className="flex items-center gap-2">
          {done && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-freshket-100 text-freshket-700">
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              เรียนจบแล้ว
            </span>
          )}
          {rawUrl && (
            <a href={rawUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-normal text-gray-400 hover:text-freshket-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              เปิดใน Tab ใหม่
            </a>
          )}
        </div>
      </div>

      {/* Media embed — fills viewport height */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex-1 min-h-0"
        style={{ height: 'calc(100dvh - 240px)', minHeight: '380px' }}>
        {media ? (
          <iframe
            src={media.embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            title={course.title}
            style={{ border: 'none' }}
          />
        ) : (
          /* Placeholder — demo URL or unrecognized format */
          <div className="h-full bg-gradient-to-br from-slate-50 to-freshket-50 flex flex-col items-center justify-center gap-5">
            <div className="size-20 rounded-2xl bg-freshket-100 flex items-center justify-center">
              <svg className="size-10 text-freshket-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
            <div className="text-center px-8">
              <p className="text-sm font-bold text-gray-700">สื่อการสอน</p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                ไม่สามารถแสดง preview ได้<br />
                รองรับ: Google Slides, YouTube, Google Drive
              </p>
            </div>
            {rawUrl && (
              <a href={rawUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors shadow-sm">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                เปิดสื่อการสอน
              </a>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex gap-3 shrink-0">
        {!done ? (
          <button onClick={onDone}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all flex items-center justify-center gap-2 shadow-sm">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            เรียนจบแล้ว
          </button>
        ) : hasNext ? (
          <button onClick={onNext}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all flex items-center justify-center gap-2 shadow-sm">
            ไปขั้นตอนถัดไป
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-freshket-50 text-freshket-700 text-sm font-bold border border-freshket-200">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            เรียนจบหลักสูตรแล้ว!
          </div>
        )}
      </div>
    </div>
  )
}

// ── Lesson Browser (renders course.topics curriculum, when present) ───────────
function LessonTypeIcon({ type, className }: { type: LessonType; className?: string }) {
  const cls = className ?? 'size-4'
  if (type === 'video') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-2.72a.75.75 0 011.28.53v7.38a.75.75 0 01-1.28.53l-4.72-2.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-7.5A2.25 2.25 0 0013.5 6.75h-9A2.25 2.25 0 002.25 9v7.5a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
  if (type === 'article') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
  if (type === 'file') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2.75" y="5.75" width="18.5" height="12.5" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21h9M12 18.25V21" />
    </svg>
  )
  if (type === 'link') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  )
  if (type === 'quiz') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  )
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function firstLessonKey(topics: CourseTopic[]): string | null {
  for (const t of topics) {
    if (t.lessons.length > 0) return `${t.id}:${t.lessons[0].id}`
  }
  return null
}

function LessonBrowserStep({
  course, done, onDone, onNext, hasNext, completedLessonIds, onLessonComplete,
}: {
  course: Course; done: boolean; onDone: () => void; onNext: () => void; hasNext: boolean
  completedLessonIds: string[]; onLessonComplete: (lessonId: string) => void
}) {
  const router = useRouter()
  const topics = course.topics ?? []
  const [selectedKey, setSelectedKey] = useState<string | null>(() => firstLessonKey(topics))
  const [assignmentDraft, setAssignmentDraft] = useState('')
  // Keys of YouTube video lessons the learner has watched ≥95% without skipping.
  const [watchedVideos, setWatchedVideos] = useState<Set<string>>(new Set())

  let selectedTopic: CourseTopic | undefined
  let selectedLesson: CourseLesson | undefined
  if (selectedKey) {
    const [tId, lId] = selectedKey.split(':')
    selectedTopic = topics.find((t) => t.id === tId)
    selectedLesson = selectedTopic?.lessons.find((l) => l.id === lId)
  }

  // Non-video lessons complete on open (there's nothing further to gate on).
  // Video lessons are NOT auto-completed here — they only count once the gated
  // player reports ≥95% watched, preserving the anti-skip rule.
  // The callback is held in a ref so this fires on lesson change only, not on
  // every parent re-render (the parent recreates onLessonComplete each render).
  const onLessonCompleteRef = useRef(onLessonComplete)
  onLessonCompleteRef.current = onLessonComplete
  const selectedLessonId = selectedLesson?.id
  const selectedLessonType = selectedLesson?.type
  useEffect(() => {
    if (!selectedLessonId || selectedLessonType === 'video') return
    onLessonCompleteRef.current(selectedLessonId)
  }, [selectedLessonId, selectedLessonType])

  // Every YouTube-video lesson must be watched before the media step can be
  // marked done — this is the anti-skip gate (non-YouTube media isn't enforceable).
  const requiredVideoKeys = topics.flatMap((t) =>
    t.lessons.filter((l) => l.type === 'video' && youtubeVideoId(l.videoUrl)).map((l) => `${t.id}:${l.id}`),
  )
  const allVideosWatched = requiredVideoKeys.every((k) => watchedVideos.has(k))
  const selectedVideoId = selectedLesson?.type === 'video' ? youtubeVideoId(selectedLesson.videoUrl) : null

  function startQuiz(assessmentId: string) {
    sessionStorage.setItem('assessment_return', JSON.stringify({ courseId: course.id, step: 'pre' }))
    router.push(`/assessment/${assessmentId}`)
  }

  const media = selectedLesson?.type === 'video' && selectedLesson.videoUrl ? toEmbedUrl(selectedLesson.videoUrl) : null

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-xl bg-freshket-100 flex items-center justify-center text-freshket-600 shrink-0">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-gray-900 truncate">{course.title}</h2>
          <p className="text-xs text-gray-400">สื่อการสอน · {topics.reduce((s, t) => s + t.lessons.length, 0)} บทเรียน</p>
        </div>
        {done && (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-freshket-100 text-freshket-700 shrink-0">
            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            เรียนจบแล้ว
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-4" style={{ height: 'calc(100dvh - 240px)', minHeight: '380px' }}>
        {/* Left: topic/lesson nav */}
        <div className="w-64 shrink-0 bg-white rounded-2xl border border-gray-100 overflow-y-auto p-2 space-y-2">
          {topics.map((topic) => (
            <div key={topic.id}>
              <p className="text-xs font-bold text-gray-500 px-2 py-1.5">{topic.title}</p>
              <div className="space-y-0.5">
                {topic.lessons.map((lesson) => {
                  const key = `${topic.id}:${lesson.id}`
                  const isActive = selectedKey === key
                  const isComplete = completedLessonIds.includes(lesson.id)
                  return (
                    <button key={lesson.id} type="button" onClick={() => setSelectedKey(key)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${isActive ? 'bg-freshket-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                      <LessonTypeIcon type={lesson.type} className="size-3.5 shrink-0" />
                      <span className="flex-1 truncate">{lesson.title}</span>
                      {isComplete && (
                        <svg className={`size-3.5 shrink-0 ${isActive ? 'text-white' : 'text-freshket-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right: content viewer */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 overflow-y-auto p-6">
          {!selectedLesson ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">เลือกบทเรียนทางซ้าย</div>
          ) : (
            <div className="space-y-4 max-w-2xl">
              <h3 className="text-base font-bold text-gray-900">{selectedLesson.title}</h3>
              {selectedLesson.description && <p className="text-xs text-gray-400">{selectedLesson.description}</p>}

              {selectedLesson.type === 'video' && (
                selectedVideoId ? (
                  // YouTube → anti-seek gated player (must watch linearly to pass)
                  <YouTubeGatedPlayer
                    key={selectedKey}
                    videoId={selectedVideoId}
                    watched={watchedVideos.has(selectedKey!)}
                    onComplete={() => {
                      setWatchedVideos((s) => new Set(s).add(selectedKey!))
                      onLessonComplete(selectedLesson!.id)
                    }}
                  />
                ) : media ? (
                  // Non-YouTube (Drive/Slides) → plain embed, no seek enforcement
                  <div className="rounded-xl overflow-hidden border border-gray-100" style={{ aspectRatio: '16/9' }}>
                    <iframe src={media.embedUrl} className="w-full h-full" allowFullScreen title={selectedLesson.title} style={{ border: 'none' }} />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">ไม่สามารถแสดง preview วิดีโอได้</p>
                )
              )}

              {selectedLesson.type === 'article' && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedLesson.articleBody}</p>
              )}

              {selectedLesson.type === 'file' && selectedLesson.fileUrl && (
                toEmbedUrl(selectedLesson.fileUrl) ? (
                  <div className="rounded-xl overflow-hidden border border-gray-100" style={{ aspectRatio: '16/9' }}>
                    <iframe src={toEmbedUrl(selectedLesson.fileUrl)!.embedUrl} className="w-full h-full" allowFullScreen title={selectedLesson.title} style={{ border: 'none' }} />
                  </div>
                ) : (
                  // Not a Google Slides/Drive link — e.g. a plain publicly-shared file — so
                  // there's no embeddable URL to build; open it in a new tab instead.
                  <a href={selectedLesson.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">
                    เปิดเอกสาร
                  </a>
                )
              )}

              {selectedLesson.type === 'link' && selectedLesson.linkUrl && (
                <a href={selectedLesson.linkUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">
                  เปิดลิงก์ภายนอก
                </a>
              )}

              {selectedLesson.type === 'quiz' && selectedLesson.assessmentId && (
                <button onClick={() => startQuiz(selectedLesson!.assessmentId!)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">
                  เริ่มทำแบบฝึกหัด
                </button>
              )}

              {selectedLesson.type === 'assignment' && (
                <div className="space-y-2">
                  {selectedLesson.assignmentPrompt && <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedLesson.assignmentPrompt}</p>}
                  <textarea rows={4} value={assignmentDraft} onChange={(e) => setAssignmentDraft(e.target.value)}
                    placeholder="พิมพ์คำตอบของคุณที่นี่..."
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 shrink-0">
        {!done && requiredVideoKeys.length > 0 && !allVideosWatched && (
          <p className="text-xs font-bold text-amber-600 text-center">
            ดูวิดีโอให้ครบทุกบทเรียนก่อนจึงจะจบขั้นตอนนี้ได้ ({requiredVideoKeys.filter((k) => watchedVideos.has(k)).length}/{requiredVideoKeys.length})
          </p>
        )}
        <div className="flex gap-3">
        {!done ? (
          <button onClick={onDone} disabled={!allVideosWatched}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-freshket-500">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            เรียนจบแล้ว
          </button>
        ) : hasNext ? (
          <button onClick={onNext}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all flex items-center justify-center gap-2 shadow-sm">
            ไปขั้นตอนถัดไป
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-freshket-50 text-freshket-700 text-sm font-bold border border-freshket-200">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            เรียนจบหลักสูตรแล้ว!
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

// ── Key Take Away Step ────────────────────────────────────────────────────────
function TakeAwayStep({
  course,
  courseId,
  done,
  onDone,
  onNext,
  hasNext,
}: {
  course: Course
  courseId: string
  done: boolean
  onDone: (text: string) => void
  onNext: () => void
  hasNext: boolean
}) {
  const prompt = course.keyTakeAwayPrompt?.trim() || 'สรุปสิ่งที่คุณได้เรียนรู้จากหลักสูตรนี้'
  const { user } = useAuth()
  const [text, setText] = useState('')
  // Seeded in an effect rather than useState's initializer because the draft is
  // keyed by uid, which isn't resolved yet on the first render.
  useEffect(() => {
    if (user?.uid) setText(loadTakeAway(user.uid, courseId))
  }, [user?.uid, courseId])
  const canSubmit = text.trim().length >= 10

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-xl flex items-center justify-center ${done ? 'bg-freshket-100 text-freshket-600' : 'bg-purple-50 text-purple-500'}`}>
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">Key Take Away</h2>
          <p className="text-xs text-gray-400">สรุปสิ่งที่ได้เรียนรู้หลังจบหลักสูตร</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        {done && (
          <div className="flex items-center gap-2 text-xs text-freshket-700 bg-freshket-50 border border-freshket-200 px-3 py-2 rounded-xl">
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            บันทึก Key Take Away แล้ว — สามารถแก้ไขได้
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-gray-700 block mb-2">{prompt}</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="เขียนสิ่งที่คุณได้เรียนรู้ สิ่งที่จะนำไปปรับใช้กับงาน หรือข้อสังเกตที่น่าสนใจ..."
            className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none leading-relaxed"
          />
          <p className="text-xs text-gray-400 mt-1.5 text-right">{text.trim().length} ตัวอักษร (ขั้นต่ำ 10)</p>
        </div>

        <button
          onClick={() => { if (canSubmit) onDone(text.trim()) }}
          disabled={!canSubmit}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          {done ? 'บันทึกอีกครั้ง' : 'บันทึก Key Take Away'}
        </button>
      </div>

      {done && hasNext && (
        <button onClick={onNext}
          className="w-full py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
          ถัดไป
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Assessment Step (pre / post) ──────────────────────────────────────────────
function AssessmentStep({
  label,
  description,
  courseTitle,
  assessmentType,
  assessmentId,
  formUrl,
  done,
  onStart,
  onOpenForm,
  onMarkDone,
  onNext,
  hasNext,
}: {
  label: string
  description: string
  courseTitle?: string
  assessmentType?: 'self' | 'google_form'
  assessmentId?: string
  formUrl?: string
  done: boolean
  onStart: () => void
  onOpenForm: () => void
  onMarkDone: () => void
  onNext: () => void
  hasNext: boolean
}) {
  const [formOpened, setFormOpened] = useState(false)
  const isSelf = assessmentType === 'self' || (!assessmentType && !!assessmentId)
  const isForm = assessmentType === 'google_form' || (!assessmentId && !!formUrl)
  const embedUrl = formUrl ? toFormEmbedUrl(formUrl) : null

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-xl flex items-center justify-center ${done ? 'bg-freshket-100 text-freshket-600' : 'bg-blue-50 text-blue-500'}`}>
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">แบบทดสอบ{label}</h2>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        {done ? (
          /* Done state */
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="size-16 rounded-full bg-freshket-100 flex items-center justify-center">
              <svg className="size-8 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-freshket-600">ทำแบบทดสอบเสร็จแล้ว</p>
            {hasNext && (
              <button onClick={onNext}
                className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all">
                ไปขั้นตอนถัดไป
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}
          </div>
        ) : isSelf && assessmentId ? (
          /* Self-created assessment */
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-700">
              <p className="font-bold mb-1">แบบทดสอบสร้างในระบบ</p>
              <p className="text-xs text-blue-600">ตอบทีละข้อ กดส่งคำตอบเมื่อเสร็จ ผลจะถูกบันทึกอัตโนมัติ</p>
            </div>
            <button onClick={onStart}
              className="w-full py-3 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all flex items-center justify-center gap-2">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              เริ่มทำแบบทดสอบ
            </button>
          </div>
        ) : isForm && formUrl ? (
          /* Google Form — embedded or new-tab fallback */
          <div className="space-y-4">
            {embedUrl ? (
              /* Embeddable URL → show iframe inline */
              !formOpened ? (
                <>
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm">
                    {courseTitle && <p className="font-bold text-blue-900 mb-0.5 truncate">{courseTitle}</p>}
                    <p className="font-bold text-blue-800 mb-1">แบบทดสอบ{label} — Google Form</p>
                    <p className="text-xs text-blue-600">แบบฟอร์มจะแสดงในหน้านี้เลย ไม่ต้องเปิด tab ใหม่</p>
                  </div>
                  <button onClick={() => setFormOpened(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-bold bg-blue-500 text-white hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                    เริ่มทำแบบทดสอบ
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                    <iframe
                      src={embedUrl}
                      width="100%"
                      height="640"
                      frameBorder={0}
                      marginHeight={0}
                      marginWidth={0}
                      title={`แบบทดสอบ${label}`}
                    >
                      กำลังโหลด...
                    </iframe>
                  </div>
                  <button onClick={onMarkDone}
                    className="w-full py-2.5 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all flex items-center justify-center gap-2">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    ฉันทำเสร็จแล้ว
                  </button>
                </>
              )
            ) : (
              /* Non-embeddable URL (forms.gle short link, etc.) → open new tab */
              <>
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-700">
                  {courseTitle && <p className="font-bold text-amber-800 mb-0.5 truncate">{courseTitle}</p>}
                  <p className="font-bold mb-1">แบบทดสอบ{label} — Google Form</p>
                  <p className="text-xs text-amber-600">จะเปิดในหน้าต่างใหม่ เมื่อทำเสร็จให้กด &quot;ฉันทำเสร็จแล้ว&quot;</p>
                </div>
                <button onClick={() => { setFormOpened(true); onOpenForm() }}
                  className="w-full py-2.5 rounded-xl text-sm font-bold bg-blue-500 text-white hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  เปิด Google Form
                </button>
                {formOpened && (
                  <button onClick={onMarkDone}
                    className="w-full py-2.5 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all flex items-center justify-center gap-2">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    ฉันทำเสร็จแล้ว
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">ไม่มีแบบทดสอบสำหรับขั้นตอนนี้</p>
        )}
      </div>
    </div>
  )
}

// ── Course Results Dashboard ──────────────────────────────────────────────────

type UserRow = {
  user: UserProfile
  record: TrainingRecord | null
  teamName: string
  deptName: string
}

const STATUS_FILTER_OPTS: { label: string; value: TrainingStatus | 'not_started' | 'all' }[] = [
  { label: 'ทั้งหมด',    value: 'all' },
  { label: 'ผ่านแล้ว',   value: 'completed' },
  { label: 'สอบตก',      value: 'failed' },
  { label: 'กำลังเรียน', value: 'in_progress' },
  { label: 'ยังไม่เริ่ม', value: 'not_started' },
]

function scoreColor(score: number) {
  if (score >= 75) return 'text-freshket-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-rose-600'
}

function scoreBarColor(score: number) {
  if (score >= 75) return '#00ce7c'
  if (score >= 60) return '#f59e0b'
  return '#f43f5e'
}

function formatDate(d?: Date) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function CourseResultsDashboard({
  courseId,
  course,
  allRecords,
  allUsers,
  teams,
  departments,
}: {
  courseId: string
  course: Course | null
  allRecords: TrainingRecord[]
  allUsers: UserProfile[]
  teams: Team[]
  departments: Department[]
}) {
  const [filterDept, setFilterDept]     = useState('all')
  const [filterTeam, setFilterTeam]     = useState('all')
  const [filterStatus, setFilterStatus] = useState<'all' | TrainingStatus>('all')
  const [search, setSearch]             = useState('')

  // Build rows: users in targetRoles + their record for this course
  const rows = useMemo<UserRow[]>(() => {
    const targetRoles = course?.targetRoles ?? []
    const targetUsers = allUsers.filter(u =>
      targetRoles.length === 0 || targetRoles.includes(u.role)
    )
    return targetUsers.map(u => {
      const record = allRecords.find(r => r.userId === u.uid && r.courseId === courseId) ?? null
      const team = teams.find(t => t.id === u.teamId)
      return {
        user: u,
        record,
        teamName: team?.name ?? u.teamId ?? '-',
        deptName: u.department ?? '-',
      }
    })
  }, [allUsers, allRecords, teams, course, courseId])

  // Stats
  const stats = useMemo(() => {
    const total     = rows.length
    const passed    = rows.filter(r => r.record?.status === 'completed').length
    const failed    = rows.filter(r => r.record?.status === 'failed').length
    // `!= null` (not `!== undefined`): CSV-imported records store `score: null`
    // for status-only rows, and null survived the old filter — then reduced as 0,
    // silently dragging the average-score card down for every unscored learner.
    const scores    = rows.map(r => r.record?.score).filter((s): s is number => s != null)
    const avgScore  = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const passRate  = total > 0 ? Math.round((passed / total) * 100) : 0
    return { total, passed, failed, avgScore, passRate }
  }, [rows])

  // Dept options derived from rows (distinct departments)
  const deptOptions = useMemo(() => {
    const depts = Array.from(new Set(rows.map(r => r.deptName).filter(d => d !== '-')))
    return depts
  }, [rows])

  // Team options filtered by selected dept
  const teamOptions = useMemo(() => {
    const source = filterDept === 'all' ? rows : rows.filter(r => r.deptName === filterDept)
    const ts = Array.from(new Set(source.map(r => r.teamName).filter(t => t !== '-')))
    return ts
  }, [rows, filterDept])

  // Apply filters
  const filtered = useMemo(() => {
    return rows.filter(r => {
      const rowStatus: TrainingStatus | 'not_started' = r.record?.status ?? 'not_started'
      if (filterDept   !== 'all' && r.deptName  !== filterDept)   return false
      if (filterTeam   !== 'all' && r.teamName  !== filterTeam)   return false
      if (filterStatus !== 'all' && rowStatus   !== filterStatus)  return false
      if (search) {
        const q = search.toLowerCase()
        return (
          r.user.displayName.toLowerCase().includes(q) ||
          (r.user.nickname ?? '').toLowerCase().includes(q) ||
          (r.user.employeeId ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [rows, filterDept, filterTeam, filterStatus, search])

  // Reset team filter when dept changes
  useEffect(() => { setFilterTeam('all') }, [filterDept])

  if (!course) return null

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ผู้เรียนทั้งหมด */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-xs text-gray-500 font-normal">ผู้เรียนทั้งหมด</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-400 mt-1">คน</p>
        </div>

        {/* ผ่านแล้ว */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-9 rounded-xl bg-freshket-100 flex items-center justify-center text-freshket-600 shrink-0">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs text-gray-500 font-normal">ผ่านแล้ว</p>
          </div>
          <p className="text-3xl font-bold text-freshket-600">{stats.passed}</p>
          <p className="text-xs text-gray-400 mt-1">คน · <span className="font-bold text-freshket-600">{stats.passRate}%</span> ของทั้งหมด</p>
        </div>

        {/* สอบตก */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 shrink-0">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs text-gray-500 font-normal">สอบตก</p>
          </div>
          <p className="text-3xl font-bold text-rose-600">{stats.failed}</p>
          <p className="text-xs text-gray-400 mt-1">คน</p>
        </div>

        {/* คะแนนเฉลี่ย */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="text-xs text-gray-500 font-normal">คะแนนเฉลี่ย</p>
          </div>
          <p className={`text-3xl font-bold ${scoreColor(stats.avgScore)}`}>{stats.avgScore > 0 ? stats.avgScore : '-'}</p>
          <p className="text-xs text-gray-400 mt-1">{stats.avgScore > 0 ? 'คะแนน / 100' : 'ยังไม่มีข้อมูล'}</p>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-3">

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / รหัสพนักงาน..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
            />
          </div>

          {/* Dept filter */}
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white text-gray-700 font-normal"
          >
            <option value="all">แผนกทั้งหมด</option>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* Team filter */}
          <select
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white text-gray-700 font-normal"
          >
            <option value="all">ทีมทั้งหมด</option>
            {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Status pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTER_OPTS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilterStatus(opt.value as 'all' | TrainingStatus)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150 ${
                  filterStatus === opt.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Result count */}
          <span className="text-xs text-gray-400 ml-auto shrink-0">
            {filtered.length} คน
          </span>
        </div>
      </div>

      {/* ── User table ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">ไม่พบข้อมูลที่ตรงกับตัวกรอง</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-bold text-gray-400 px-5 py-3">ชื่อ-นามสกุล</th>
                  <th className="text-left text-xs font-bold text-gray-400 px-3 py-3 hidden md:table-cell">แผนก</th>
                  <th className="text-left text-xs font-bold text-gray-400 px-3 py-3 hidden lg:table-cell">ทีม</th>
                  <th className="text-left text-xs font-bold text-gray-400 px-3 py-3">สถานะ</th>
                  <th className="text-left text-xs font-bold text-gray-400 px-3 py-3">คะแนน</th>
                  <th className="text-left text-xs font-bold text-gray-400 px-3 py-3 hidden lg:table-cell">วันที่</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(row => {
                  const status: TrainingStatus | 'not_started' = row.record?.status ?? 'not_started'
                  const score = row.record?.score
                  // != null so a CSV-imported `score: null` renders as "no score"
                  // instead of a 0-width bar and a false red "failing" colour.
                  const hasScore = score != null

                  const statusBadge = {
                    completed:   { cls: 'bg-freshket-100 text-freshket-700 border-freshket-200', label: 'ผ่าน' },
                    failed:      { cls: 'bg-rose-100 text-rose-700 border-rose-200',             label: 'ไม่ผ่าน' },
                    in_progress: { cls: 'bg-blue-100 text-blue-700 border-blue-200',             label: 'กำลังเรียน' },
                    not_started: { cls: 'bg-gray-100 text-gray-500 border-gray-200',             label: 'ยังไม่เริ่ม' },
                  }[status]

                  return (
                    <tr key={row.user.uid} className="hover:bg-gray-50 transition-colors">
                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                            {(row.user.nickname ?? row.user.displayName).charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{row.user.displayName}</p>
                            {(row.user.nickname || row.user.employeeId) && (
                              <p className="text-xs text-gray-400 truncate">
                                {row.user.nickname}{row.user.nickname && row.user.employeeId ? ' · ' : ''}{row.user.employeeId ?? ''}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Dept */}
                      <td className="px-3 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-gray-600">{row.deptName}</span>
                      </td>

                      {/* Team */}
                      <td className="px-3 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-gray-600">{row.teamName}</span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${statusBadge.cls}`}>
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* Score */}
                      <td className="px-3 py-3.5">
                        {hasScore ? (
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${score}%`, background: scoreBarColor(score) }}
                              />
                            </div>
                            <span className={`text-sm font-bold tabular shrink-0 ${scoreColor(score)}`}>
                              {score}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-3 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-gray-400">
                          {formatDate(row.record?.completedAt)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
