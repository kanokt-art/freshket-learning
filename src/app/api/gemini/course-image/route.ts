import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(req: NextRequest) {
  try {
    // Only the course-authoring flow calls this (course write already requires
    // super_admin in firestore.rules) — without this gate, anyone who finds the
    // route could spend the billed GEMINI_API_KEY quota on arbitrary prompts.
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const { courseName, description } = await req.json()

    if (!courseName || typeof courseName !== 'string' || courseName.length > 200) {
      return NextResponse.json({ error: 'courseName is required' }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_OCR_MODEL ?? 'gemini-2.0-flash-lite' })

    // Not course-specific despite the field name — the course-thumbnail picker
    // was the first caller, the Tool cover-image picker reuses this same route.
    const prompt = `แนะนำ keyword ภาษาอังกฤษสำหรับค้นหารูปภาพ header ของ "${courseName}"${description ? ` (${description})` : ''}

ตอบเป็น JSON array ของ search keywords ที่เหมาะสม เช่น:
{"keywords": ["sales training", "business meeting", "professional development"], "suggestion": "คำอธิบายสั้นๆ ว่าแนะนำรูปแบบใด"}

ให้ keywords ที่ใช้กับ Unsplash หรือ Pexels ได้ดี เน้น professional, business context`

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Invalid response from Gemini' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Gemini API error:', err)
    return NextResponse.json({ error: 'Failed to generate keywords' }, { status: 500 })
  }
}
