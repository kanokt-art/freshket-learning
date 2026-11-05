import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
import { analyzeAttempts, type AttemptRow } from '@/lib/assessment/analytics'
import type { Question } from '@/types/assessment'

// The course dashboard's numbers from quiz attempts: time taken, scores, pass/fail, the questions missed most.
// Attempts are an audit trail the browser cannot read (policies.ts), so they are summed up here for a
// super_admin, and only totals and question texts leave — never a learner's answers.

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.response

  const courseId = req.nextUrl.searchParams.get('courseId') ?? ''
  if (!ID_RE.test(courseId)) return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })

  // Optional: only tries made on or after this date.
  const sinceRaw = req.nextUrl.searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : null
  if (sinceRaw && (!since || isNaN(since.getTime()))) return NextResponse.json({ error: 'Invalid since' }, { status: 400 })

  try {
    const store = getStore()
    const rows = await store.query('assessmentAttempts', { where: [{ field: 'courseId', op: '==', value: courseId }] })
    const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(v as string).getTime() || 0 : 0)
    const attempts = rows.filter((a) => !since || time(a.createdAt) >= since.getTime()) as unknown as AttemptRow[]

    // The words of each question, from the quizzes the attempts were made on.
    const assessmentIds = Array.from(new Set(attempts.map((a) => a.assessmentId).filter(Boolean)))
    const docs = assessmentIds.length ? await store.getMany('assessments', assessmentIds) : []
    const text = new Map<string, string>()
    for (const d of docs) {
      for (const q of ((d.questions ?? []) as Question[])) text.set(`${d.id}:${q.id}`, q.text)
    }

    return NextResponse.json(analyzeAttempts(attempts, text))
  } catch (err) {
    console.error('assessment/analytics failed', err)
    return NextResponse.json({ error: 'โหลดสถิติแบบทดสอบไม่สำเร็จ' }, { status: 500 })
  }
}
