'use client'

import { useState } from 'react'
import { addDoc, updateDoc, deleteDoc, doc, collection, Timestamp } from 'firebase/firestore'
import { getClientFirestore } from '@/lib/firebase/client'
import { getDemoMode } from '@/lib/demo/demoMode'
import { useAuth } from '@/hooks/useAuth'
import { useAnnouncements, useDepartments } from '@/hooks/useFirestore'
import { Header } from '@/components/layout/Header'
import { AdministrationTabs } from '@/components/layout/AdministrationTabs'
import { ANNOUNCEMENT_BANNER, type Announcement } from '@/types/announcement'
import { ROLE_LABELS, type UserRole } from '@/types/user'

const TARGETABLE_ROLES: UserRole[] = ['sale', 'team_lead', 'manager']

// One payload shape shared by create + update.
interface AnnouncementDraft {
  title: string
  body: string
  imageUrl: string
  isPublished: boolean
  targetRoles: UserRole[]
  targetDepartments: string[]
}

function audienceLabel(a: Announcement): string {
  const roles = a.targetRoles ?? []
  const depts = a.targetDepartments ?? []
  if (roles.length === 0 && depts.length === 0) return 'ทุกคน'
  const parts: string[] = []
  if (roles.length > 0) parts.push(roles.map((r) => ROLE_LABELS[r]).join(', '))
  if (depts.length > 0) parts.push(depts.length <= 2 ? depts.join(', ') : `${depts.length} แผนก`)
  return parts.join(' · ')
}

function fmt(d: Date | string | undefined) {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AnnouncementsAdminPage() {
  const { user } = useAuth()
  const { data: announcements } = useAnnouncements()
  const { data: departmentDocs } = useDepartments()
  const allDepartments = departmentDocs.map((d) => d.name).sort()
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const isDemo = getDemoMode()

  if (user && user.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <p className="text-sm text-gray-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </div>
    )
  }

  // Returns true on success so the form knows whether to close.
  async function handleSave(payload: AnnouncementDraft, id?: string): Promise<boolean> {
    setActionError(null)
    // Demo mode has no live Firestore — mock list is read-only.
    if (isDemo) { setShowForm(false); setEditing(null); return true }
    const db = getClientFirestore()
    const shared = {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl || null,
      isPublished: payload.isPublished,
      targetRoles: payload.targetRoles,
      targetDepartments: payload.targetDepartments,
    }
    try {
      if (id) {
        await updateDoc(doc(db, 'announcements', id), {
          ...shared,
          updatedAt: Timestamp.now(),
          updatedBy: user?.uid ?? '',
        })
      } else {
        await addDoc(collection(db, 'announcements'), {
          ...shared,
          createdAt: Timestamp.now(),
          createdBy: user?.uid ?? '',
          authorName: user?.displayName ?? '',
        })
      }
      setShowForm(false)
      setEditing(null)
      return true
    } catch (e) {
      console.error('save announcement', e)
      setActionError('บันทึกข่าวไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง')
      return false
    }
  }

  async function handleDelete(a: Announcement) {
    setActionError(null)
    if (isDemo) { setConfirmDelete(null); return }
    try {
      await deleteDoc(doc(getClientFirestore(), 'announcements', a.id))
      setConfirmDelete(null)
    } catch (e) {
      console.error('delete announcement', e)
      setConfirmDelete(null)
      setActionError('ลบข่าวไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง')
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <Header title="ข่าวสาร (News Feed)" subtitle={`${announcements.length} รายการ`} />
      <AdministrationTabs />

      <div className="flex-1 overflow-auto p-6">
        <div className="w-full space-y-4">
          {actionError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-rose-600 text-sm">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {actionError}
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={() => { setEditing(null); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              โพสต์ข่าวใหม่
            </button>
          </div>

          {announcements.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
              <p className="text-sm">ยังไม่มีข่าวสาร — โพสต์ข่าวแรกของคุณ</p>
            </div>
          ) : (
            announcements.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  {a.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imageUrl} alt={a.title}
                      className="hidden sm:block w-40 aspect-[3/1] object-cover rounded-xl border border-gray-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-bold text-gray-900 truncate">{a.title}</h3>
                      {a.isPublished ? (
                        <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">เผยแพร่</span>
                      ) : (
                        <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">ฉบับร่าง</span>
                      )}
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                        {audienceLabel(a)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-gray-400 mt-2">{a.authorName ?? '—'} · {fmt(a.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditing(a); setShowForm(true) }}
                      className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
                    </button>
                    <button onClick={() => setConfirmDelete(a)}
                      className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showForm && (
        <AnnouncementForm
          announcement={editing}
          allDepartments={allDepartments}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl">
            <p className="text-sm font-bold text-gray-900 mb-1">ลบข่าวนี้?</p>
            <p className="text-xs text-gray-400 mb-4">{confirmDelete.title}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50">ยกเลิก</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AnnouncementForm({ announcement, allDepartments, onSave, onClose }: {
  announcement: Announcement | null
  allDepartments: string[]
  onSave: (p: AnnouncementDraft, id?: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(announcement?.title ?? '')
  const [body, setBody] = useState(announcement?.body ?? '')
  const [imageUrl, setImageUrl] = useState(announcement?.imageUrl ?? '')
  const [isPublished, setIsPublished] = useState(announcement?.isPublished ?? true)
  const [targetRoles, setTargetRoles] = useState<UserRole[]>(announcement?.targetRoles ?? [])
  const [targetDepartments, setTargetDepartments] = useState<string[]>(announcement?.targetDepartments ?? [])
  const [saving, setSaving] = useState(false)

  const canSave = title.trim().length > 0 && body.trim().length > 0

  const toggleRole = (r: UserRole) =>
    setTargetRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])
  const toggleDept = (d: string) =>
    setTargetDepartments((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])

  async function submit() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(
        { title: title.trim(), body: body.trim(), imageUrl: imageUrl.trim(), isPublished, targetRoles, targetDepartments },
        announcement?.id,
      )
    } finally {
      setSaving(false)
    }
  }

  const chip = (on: boolean) =>
    `text-sm font-bold px-3 py-1.5 rounded-full transition-all duration-150 ${
      on ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
    }`

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-bold text-gray-900">{announcement ? 'แก้ไขข่าว' : 'โพสต์ข่าวใหม่'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-5">
          {/* Banner */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">แบนเนอร์</label>
            {imageUrl ? (
              <div className={`w-full ${ANNOUNCEMENT_BANNER.ratioClass} rounded-xl overflow-hidden border border-gray-100 bg-gray-50 mb-2`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="banner preview" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className={`w-full ${ANNOUNCEMENT_BANNER.ratioClass} rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-400 mb-2`}>
                วาง URL รูปเพื่อดูตัวอย่างแบนเนอร์
              </div>
            )}
            <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300" />
            <p className="text-sm font-normal text-gray-400 mt-1.5">{ANNOUNCEMENT_BANNER.hint}</p>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">หัวข้อ<span className="text-rose-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น อัปเดตหลักสูตรใหม่ประจำเดือน"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300" />
          </div>

          {/* Body */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">เนื้อหา<span className="text-rose-500">*</span></label>
            <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="รายละเอียดข่าวสาร..."
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none" />
          </div>

          {/* Audience — roles */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">ใครเห็นข่าวนี้ — ตำแหน่ง</label>
            <p className="text-sm font-normal text-gray-500 mb-2">ไม่เลือก = ทุกตำแหน่งเห็น</p>
            <div className="flex flex-wrap gap-2">
              {TARGETABLE_ROLES.map((r) => (
                <button key={r} type="button" onClick={() => toggleRole(r)} className={chip(targetRoles.includes(r))}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Audience — departments */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">ใครเห็นข่าวนี้ — แผนก</label>
            <p className="text-sm font-normal text-gray-500 mb-2">ไม่เลือก = ทุกแผนกเห็น</p>
            {allDepartments.length === 0 ? (
              <p className="text-sm font-normal text-gray-400">ยังไม่มีข้อมูลแผนกในระบบ</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allDepartments.map((d) => (
                  <button key={d} type="button" onClick={() => toggleDept(d)} className={chip(targetDepartments.includes(d))}>
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Publish / Draft */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-sm font-bold text-gray-900">{isPublished ? 'เผยแพร่' : 'ฉบับร่าง'}</p>
              <p className="text-sm font-normal text-gray-500 mt-0.5">
                {isPublished ? 'ผู้ที่อยู่ในกลุ่มเป้าหมายจะเห็นทันทีหลังบันทึก' : 'บันทึกไว้ก่อน ยังไม่แสดงให้ผู้ใช้เห็น'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPublished((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${isPublished ? 'bg-freshket-500' : 'bg-gray-200'}`}
            >
              <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${isPublished ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-all">ยกเลิก</button>
          <button onClick={submit} disabled={!canSave || saving}
            className="flex-1 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
            {saving ? 'กำลังบันทึก...' : announcement ? 'บันทึก' : isPublished ? 'เผยแพร่' : 'บันทึกร่าง'}
          </button>
        </div>
      </div>
    </div>
  )
}
