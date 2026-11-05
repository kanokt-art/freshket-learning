import { analyzeAttempts, type AssessmentDef, type AttemptAnalytics, type AttemptRow } from '@/lib/assessment/analytics'

// Sample quiz results for the demo (there is no database in demo mode), so the course dashboard can be seen
// with real-looking numbers. It is built by running invented tries through the same analysis the real data
// goes through, so the screen shows exactly what live data would.

const QUIZ: AssessmentDef = {
  title: 'แบบทดสอบ Freshket Product Knowledge',
  questions: [
    {
      id: 'q1', order: 1, type: 'multiple_choice', text: 'Freshket ให้บริการลูกค้ากลุ่มใดเป็นหลัก?',
      choices: [
        { id: 'a', text: 'ผู้บริโภคทั่วไป', isCorrect: false },
        { id: 'b', text: 'ร้านอาหาร โรงแรม และ catering', isCorrect: true },
        { id: 'c', text: 'โรงงานผลิตอาหาร', isCorrect: false },
        { id: 'd', text: 'ร้านค้าปลีก', isCorrect: false },
      ],
    },
    {
      id: 'q2', order: 2, type: 'multiple_choice', text: 'ระบบ Cold Chain มีความสำคัญต่อสินค้าประเภทใดมากที่สุด?',
      choices: [
        { id: 'a', text: 'เครื่องเทศแห้ง', isCorrect: false },
        { id: 'b', text: 'ผักผลไม้และเนื้อสัตว์สด', isCorrect: true },
        { id: 'c', text: 'บรรจุภัณฑ์', isCorrect: false },
        { id: 'd', text: 'น้ำอัดลม', isCorrect: false },
      ],
    },
    {
      id: 'q3', order: 3, type: 'multiple_choice', text: 'ลูกค้าที่ไม่มีเครดิตเทอมกับ Freshket ต้องชำระเงินภายในกี่นาที?',
      choices: [
        { id: 'a', text: '5 นาที', isCorrect: false },
        { id: 'b', text: '8 นาที', isCorrect: false },
        { id: 'c', text: '15 นาที', isCorrect: true },
        { id: 'd', text: 'ไม่จำกัดเวลา', isCorrect: false },
      ],
    },
    {
      id: 'q4', order: 4, type: 'multiple_choice', text: 'การขอเครดิตเทอมต้องทำอะไรก่อน?',
      choices: [
        { id: 'a', text: 'สั่งซื้อครบ 10,000 บาท', isCorrect: false },
        { id: 'b', text: 'ยืนยันตัวตน (KYC) ทุก Account', isCorrect: true },
        { id: 'c', text: 'ใช้สำเนาบัตรประชาชนใบเดียว', isCorrect: false },
      ],
    },
    {
      id: 'q5', order: 5, type: 'multiple_choice', text: 'สินค้ากลุ่มใดได้รับการยกเว้นภาษีมูลค่าเพิ่ม (Non-VAT)?',
      choices: [
        { id: 'a', text: 'ซอสและเครื่องปรุงรส', isCorrect: false },
        { id: 'b', text: 'เนื้อสัตว์และไข่', isCorrect: true },
        { id: 'c', text: 'น้ำอัดลมและน้ำหวาน', isCorrect: false },
        { id: 'd', text: 'อาหารกระป๋อง', isCorrect: false },
      ],
    },
    {
      id: 'q6', order: 6, type: 'multiple_choice', text: 'ห้องแช่แข็ง (Frozen) ควรควบคุมอุณหภูมิไว้ที่ระดับใด?',
      choices: [
        { id: 'a', text: '0 ถึง -15 องศา', isCorrect: false },
        { id: 'b', text: '-18 ถึง -25 องศา', isCorrect: true },
        { id: 'c', text: '5 ถึง -30 องศา', isCorrect: false },
        { id: 'd', text: '8 ถึง -25 องศา', isCorrect: false },
      ],
    },
  ],
}

// How 40 people answered each question: the number who picked A, B, C, D (and nobody left it blank).
const PICKS: Record<string, Record<string, number>> = {
  q1: { a: 2, b: 34, c: 1, d: 3 },
  q2: { a: 1, b: 31, c: 5, d: 3 },
  q3: { a: 6, b: 9, c: 22, d: 3 },
  q4: { a: 7, b: 17, c: 16 },
  q5: { a: 10, b: 15, c: 11, d: 4 },
  q6: { a: 5, b: 13, c: 8, d: 14 },
}

const LEARNERS = 40

function demoAttempts(): AttemptRow[] {
  // Hand each learner one choice per question, in turn, so every count above is met exactly.
  const queues = Object.fromEntries(Object.entries(PICKS).map(([q, picks]) => [q, Object.entries(picks).flatMap(([id, n]) => Array<string>(n).fill(id))]))
  const rows: AttemptRow[] = []
  for (let i = 0; i < LEARNERS; i++) {
    const answers = QUIZ.questions.map((q) => {
      const given = queues[q.id][(i * 7) % queues[q.id].length] // spread the picks across learners
      queues[q.id].splice((i * 7) % queues[q.id].length, 1)
      return { questionId: q.id, given, correct: q.choices!.find((c) => c.id === given)?.isCorrect ?? false }
    })
    const right = answers.filter((a) => a.correct).length
    const score = Math.round((right / answers.length) * 100)
    rows.push({
      uid: `demo-${i}`, assessmentId: 'demo', step: 'post', score, passed: score >= 70,
      elapsedMs: (6 + ((i * 5) % 9)) * 60_000 + ((i * 13) % 60) * 1000, answers,
    })
  }
  // A few learners had a before-the-course try too, and two tries ran out of time.
  for (let i = 0; i < 12; i++) rows.push({ uid: `demo-${i}`, assessmentId: 'demo', step: 'pre', score: 30 + ((i * 11) % 30), passed: false, elapsedMs: (5 + (i % 6)) * 60_000, answers: [] })
  rows.push({ uid: 'demo-x1', assessmentId: 'demo', step: 'post', timedOut: true, passed: false, elapsedMs: 15 * 60_000, answers: [] })
  rows.push({ uid: 'demo-x2', assessmentId: 'demo', step: 'post', timedOut: true, passed: false, elapsedMs: 15 * 60_000, answers: [] })
  return rows
}

export function buildDemoAnalytics(): AttemptAnalytics {
  return analyzeAttempts(demoAttempts(), new Map([['demo', QUIZ]]))
}
