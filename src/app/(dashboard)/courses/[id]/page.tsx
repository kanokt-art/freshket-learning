'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCourse, useAllTrainingRecords, useAllUsers, useTeams, useDepartments } from '@/hooks/useFirestore'
import { useAuth } from '@/hooks/useAuth'
import { canAccess } from '@/types/user'
import { CATEGORY_LABELS, CATEGORY_COLORS, type Course } from '@/types/course'
import { STATUS_LABELS, type TrainingStatus } from '@/types/tracking'
import type { TrainingRecord } from '@/types/tracking'
import type { UserProfile, Team, Department } from '@/types/user'

// ── Progress tracking via localStorage ───────────────────────────────────────
type Progress = { preDone: boolean; slideDone: boolean; postDone: boolean; takeawayDone: boolean }

const EMPTY_PROG: Progress = { preDone: false, slideDone: false, postDone: false, takeawayDone: false }

function loadProgress(courseId: string): Progress {
  if (typeof window === 'undefined') return EMPTY_PROG
  try {
    const raw = localStorage.getItem(`course_prog_${courseId}`)
    return raw ? { ...EMPTY_PROG, ...JSON.parse(raw) } : EMPTY_PROG
  } catch {
    return EMPTY_PROG
  }
}

function saveProgress(courseId: string, prog: Progress) {
  localStorage.setItem(`course_prog_${courseId}`, JSON.stringify(prog))
}

function loadTakeAway(courseId: string): string {
  if (typeof window === 'undefined') return ''
  try { return localStorage.getItem(`course_takeaway_${courseId}`) ?? '' } catch { return '' }
}

function saveTakeAway(courseId: string, text: string) {
  localStorage.setItem(`course_takeaway_${courseId}`, text)
}

// Derive overall course status from step progress and persist for the list page
function checkAndSaveStatus(courseId: string, course: Course, prog: Progress) {
  const steps = buildSteps(course)
  const allDone = steps.every((s) => {
    if (s.id === 'pre')      return prog.preDone
    if (s.id === 'slide')    return prog.slideDone
    if (s.id === 'takeaway') return prog.takeawayDone
    return prog.postDone
  })
  const anyDone = prog.preDone || prog.slideDone || prog.postDone || prog.takeawayDone
  localStorage.setItem(
    `course_status_${courseId}`,
    allDone ? 'completed' : anyDone ? 'in_progress' : 'not_started',
  )
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
  const { data: allRecords } = useAllTrainingRecords()
  const { data: allUsers }   = useAllUsers()
  const { data: teams }      = useTeams()
  const { data: departments } = useDepartments()

  const isAdmin = canAccess(user?.role ?? 'sale', 'team_lead')
  const [tab, setTab] = useState<'results' | 'content'>('results')

  const [progress, setProgress] = useState<Progress>(EMPTY_PROG)
  const [activeStep, setActiveStep] = useState<StepId>('pre')

  // Load progress from localStorage on mount
  useEffect(() => {
    setProgress(loadProgress(id))
  }, [id])

  // Re-read progress when user navigates back (window focus / visibility)
  const refreshProgress = useCallback(() => {
    setProgress(loadProgress(id))
  }, [id])

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
    if (!course) return
    const steps = buildSteps(course)
    const prog = loadProgress(id)
    const firstPending = steps.find((s) => !isDone(s.id, prog))
    if (firstPending) setActiveStep(firstPending.id)
    else setActiveStep(steps[steps.length - 1]?.id ?? 'slide')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
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

  function markSlideDone() {
    const next = { ...progress, slideDone: true }
    saveProgress(id, next)
    checkAndSaveStatus(id, course!, next)
    setProgress(next)
    if (course!.hasPostAssessment) setActiveStep('post')
    else if (course!.hasKeyTakeAway) setActiveStep('takeaway')
  }

  function markTakeAwayDone(text: string) {
    saveTakeAway(id, text)
    const next = { ...progress, takeawayDone: true }
    saveProgress(id, next)
    checkAndSaveStatus(id, course!, next)
    setProgress(next)
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
    saveProgress(id, next)
    checkAndSaveStatus(id, course!, next)
    setProgress(next)
    if (step === 'pre' && course!.slideUrl) setActiveStep('slide')
    else if (step === 'pre' && course!.hasKeyTakeAway) setActiveStep('takeaway')
    if (step === 'post' && course!.hasKeyTakeAway) setActiveStep('takeaway')
  }

  const currentStep = steps.find((s) => s.id === activeStep) ?? steps[0]

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4 shrink-0">
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
            <p className="text-xs text-gray-400 px-2">{course.description}</p>
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
  return <SlideStep course={course} done={done} onDone={onMarkSlideDone} onNext={onNext} hasNext={hasNext} />
}

// ── Slide Step ────────────────────────────────────────────────────────────────
const MEDIA_LABELS: Record<MediaType, string> = {
  google_slides: 'Google Slides',
  youtube:       'YouTube',
  google_drive:  'Google Drive',
  unknown:       'สื่อการสอน',
}

function SlideStep({
  course, done, onDone, onNext, hasNext,
}: {
  course: Course; done: boolean; onDone: () => void; onNext: () => void; hasNext: boolean
}) {
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
  const [text, setText] = useState(() => loadTakeAway(courseId))
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
    const scores    = rows.map(r => r.record?.score).filter((s): s is number => s !== undefined)
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
                  const hasScore = score !== undefined

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
