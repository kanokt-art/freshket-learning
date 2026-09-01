import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireStaff } from '@/lib/firebase/requireStaff'
import { gradeSubmission, type GivenAnswers } from '@/lib/assessment/grade'
import { computeUserStats } from '@/types/stats'
import type { Assessment, Question } from '@/types/assessment'
import type { Course } from '@/types/course'
import type { UserProfile } from '@/types/user'

// Authoritative quiz grading.
//
// This route is the fix for the worst defect in the system: grading used to run
// in the browser and the resulting score was written to localStorage, which the
// course page then mirrored into trainingRecords. Since firestore.rules only
// checked `userId == uid()` and validated nothing else, a learner could set
// `course_prog_*` to {postDone:true, postScore:100} in DevTools and have a
// fabricated 100 land in the database, indistinguishable from a real result.
//
// Now: answers come here, the server grades them against the key, and the server
// is the ONLY writer of `score` / `passScore` / `attemptCount` on the training
// record (rules deny those fields to clients). It also records an immutable
// attempt row so a submission can be reviewed or re-graded later.
//
// Deliberately NOT owned here: `status` and `completedLessonIds`. Course
// completion is assembled from lesson ticks that only the browser observes, so
// those stay client-written. That means a learner can still mark a course
// complete without a score — a smaller, separate problem than forging a score.

const MAX_ANSWERS = 200
const MAX_ANSWER_LEN = 5000
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

// Allowance for the round trip between the browser auto-submitting at 00:00 and
// the request landing here. Generous enough for a slow mobile connection, far too
// small to answer anything with.
const DEADLINE_GRACE_MS = 20_000

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * Best-effort notification to the learner's manager (or, absent a managerId,
 * every team_lead+ — same fallback shadow/page.tsx uses for the same reason:
 * an unassigned learner shouldn't go unseen). Never throws — a notification
 * failure must not undo an already-graded, already-recorded submission.
 */
async function notifyManagerOfCompletion(
  db: FirebaseFirestore.Firestore,
  uid: string,
  courseTitle: string,
  score: number,
  passed: boolean,
  courseId: string,
) {
  try {
    const learnerSnap = await db.collection('users').doc(uid).get()
    if (!learnerSnap.exists) return
    const learner = learnerSnap.data() as Partial<UserProfile>

    const name = (learner.displayNameEN?.trim() || learner.displayName || learner.email || 'พนักงาน')
      + (learner.nickname ? ` (${learner.nickname})` : '')
    const roleLine = [learner.position, learner.department].filter(Boolean).join(' · ')
    const title = `${name} เรียนจบ "${courseTitle}"`
    const body = `${roleLine ? roleLine + ' — ' : ''}${passed ? 'ทำแบบทดสอบผ่านแล้ว' : 'ทำแบบทดสอบแล้ว แต่ยังไม่ผ่านเกณฑ์'} ได้คะแนน ${score} คะแนน`

    let targetUids: string[]
    if (learner.managerId) {
      targetUids = [learner.managerId]
    } else {
      // canAccess('team_lead') passes for team_lead, manager, and super_admin —
      // an `in` query needs those roles spelled out instead.
      const leadsSnap = await db.collection('users').where('role', 'in', ['team_lead', 'manager', 'super_admin']).get()
      targetUids = leadsSnap.docs.map((d) => d.id)
    }

    const now = new Date()
    await Promise.all(targetUids.map((targetUid) =>
      db.collection('notifications').doc(targetUid).collection('items')
        .doc(`assessment_completed_${uid}_${courseId}_${now.getTime()}`)
        .set({
          type: 'assessment_completed',
          title,
          body,
          refId: courseId,
          refPath: `/courses/${courseId}`,
          read: false,
          createdAt: now,
          createdByUid: uid,
        }),
    ))
  } catch (err) {
    // Same fire-and-forget contract as the client-side pushNotification.
    console.error('notifyManagerOfCompletion failed', err)
  }
}

/** Reject payload shapes we won't grade, before touching Firestore. */
function parseAnswers(raw: unknown): GivenAnswers | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > MAX_ANSWERS) return null

  const out: GivenAnswers = {}
  for (const [qid, value] of entries) {
    if (!ID_RE.test(qid)) return null
    if (typeof value === 'string') {
      if (value.length > MAX_ANSWER_LEN) return null
      out[qid] = value
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const map: Record<string, string> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (!ID_RE.test(k) || typeof v !== 'string' || v.length > MAX_ANSWER_LEN) return null
        map[k] = v
      }
      out[qid] = map
    } else {
      return null
    }
  }
  return out
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return bad('Invalid JSON body')
  }

  const gate = await requireStaff(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response
  const uid = gate.uid

  const assessmentId = body.assessmentId
  const courseId = body.courseId
  const step = body.step
  const sessionId = body.sessionId
  const autoSubmitted = body.autoSubmitted === true

  if (typeof assessmentId !== 'string' || !ID_RE.test(assessmentId)) return bad('Invalid assessmentId')
  if (courseId !== undefined && (typeof courseId !== 'string' || !ID_RE.test(courseId))) return bad('Invalid courseId')
  if (step !== undefined && step !== 'pre' && step !== 'post') return bad('Invalid step')
  if (sessionId !== undefined && (typeof sessionId !== 'string' || !ID_RE.test(sessionId))) return bad('Invalid sessionId')

  const answers = parseAnswers(body.answers)
  if (!answers) return bad('Invalid answers payload')

  try {
    const db = getAdminFirestore()

    // ── Timed-attempt enforcement ────────────────────────────────────────────
    // The session holds the server's own start time, so a reloaded page or an
    // edited client clock can't buy extra time. Three ways a session is refused:
    // not the caller's, already used (replay), or past its deadline.
    let timedOutSession: { ref: FirebaseFirestore.DocumentReference; elapsedMs: number; limitMs: number } | null = null
    let sessionRef: FirebaseFirestore.DocumentReference | null = null

    if (typeof sessionId === 'string') {
      const sRef = db.collection('assessmentSessions').doc(sessionId)
      const sSnap = await sRef.get()
      if (!sSnap.exists) return NextResponse.json({ error: 'ไม่พบรอบการทำแบบทดสอบนี้' }, { status: 409 })

      const s = sSnap.data() as {
        uid?: string; assessmentId?: string; timeLimitMinutes?: number
        startedAt?: { toDate(): Date }; submittedAt?: unknown
      }
      if (s.uid !== uid || s.assessmentId !== assessmentId) {
        return NextResponse.json({ error: 'รอบการทำแบบทดสอบไม่ถูกต้อง' }, { status: 403 })
      }
      if (s.submittedAt) {
        return NextResponse.json({ error: 'รอบนี้ถูกส่งคำตอบไปแล้ว' }, { status: 409 })
      }

      const limitMin = Number(s.timeLimitMinutes ?? 0)
      if (limitMin > 0 && s.startedAt?.toDate) {
        const elapsedMs = Date.now() - s.startedAt.toDate().getTime()
        const limitMs = limitMin * 60_000
        if (elapsedMs > limitMs + DEADLINE_GRACE_MS) {
          timedOutSession = { ref: sRef, elapsedMs, limitMs }
        }
      }
      sessionRef = sRef
    }

    // Past the deadline: record the attempt for audit (so "they ran out of time"
    // is visible, not silent) but grade nothing and write NO score. A learner who
    // stalls past the limit has to retake — which is what a time limit means.
    if (timedOutSession) {
      await timedOutSession.ref.set(
        { submittedAt: FieldValue.serverTimestamp(), timedOut: true },
        { merge: true },
      )
      await db.collection('assessmentAttempts').doc().set({
        uid,
        assessmentId,
        ...(typeof courseId === 'string' ? { courseId } : {}),
        ...(step ? { step } : {}),
        score: 0,
        passed: false,
        timedOut: true,
        elapsedMs: timedOutSession.elapsedMs,
        limitMs: timedOutSession.limitMs,
        answers: [],
        autoSubmitted,
        createdAt: FieldValue.serverTimestamp(),
      })
      return NextResponse.json(
        { error: 'หมดเวลาทำแบบทดสอบ — คำตอบนี้ไม่ถูกบันทึก กรุณาเริ่มทำใหม่', timedOut: true },
        { status: 409 },
      )
    }

    const aSnap = await db.collection('assessments').doc(assessmentId).get()
    if (!aSnap.exists) return NextResponse.json({ error: 'ไม่พบแบบทดสอบนี้' }, { status: 404 })
    const assessment = aSnap.data() as Partial<Assessment>
    if (assessment.isPublished !== true) {
      return NextResponse.json({ error: 'แบบทดสอบนี้ยังไม่เผยแพร่' }, { status: 403 })
    }

    const questions = (assessment.questions ?? []) as Question[]
    const passingScore = typeof assessment.passingScore === 'number' ? assessment.passingScore : 70

    const graded = gradeSubmission(questions, answers)
    const passed = graded.score >= passingScore

    // Attempt number = how many rows this learner already has for this quiz.
    // Counted rather than incremented so it stays right even if a write was lost.
    const priorAttempts = await db.collection('assessmentAttempts')
      .where('uid', '==', uid)
      .where('assessmentId', '==', assessmentId)
      .count().get()
    const attemptNumber = priorAttempts.data().count + 1

    const attemptRef = db.collection('assessmentAttempts').doc()
    await attemptRef.set({
      uid,
      assessmentId,
      assessmentTitle: assessment.title ?? '',
      ...(typeof courseId === 'string' ? { courseId } : {}),
      ...(step ? { step } : {}),
      score: graded.score,
      passingScore,
      passed,
      pointsEarned: graded.pointsEarned,
      pointsPossible: graded.pointsPossible,
      attemptNumber,
      answers: graded.answers,
      autoSubmitted,
      createdAt: FieldValue.serverTimestamp(),
    })

    // Burn the session so the same one can't be replayed for a second attempt.
    if (sessionRef) {
      await sessionRef.set({ submittedAt: FieldValue.serverTimestamp(), timedOut: false }, { merge: true })
    }

    // When the quiz was launched from a course, the score belongs on that
    // learner's training record — written here, never by the client.
    if (typeof courseId === 'string') {
      const cSnap = await db.collection('courses').doc(courseId).get()
      const course = cSnap.exists ? (cSnap.data() as Partial<Course>) : undefined
      const recRef = db.collection('trainingRecords').doc(`${uid}_${courseId}`)
      const recSnap = await recRef.get()

      const payload: Record<string, unknown> = {
        userId: uid,
        courseId,
        courseTitle: course?.title ?? '',
        score: graded.score,
        attemptCount: attemptNumber,
        source: 'manual',
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (course?.quizSettings?.passThresholdPercent != null) {
        payload.passScore = course.quizSettings.passThresholdPercent
      }
      // First touch stamps only — never move an existing startedAt.
      if (!recSnap.exists || !recSnap.data()?.startedAt) {
        payload.startedAt = FieldValue.serverTimestamp()
      }
      if (!recSnap.exists) {
        // The learner may submit a quiz before any lesson tick has created the
        // record. Seed a status the client will refine; don't claim completion.
        payload.status = 'in_progress'
      }
      await recRef.set(payload, { merge: true })

      // Score moved, so the learner's rollup is stale.
      const mine = await db.collection('trainingRecords').where('userId', '==', uid).get()
      const stats = computeUserStats(
        uid,
        mine.docs.map((d) => {
          const r = d.data() as { status?: string; score?: number | null }
          return { status: r.status ?? '', score: r.score ?? null }
        }),
      )
      await db.collection('userStats').doc(uid).set(
        { ...stats, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )

      // "จบแล้ว" means the course is actually done — that's the post-assessment
      // (or a plain lesson-quiz with no pre/post concept at all), never the
      // pre-assessment, which only means the learner is just starting out.
      if (step !== 'pre') {
        await notifyManagerOfCompletion(db, uid, payload.courseTitle as string, graded.score, passed, courseId)
      }
    }

    // The per-question breakdown is returned only AFTER grading, so the reveal on
    // the result screen still works without the key ever being available up front.
    return NextResponse.json({
      score: graded.score,
      passed,
      passingScore,
      pointsEarned: graded.pointsEarned,
      pointsPossible: graded.pointsPossible,
      attemptNumber,
      results: graded.answers.map((a) => {
        const q = questions.find((x) => x.id === a.questionId)
        const correctChoice = q?.choices?.find((c) => c.isCorrect)
        return {
          questionId: a.questionId,
          correct: a.correct,
          pointsEarned: a.pointsEarned,
          pointsPossible: a.pointsPossible,
          correctLabel: correctChoice?.text ?? '',
        }
      }),
    })
  } catch (err) {
    console.error('assessment/submit failed', err)
    return NextResponse.json({ error: 'ส่งคำตอบไม่สำเร็จ' }, { status: 500 })
  }
}
