import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
import { analyzeAttempts, type AttemptRow, type AssessmentDef } from '@/lib/assessment/analytics'
import type { Question } from '@/types/assessment'

// The course dashboard's numbers from quiz attempts: time taken, scores, pass/fail, the questions missed most.
// Attempts are an audit trail the browser cannot read (policies.ts), so they are summed up here for a
// super_admin. What leaves is totals, the question and choice texts, and how many people picked each choice —
// never one learner's answers.

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.response

  // One course (?courseId=) or several (?courseIds=a,b,c) — a Course Design looks at all of its courses at once.
  const ids = (req.nextUrl.searchParams.get('courseIds') ?? req.nextUrl.searchParams.get('courseId') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  if (ids.length === 0 || ids.length > 50 || !ids.every((x) => ID_RE.test(x))) return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })

  // Optional: only tries made on or after this date.
  const sinceRaw = req.nextUrl.searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : null
  if (sinceRaw && (!since || isNaN(since.getTime()))) return NextResponse.json({ error: 'Invalid since' }, { status: 400 })

  try {
    const store = getStore()
    const rows = (await Promise.all(ids.map((courseId) => store.query('assessmentAttempts', { where: [{ field: 'courseId', op: '==', value: courseId }] })))).flat()
    const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(v as string).getTime() || 0 : 0)
    const attempts = rows.filter((a) => !since || time(a.createdAt) >= since.getTime()) as unknown as AttemptRow[]

    // The quizzes the attempts were made on: their questions and choices, to name what people picked.
    const assessmentIds = Array.from(new Set(attempts.map((a) => a.assessmentId).filter(Boolean)))
    const docs = assessmentIds.length ? await store.getMany('assessments', assessmentIds) : []
    const defs = new Map<string, AssessmentDef>()
    for (const d of docs) {
      defs.set(String(d.id), {
        title: String(d.title ?? ''),
        questions: ((d.questions ?? []) as Question[]).map((q) => ({
          id: q.id, order: q.order, type: q.type, text: q.text,
          choices: q.choices?.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
        })),
      })
    }

    return NextResponse.json(analyzeAttempts(attempts, defs))
  } catch (err) {
    console.error('assessment/analytics failed', err)
    return NextResponse.json({ error: 'โหลดสถิติแบบทดสอบไม่สำเร็จ' }, { status: 500 })
  }
}
