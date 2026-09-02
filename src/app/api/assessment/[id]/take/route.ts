import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireStaff } from '@/lib/firebase/requireStaff'
import { sanitizeQuestion } from '@/lib/assessment/grade'
import type { Assessment, Question } from '@/types/assessment'

// Serves a quiz to a learner WITHOUT its answer key.
//
// The take page used to read assessments/{id} straight from Firestore, and
// firestore.rules let any signed-in employee read any assessment — so every
// `choices[].isCorrect` flag and every drag_drop pairing was sitting in the
// browser before a single question was answered. Reading the doc here with the
// Admin SDK and stripping the key on the way out means the client physically
// cannot see the answers (see sanitizeQuestion).
//
// Also enforces `isPublished`, which the old client path never checked: a draft
// quiz was fully playable by URL.

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.response

  const id = params.id
  if (!id || id.includes('/')) {
    return NextResponse.json({ error: 'Invalid assessment id' }, { status: 400 })
  }

  try {
    const snap = await getAdminFirestore().collection('assessments').doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'ไม่พบแบบทดสอบนี้' }, { status: 404 })
    }

    const data = snap.data() as Partial<Assessment>
    if (data.isPublished !== true) {
      return NextResponse.json({ error: 'แบบทดสอบนี้ยังไม่เผยแพร่' }, { status: 403 })
    }

    // A Google Form assessment has no questions[] to grade or strip a key
    // from — Google owns the response collection. Hand back just enough for
    // the take-page to render the embed and skip the self-graded flow (session,
    // timer, anti-cheat, submit) entirely.
    if (data.googleFormUrl) {
      return NextResponse.json({
        id: snap.id,
        title: data.title ?? '',
        description: data.description ?? '',
        passingScore: typeof data.passingScore === 'number' ? data.passingScore : 70,
        questions: [],
        googleFormUrl: data.googleFormUrl,
      })
    }

    const questions = (data.questions ?? []) as Question[]

    return NextResponse.json({
      id: snap.id,
      title: data.title ?? '',
      description: data.description ?? '',
      passingScore: typeof data.passingScore === 'number' ? data.passingScore : 70,
      antiCheatEnabled: data.antiCheatEnabled === true,
      questions: questions
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(sanitizeQuestion),
    })
  } catch (err) {
    console.error('assessment/take failed', err)
    return NextResponse.json({ error: 'โหลดแบบทดสอบไม่สำเร็จ' }, { status: 500 })
  }
}
