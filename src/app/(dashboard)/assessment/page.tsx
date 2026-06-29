'use client'

import { useState, useCallback } from 'react'
import { addDoc, collection, Timestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { useAssessments } from '@/hooks/useFirestore'
import {
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_COLORS,
  type Assessment,
  type Question,
  type QuestionType,
  type Choice,
  type DragPair,
} from '@/types/assessment'
import { getClientFirestore } from '@/lib/firebase/client'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

function fmtDate(d: Date | string | undefined) {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AssessmentPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { data: assessments, loading } = useAssessments()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Assessment | null>(null)
  const [localCreated, setLocalCreated] = useState<Assessment[]>([])
  const [localUpdated, setLocalUpdated] = useState<Record<string, Partial<Assessment>>>({})
  const [localDeleted, setLocalDeleted] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<Assessment | null>(null)
  const [deleting, setDeleting] = useState(false)

  if (user && user.role !== 'super_admin') {
    router.replace('/courses')
    return null
  }

  const all = [
    ...localCreated.filter((a) => !localDeleted.has(a.id)),
    ...assessments
      .filter((a) => !localDeleted.has(a.id))
      .map((a) => ({ ...a, ...(localUpdated[a.id] ?? {}) })),
  ]

  function handleSave(assessment?: Assessment) {
    if (!assessment) {
      // Firebase Live create — Firestore onSnapshot handles display
      setShowCreate(false)
      setEditTarget(null)
      return
    }
    if (localCreated.some((a) => a.id === assessment.id)) {
      setLocalCreated((prev) => prev.map((a) => (a.id === assessment.id ? assessment : a)))
    } else if (assessments.some((a) => a.id === assessment.id)) {
      setLocalUpdated((prev) => ({ ...prev, [assessment.id]: assessment }))
    } else {
      setLocalCreated((prev) => [assessment, ...prev])
    }
    setShowCreate(false)
    setEditTarget(null)
  }

  async function togglePublish(assessment: Assessment) {
    const next = !assessment.isPublished
    if (!DEMO_MODE) {
      const db = getClientFirestore()
      await updateDoc(doc(db, 'assessments', assessment.id), { isPublished: next })
    }
    setLocalUpdated((prev) => ({ ...prev, [assessment.id]: { isPublished: next } }))
  }

  async function handleDelete(a: Assessment) {
    setDeleting(true)
    try {
      if (!DEMO_MODE) {
        const db = getClientFirestore()
        await deleteDoc(doc(db, 'assessments', a.id))
      }
      setLocalDeleted((p) => { const s = new Set(p); s.add(a.id); return s })
      setConfirmDelete(null)
    } catch (e) {
      alert('ลบไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="แบบทดสอบ" subtitle={`${all.length} ชุด`} />

      <div className="flex-1 overflow-auto p-6">

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">จัดการแบบทดสอบสำหรับหลักสูตรต่างๆ</p>
          <button
            onClick={() => { setEditTarget(null); setShowCreate(true) }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            สร้างแบบทดสอบ
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="size-12 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            <p className="text-sm">ยังไม่มีแบบทดสอบ กดสร้างเพื่อเริ่ม</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-xs font-bold text-gray-500 px-4 py-3">ชื่อแบบทดสอบ</th>
                  <th className="text-center text-xs font-bold text-gray-500 px-3 py-3 whitespace-nowrap">จำนวนข้อ</th>
                  <th className="text-center text-xs font-bold text-gray-500 px-3 py-3 whitespace-nowrap">คะแนนเต็ม</th>
                  <th className="text-center text-xs font-bold text-gray-500 px-3 py-3 whitespace-nowrap">เกณฑ์ผ่าน</th>
                  <th className="text-center text-xs font-bold text-gray-500 px-3 py-3">Status</th>
                  <th className="text-left text-xs font-bold text-gray-500 px-3 py-3 whitespace-nowrap">วันที่สร้าง</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {all.map((a) => (
                  <AssessmentRow
                    key={a.id}
                    assessment={a}
                    onEdit={() => { setEditTarget(a); setShowCreate(true) }}
                    onTogglePublish={() => togglePublish(a)}
                    onPreview={() => router.push(`/assessment/${a.id}`)}
                    onDelete={() => setConfirmDelete(a)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-pop-in bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="size-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
              <svg className="size-7 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">ลบแบบทดสอบนี้?</h3>
            <p className="text-sm text-gray-600 font-normal mb-1 line-clamp-2">{confirmDelete.title}</p>
            <p className="text-xs text-gray-400 mb-6">การลบไม่สามารถยกเลิกได้</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60">
                ยกเลิก
              </button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting ? <><span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังลบ...</> : 'ลบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <AssessmentEditor
          initial={editTarget}
          onSave={handleSave}
          onClose={() => { setShowCreate(false); setEditTarget(null) }}
          userId={user?.uid ?? ''}
        />
      )}
    </div>
  )
}

// ── Assessment Row (table) ────────────────────────────────────────────────────
function AssessmentRow({
  assessment,
  onEdit,
  onTogglePublish,
  onPreview,
  onDelete,
}: {
  assessment: Assessment
  onEdit: () => void
  onTogglePublish: () => void
  onPreview: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isForm = Boolean(assessment.googleFormUrl)
  const maxScore = assessment.questions.reduce((s, q) => s + (q.points ?? 0), 0)

  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      {/* Title */}
      <td className="px-4 py-3">
        <p className="text-sm font-bold text-gray-900 line-clamp-1">{assessment.title}</p>
        {assessment.description && (
          <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{assessment.description}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          {isForm ? (
            <span className="inline-flex items-center gap-1 text-xs font-normal px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              Google Form
            </span>
          ) : (
            (['multiple_choice', 'open_ended', 'drag_drop'] as QuestionType[]).map((type) => {
              const count = assessment.questions.filter((q) => q.type === type).length
              if (!count) return null
              return (
                <span key={type} className={`text-xs font-normal px-1.5 py-0.5 rounded-full ${QUESTION_TYPE_COLORS[type]}`}>
                  {QUESTION_TYPE_LABELS[type]} ×{count}
                </span>
              )
            })
          )}
        </div>
      </td>

      {/* Question count */}
      <td className="px-3 py-3 text-center">
        {isForm ? (
          <span className="text-sm text-gray-300">—</span>
        ) : (
          <>
            <span className="text-sm font-bold text-gray-800">{assessment.questions.length}</span>
            <span className="text-xs text-gray-400 ml-0.5">ข้อ</span>
          </>
        )}
      </td>

      {/* Max score */}
      <td className="px-3 py-3 text-center">
        {isForm ? (
          <span className="text-sm text-gray-300">—</span>
        ) : (
          <>
            <span className="text-sm font-bold text-gray-800">{maxScore}</span>
            <span className="text-xs text-gray-400 ml-0.5">คะแนน</span>
          </>
        )}
      </td>

      {/* Passing score */}
      <td className="px-3 py-3 text-center">
        <span className="text-sm font-normal text-gray-600">{assessment.passingScore}%</span>
      </td>

      {/* Status badge */}
      <td className="px-3 py-3 text-center">
        <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${
          assessment.isPublished
            ? 'bg-freshket-100 text-freshket-700 border-freshket-200'
            : 'bg-gray-100 text-gray-500 border-gray-200'
        }`}>
          {assessment.isPublished ? 'Published' : 'Draft'}
        </span>
      </td>

      {/* Created date */}
      <td className="px-3 py-3">
        <span className="text-xs text-gray-500 whitespace-nowrap">{fmtDate(assessment.createdAt)}</span>
      </td>

      {/* Kebab menu */}
      <td className="px-3 py-3 relative">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1 overflow-hidden">
                <button onClick={() => { setMenuOpen(false); onPreview() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  ดูตัวอย่าง
                </button>
                <button onClick={() => { setMenuOpen(false); onEdit() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                  แก้ไข
                </button>
                <button onClick={() => { setMenuOpen(false); onTogglePublish() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  {assessment.isPublished ? 'ยกเลิกเผยแพร่' : 'เผยแพร่'}
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button onClick={() => { setMenuOpen(false); onDelete() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-rose-600 hover:bg-rose-50 transition-colors">
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  ลบ
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Assessment Editor (create / edit) ─────────────────────────────────────────

function genId() { return `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }

function emptyQuestion(type: QuestionType, order: number): Question {
  if (type === 'multiple_choice') {
    return {
      id: genId(), order, type, text: '', points: 10,
      choices: [
        { id: genId(), text: '', isCorrect: true },
        { id: genId(), text: '', isCorrect: false },
      ],
    }
  }
  if (type === 'drag_drop') {
    return {
      id: genId(), order, type, text: '', points: 20,
      dragPairs: [
        { id: genId(), left: '', right: '' },
        { id: genId(), left: '', right: '' },
      ],
    }
  }
  return { id: genId(), order, type: 'open_ended', text: '', points: 20, sampleAnswer: '' }
}

type AssessmentMode = 'builder' | 'google_form'

function AssessmentEditor({
  initial,
  onSave,
  onClose,
  userId,
}: {
  initial: Assessment | null
  onSave: (a?: Assessment) => void
  onClose: () => void
  userId: string
}) {
  const [mode, setMode] = useState<AssessmentMode>(initial?.googleFormUrl ? 'google_form' : 'builder')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [passingScore, setPassingScore] = useState(String(initial?.passingScore ?? 70))
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? false)
  const [questions, setQuestions] = useState<Question[]>(initial?.questions ?? [])
  const [googleFormUrl, setGoogleFormUrl] = useState(initial?.googleFormUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [titleErr, setTitleErr] = useState('')
  const [formUrlErr, setFormUrlErr] = useState('')

  function addQuestion(type: QuestionType) {
    setQuestions((prev) => [...prev, emptyQuestion(type, prev.length + 1)])
  }
  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id).map((q, i) => ({ ...q, order: i + 1 })))
  }
  function updateQuestion(id: string, patch: Partial<Question>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  const handleSave = useCallback(async () => {
    if (!title.trim()) { setTitleErr('กรุณากรอกชื่อแบบทดสอบ'); return }
    if (mode === 'google_form' && !googleFormUrl.trim()) { setFormUrlErr('กรุณากรอก URL ของ Google Form'); return }
    setSaving(true)
    try {
      const now = new Date()
      const payload = {
        title: title.trim(),
        description: description.trim(),
        questions: mode === 'builder' ? questions : [],
        googleFormUrl: mode === 'google_form' ? googleFormUrl.trim() : '',
        isPublished,
        passingScore: Number(passingScore) || 70,
        createdBy: userId,
      }
      if (DEMO_MODE) {
        onSave({
          id: initial?.id ?? `local-${Date.now()}`,
          ...payload,
          createdAt: initial?.createdAt ?? now,
          updatedAt: now,
        })
      } else {
        const db = getClientFirestore()
        if (initial?.id) {
          await updateDoc(doc(db, 'assessments', initial.id), { ...payload, updatedAt: Timestamp.fromDate(now) })
          onSave({ ...initial, ...payload, updatedAt: now })
        } else {
          await addDoc(collection(db, 'assessments'), {
            ...payload, createdAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now),
          })
          onSave()
        }
      }
    } finally {
      setSaving(false)
    }
  }, [title, description, passingScore, isPublished, questions, googleFormUrl, mode, userId, initial, onSave])

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="animate-pop-in bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900">{initial ? 'แก้ไขแบบทดสอบ' : 'สร้างแบบทดสอบใหม่'}</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-xs text-gray-500">{isPublished ? 'Published' : 'Draft'}</span>
              <button type="button" onClick={() => setIsPublished((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isPublished ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform ${isPublished ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Meta */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">ชื่อแบบทดสอบ <span className="text-rose-500">*</span></label>
              <input type="text" value={title} onChange={(e) => { setTitle(e.target.value); setTitleErr('') }}
                placeholder="เช่น ทดสอบก่อนเรียน Product Knowledge"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
              />
              {titleErr && <p className="text-xs text-rose-500 mt-1">{titleErr}</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1.5">คำอธิบาย</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="วัตถุประสงค์ของแบบทดสอบนี้..."
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1.5">เกณฑ์ผ่าน (%)</label>
                <input type="number" min={0} max={100} value={passingScore} onChange={(e) => setPassingScore(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
                />
              </div>
            </div>
          </div>

          {/* Mode toggle */}
          <div>
            <p className="text-xs font-bold text-gray-600 mb-2">ประเภทแบบทดสอบ</p>
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setMode('builder')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'builder' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
                สร้างเอง
              </button>
              <button
                type="button"
                onClick={() => setMode('google_form')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'google_form' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                แนบ Google Form
              </button>
            </div>
          </div>

          {/* Google Form URL input */}
          {mode === 'google_form' && (
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="size-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="size-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-blue-800">Google Form URL</p>
                  <p className="text-xs text-blue-600 mt-0.5">ผู้เรียนจะทำแบบทดสอบผ่าน Google Form โดยตรง — ใช้ลิงก์ที่มาจาก docs.google.com/forms เพื่อรองรับการฝังในหน้าเว็บ</p>
                </div>
              </div>
              <div>
                <input
                  type="url"
                  value={googleFormUrl}
                  onChange={(e) => { setGoogleFormUrl(e.target.value); setFormUrlErr('') }}
                  placeholder="https://docs.google.com/forms/d/.../viewform"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-blue-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-gray-300"
                />
                {formUrlErr && <p className="text-xs text-rose-500 mt-1">{formUrlErr}</p>}
              </div>
            </div>
          )}

          {/* Question builder */}
          {mode === 'builder' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-600">คำถาม ({questions.length})</p>
              </div>

              {questions.map((q, idx) => (
                <QuestionEditor key={q.id} question={q} index={idx} onChange={(patch) => updateQuestion(q.id, patch)} onRemove={() => removeQuestion(q.id)} />
              ))}

              <div className="flex flex-wrap gap-2 pt-1">
                <p className="w-full text-xs text-gray-400 mb-1">เพิ่มคำถาม:</p>
                {(['multiple_choice', 'open_ended', 'drag_drop'] as QuestionType[]).map((type) => (
                  <button key={type} type="button" onClick={() => addQuestion(type)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:shadow-sm ${QUESTION_TYPE_COLORS[type]} border-transparent hover:border-current`}>
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    {QUESTION_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-normal text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-100 transition-all">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all disabled:opacity-60">
            {saving
              ? <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            }
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Question Editor ───────────────────────────────────────────────────────────
function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: Question
  index: number
  onChange: (patch: Partial<Question>) => void
  onRemove: () => void
}) {
  const typeColor = QUESTION_TYPE_COLORS[question.type]

  function updateChoice(id: string, patch: Partial<Choice>) {
    onChange({ choices: question.choices?.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  }
  function addChoice() {
    const newChoice: Choice = { id: `c-${Date.now()}`, text: '', isCorrect: false }
    onChange({ choices: [...(question.choices ?? []), newChoice] })
  }
  function removeChoice(id: string) {
    onChange({ choices: question.choices?.filter((c) => c.id !== id) })
  }
  function setCorrect(id: string) {
    onChange({ choices: question.choices?.map((c) => ({ ...c, isCorrect: c.id === id })) })
  }

  function updatePair(id: string, patch: Partial<DragPair>) {
    onChange({ dragPairs: question.dragPairs?.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }
  function addPair() {
    onChange({ dragPairs: [...(question.dragPairs ?? []), { id: `dp-${Date.now()}`, left: '', right: '' }] })
  }
  function removePair(id: string) {
    onChange({ dragPairs: question.dragPairs?.filter((p) => p.id !== id) })
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="size-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeColor}`}>
          {QUESTION_TYPE_LABELS[question.type]}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <input type="number" min={0} value={question.points}
            onChange={(e) => onChange({ points: Number(e.target.value) })}
            className="w-14 text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white text-right focus:outline-none focus:ring-1 focus:ring-freshket-300"
          />
          <span className="text-xs text-gray-400">คะแนน</span>
          <button onClick={onRemove} className="ml-1 p-1 rounded-lg hover:bg-rose-50 hover:text-rose-500 text-gray-400 transition-colors">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Question text */}
      <textarea value={question.text} onChange={(e) => onChange({ text: e.target.value })}
        placeholder="พิมพ์คำถามที่นี่..."
        rows={2}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
      />

      {/* Type-specific inputs */}
      {question.type === 'multiple_choice' && (
        <div className="space-y-2">
          {question.choices?.map((choice) => (
            <div key={choice.id} className="flex items-center gap-2">
              <button type="button" onClick={() => setCorrect(choice.id)}
                className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  choice.isCorrect ? 'border-freshket-500 bg-freshket-500' : 'border-gray-300 bg-white hover:border-freshket-300'
                }`}>
                {choice.isCorrect && (
                  <svg className="size-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
              <input type="text" value={choice.text} onChange={(e) => updateChoice(choice.id, { text: e.target.value })}
                placeholder={`ตัวเลือก ${choice.isCorrect ? '(ถูกต้อง)' : ''}`}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-freshket-300 placeholder:text-gray-300"
              />
              {(question.choices?.length ?? 0) > 2 && (
                <button onClick={() => removeChoice(choice.id)} className="p-1 text-gray-400 hover:text-rose-500 transition-colors">
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {(question.choices?.length ?? 0) < 5 && (
            <button onClick={addChoice} className="text-xs text-freshket-600 font-normal hover:underline">
              + เพิ่มตัวเลือก
            </button>
          )}
        </div>
      )}

      {question.type === 'open_ended' && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">เฉลย (ใช้อ้างอิง)</label>
          <textarea value={question.sampleAnswer ?? ''} onChange={(e) => onChange({ sampleAnswer: e.target.value })}
            rows={2} placeholder="ตัวอย่างคำตอบที่ถูกต้อง..."
            className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
          />
        </div>
      )}

      {question.type === 'drag_drop' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1 text-xs font-bold text-gray-400 px-1">
            <span>รายการ (ซ้าย)</span>
            <span>จับคู่กับ (ขวา)</span>
          </div>
          {question.dragPairs?.map((pair) => (
            <div key={pair.id} className="grid grid-cols-2 gap-2 items-center">
              <input type="text" value={pair.left} onChange={(e) => updatePair(pair.id, { left: e.target.value })}
                placeholder="รายการ..." className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-freshket-300 placeholder:text-gray-300"
              />
              <div className="flex gap-1.5 items-center">
                <input type="text" value={pair.right} onChange={(e) => updatePair(pair.id, { right: e.target.value })}
                  placeholder="คู่ที่ถูก..." className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-freshket-300 placeholder:text-gray-300"
                />
                {(question.dragPairs?.length ?? 0) > 2 && (
                  <button onClick={() => removePair(pair.id)} className="p-1 text-gray-400 hover:text-rose-500 transition-colors shrink-0">
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={addPair} className="text-xs text-freshket-600 font-normal hover:underline">
            + เพิ่มคู่
          </button>
        </div>
      )}
    </div>
  )
}
