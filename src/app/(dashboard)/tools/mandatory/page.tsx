'use client'

import { useState, useMemo, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { AdministrationTabs } from '@/components/layout/AdministrationTabs'
import { FreshketToolTabs } from '@/components/layout/FreshketToolTabs'
import { useAuth } from '@/hooks/useAuth'
import { canAccess } from '@/types/user'
import { useMandatoryItems, useAllUsers, useDepartments } from '@/hooks/useFirestore'
import { pushNotification } from '@/lib/notifications/push'
import { getDemoMode } from '@/lib/demo/demoMode'
import { MandatorySlideViewer } from '@/components/features/MandatorySlideViewer'
import { SlidePreviewArea } from '@/components/features/MandatoryPreview'
import { MandatoryArchiveRail, MandatoryMonthHeader } from '@/components/features/MandatoryArchive'
import {
  formatDate, weekLabelForDate, mandatoryTitleFor, toDateInputValue, fromDateInputValue,
  groupByMonth, groupByYear, mandatoryDepartments,
  type MandatoryItem, type MandatoryDeptAccess,
} from '@/lib/mandatory'
import { confirmAction } from '@/lib/ui/alert'
import { InfoTooltip } from '@/components/common/InfoTooltip'

const DEMO_MODE = getDemoMode()

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'card' | 'list'

interface FormState {
  title: string
  description: string
  slidesUrl: string
  publishDate: Date
  isPublished: boolean
  departmentAccess: MandatoryDeptAccess[]
}

function emptyForm(): FormState {
  const now = new Date()
  return {
    title: mandatoryTitleFor(now),
    description: '',
    slidesUrl: '',
    publishDate: now,
    isPublished: false,
    departmentAccess: [],
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MandatoryPage() {
  const { user } = useAuth()
  const isAdmin = canAccess(user?.role ?? 'sale', 'super_admin')

  const { data: items } = useMandatoryItems()
  const { data: allUsers } = useAllUsers(isAdmin)
  const { data: departmentDocs } = useDepartments(isAdmin)
  const allDepartments = useMemo(() => departmentDocs.map(d => d.name).sort(), [departmentDocs])

  const [viewMode, setViewMode]       = useState<ViewMode>('list')
  const [viewing, setViewing]         = useState<MandatoryItem | null>(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [editItem, setEditItem]       = useState<MandatoryItem | null>(null)
  const [showDrafts, setShowDrafts]   = useState(false)
  const [activeKey, setActiveKey]     = useState<string | null>(null)

  const visibleItems = useMemo(() => {
    if (isAdmin && showDrafts) return items
    return items.filter(i => i.isPublished)
  }, [items, isAdmin, showDrafts])

  const monthGroups = useMemo(() => groupByMonth(visibleItems), [visibleItems])
  const yearGroups = useMemo(() => groupByYear(monthGroups), [monthGroups])

  function jumpTo(key: string) {
    setActiveKey(key)
    document.getElementById(`mandatory-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Notifies whoever can see the item once it goes from draft to published —
  // same "first publish only" rule notifyCoursePublishChanges (courses/page.tsx)
  // uses for courses, so re-saving an already-published item never re-notifies.
  // Targets by department the same way SaleTool visibility works (empty
  // departments = everyone), not by role — Mandatory Reading has no role
  // targeting concept, only a department one.
  const notifyPublish = useCallback((item: MandatoryItem) => {
    if (DEMO_MODE) return
    const depts = mandatoryDepartments(item)
    const targets = allUsers.filter(u =>
      u.uid !== user?.uid
      && (depts.length === 0 || (u.department && depts.includes(u.department))),
    )
    targets.forEach(u => {
      pushNotification(u.uid, {
        type: 'new_mandatory',
        title: `Mandatory Reading ใหม่: ${item.title}`,
        body: `${item.weekLabel} — คลิกเพื่อเปิดอ่าน`,
        refId: item.id,
        refPath: '/courses/mandatory',
      })
    })
  }, [allUsers, user?.uid])

  // Remembers the admin's department selection on their own profile so the
  // NEXT new item starts pre-filled instead of empty every time — a plain
  // per-viewer localStorage convenience would not follow the admin between
  // devices, and this preference is meant to persist like any other setting.
  const rememberDepartments = useCallback(async (depts: string[]) => {
    if (DEMO_MODE || !user?.uid) return
    const { getClientFirestore, doc, setDoc } = await import('@/lib/firebase/client')
    await setDoc(doc(getClientFirestore(), 'users', user.uid), { mandatoryLastDepartments: depts }, { merge: true })
  }, [user?.uid])

  const saveItem = useCallback(async (form: FormState, existing?: MandatoryItem) => {
    if (DEMO_MODE) return
    const { getClientFirestore, doc, setDoc, collection } = await import('@/lib/firebase/client')
    const { Timestamp } = await import('firebase/firestore')
    const db = getClientFirestore()
    const isNew = !existing
    const id = isNew ? doc(collection(db, 'mandatoryItems')).id : existing.id
    const now = new Date()
    const wasPublished = existing?.isPublished ?? false
    const item: MandatoryItem = {
      id,
      title: form.title,
      description: form.description,
      slidesUrl: form.slidesUrl,
      weekLabel: weekLabelForDate(form.publishDate),
      isPublished: form.isPublished,
      departmentAccess: form.departmentAccess,
      publishedAt: form.publishDate,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? user?.uid,
    }
    rememberDepartments(mandatoryDepartments(item))
    await setDoc(doc(db, 'mandatoryItems', id), {
      ...item,
      publishedAt: Timestamp.fromDate(item.publishedAt),
      createdAt: Timestamp.fromDate(item.createdAt),
    })
    if (item.isPublished && !wasPublished) notifyPublish(item)
  }, [user?.uid, notifyPublish, rememberDepartments])

  function handleAdd(form: FormState) {
    saveItem(form)
    setShowAdd(false)
  }

  function handleEdit(form: FormState) {
    if (!editItem) return
    saveItem(form, editItem)
    setEditItem(null)
  }

  async function handleDelete(id: string) {
    const ok = await confirmAction({
      title: 'ลบ Slide นี้?',
      text: 'การลบไม่สามารถย้อนกลับได้',
      confirmText: 'ลบ',
      danger: true,
    })
    if (!ok) return
    if (DEMO_MODE) return
    const { getClientFirestore, doc, deleteDoc } = await import('@/lib/firebase/client')
    await deleteDoc(doc(getClientFirestore(), 'mandatoryItems', id))
  }

  async function handleTogglePublish(item: MandatoryItem) {
    if (DEMO_MODE) return
    const wasPublished = item.isPublished
    const { getClientFirestore, doc, setDoc } = await import('@/lib/firebase/client')
    await setDoc(doc(getClientFirestore(), 'mandatoryItems', item.id), { isPublished: !wasPublished }, { merge: true })
    if (!wasPublished) notifyPublish({ ...item, isPublished: true })
  }

  return (
    <>
      <Header
        title="Mandatory Reading"
        subtitle={`คู่มือ Product Knowledge รายสัปดาห์ · ${visibleItems.length} ฉบับ`}
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors shadow-sm"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              เพิ่ม Slide
            </button>
          ) : undefined
        }
      />
      <AdministrationTabs />
      <FreshketToolTabs />

      <div className="flex-1 overflow-auto p-6 space-y-5 animate-float-up">

        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowDrafts(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                  showDrafts
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                แสดง Draft
              </button>
            )}
            <span className="text-xs text-gray-400">{visibleItems.length} รายการ</span>
          </div>

          {/* Card / List toggle */}
          <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden bg-white p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'card'
                  ? 'bg-freshket-100 text-freshket-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              Card
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-freshket-100 text-freshket-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
              List
            </button>
          </div>
        </div>

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {visibleItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="size-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="size-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-500">ยังไม่มี Mandatory Reading</p>
            {isAdmin && (
              <p className="text-xs text-gray-400 mt-1">กดปุ่ม "เพิ่ม Slide" เพื่อเพิ่มคู่มือฉบับแรก</p>
            )}
          </div>
        )}

        {/* ── Archive: rail + month-grouped sections ───────────────────────── */}
        {visibleItems.length > 0 && (
          <div className="flex gap-6 items-start">
            <MandatoryArchiveRail years={yearGroups} activeKey={activeKey} onJump={jumpTo} />

            <div className="flex-1 min-w-0 space-y-6">
              {monthGroups.map(group => (
                <section key={group.key} id={`mandatory-${group.key}`} className="scroll-mt-4">
                  <MandatoryMonthHeader group={group} />

                  {viewMode === 'card' ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 mt-3">
                      {group.items.map(item => (
                        <MandatoryCard
                          key={item.id}
                          item={item}
                          isAdmin={isAdmin}
                          onView={() => setViewing(item)}
                          onEdit={() => setEditItem(item)}
                          onDelete={() => handleDelete(item.id)}
                          onTogglePublish={() => handleTogglePublish(item)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 mt-3">
                      {group.items.map(item => (
                        <MandatoryRow
                          key={item.id}
                          item={item}
                          isAdmin={isAdmin}
                          onView={() => setViewing(item)}
                          onEdit={() => setEditItem(item)}
                          onDelete={() => handleDelete(item.id)}
                          onTogglePublish={() => handleTogglePublish(item)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        )}
      </div>

      {viewing && <MandatorySlideViewer item={viewing} onClose={() => setViewing(null)} />}
      {showAdd && (
        <MandatoryFormModal
          allDepartments={allDepartments}
          lastDepartments={user?.mandatoryLastDepartments ?? []}
          onClose={() => setShowAdd(false)}
          onSave={handleAdd}
          formTitle="เพิ่ม Mandatory Slide ใหม่"
        />
      )}
      {editItem && (
        <MandatoryFormModal
          initial={editItem}
          allDepartments={allDepartments}
          lastDepartments={user?.mandatoryLastDepartments ?? []}
          onClose={() => setEditItem(null)}
          onSave={handleEdit}
          formTitle="แก้ไข Mandatory Slide"
        />
      )}
    </>
  )
}

// ── SlidePreviewArea ──────────────────────────────────────────────────────────

// ── MandatoryCard ─────────────────────────────────────────────────────────────

function MandatoryCard({
  item, isAdmin, onView, onEdit, onDelete, onTogglePublish,
}: {
  item: MandatoryItem
  isAdmin: boolean
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePublish: () => void
}) {
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden flex flex-col hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 ${
      !item.isPublished ? 'border-amber-100' : 'border-gray-100'
    }`}>
      <div className="p-4 pb-0">
        <SlidePreviewArea isPublished={item.isPublished} weekLabel={item.weekLabel} slidesUrl={item.slidesUrl} />
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-sm font-bold text-gray-900 leading-snug mb-1.5 line-clamp-2">{item.title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 flex-1 mb-3">{item.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{formatDate(item.publishedAt)}</span>
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <>
                <button
                  type="button"
                  title={item.isPublished ? 'Unpublish' : 'Publish'}
                  onClick={onTogglePublish}
                  className={`size-7 rounded-lg flex items-center justify-center transition-colors ${
                    item.isPublished ? 'text-freshket-500 hover:bg-freshket-50' : 'text-amber-500 hover:bg-amber-50'
                  }`}
                >
                  <PublishIcon published={item.isPublished} />
                </button>
                <button
                  type="button"
                  onClick={onEdit}
                  className="size-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="size-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-rose-50 hover:text-rose-400 transition-colors"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onView}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-xs font-bold transition-colors"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              เปิดดู
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MandatoryRow ──────────────────────────────────────────────────────────────

function MandatoryRow({
  item, isAdmin, onView, onEdit, onDelete, onTogglePublish,
}: {
  item: MandatoryItem
  isAdmin: boolean
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePublish: () => void
}) {
  return (
    <div className={`flex items-center gap-4 bg-white rounded-xl border px-4 py-4 hover:shadow-sm transition-all duration-150 ${
      !item.isPublished ? 'border-amber-100' : 'border-gray-100'
    }`}>
      {/* A real preview of the deck instead of a generic document icon — same
          embed SlidePreviewArea uses in the card grid, just fixed-width so the
          row keeps a predictable height regardless of how many rows are on
          screen. hideBadges: this row already shows the week/Draft badges next
          to the title, so the overlay would just repeat them on the thumbnail. */}
      <div className="w-40 shrink-0">
        <SlidePreviewArea isPublished={item.isPublished} weekLabel={item.weekLabel} slidesUrl={item.slidesUrl} hideBadges />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700 shrink-0">
            {item.weekLabel}
          </span>
          {!item.isPublished && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 shrink-0">
              Draft
            </span>
          )}
        </div>
        <p className="text-sm font-bold text-gray-900 truncate">{item.title}</p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{item.description}</p>
      </div>

      <div className="shrink-0 hidden sm:block text-right">
        <p className="text-xs text-gray-400">{formatDate(item.publishedAt)}</p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isAdmin && (
          <>
            <button
              type="button"
              title={item.isPublished ? 'Unpublish' : 'Publish'}
              onClick={onTogglePublish}
              className={`size-8 rounded-lg flex items-center justify-center transition-colors ${
                item.isPublished ? 'text-freshket-500 hover:bg-freshket-50' : 'text-amber-500 hover:bg-amber-50'
              }`}
            >
              <PublishIcon published={item.isPublished} size={4} />
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="size-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="size-8 rounded-lg flex items-center justify-center text-gray-300 hover:bg-rose-50 hover:text-rose-400 transition-colors"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onView}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-freshket-600 hover:bg-freshket-50 text-xs font-bold transition-colors"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
          </svg>
          เปิดดู
        </button>
      </div>
    </div>
  )
}

// ── MandatoryFormModal ────────────────────────────────────────────────────────

function MandatoryFormModal({
  initial,
  allDepartments,
  lastDepartments,
  onClose,
  onSave,
  formTitle,
}: {
  initial?: MandatoryItem
  allDepartments: string[]
  /** The admin's remembered department picks from the last item they saved —
   * used only for a brand-new item; editing an existing one shows ITS own
   * departments instead. */
  lastDepartments: string[]
  onClose: () => void
  onSave: (form: FormState) => void
  formTitle: string
}) {
  // Editing an item never touches its title or date — those are fixed at
  // creation (the title states the week it was created for; changing the date
  // afterward would also silently move it to a different month in the
  // archive). Only description, URL, departments and publish state stay editable.
  const [form, setForm] = useState<FormState>(() => {
    if (initial) {
      return {
        title: initial.title, description: initial.description, slidesUrl: initial.slidesUrl,
        publishDate: initial.publishedAt, isPublished: initial.isPublished,
        departmentAccess: initial.departmentAccess,
      }
    }
    const base = emptyForm()
    return { ...base, departmentAccess: lastDepartments.map(department => ({ department, showHistory: false })) }
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function setPublishDate(date: Date) {
    setForm(prev => ({ ...prev, publishDate: date, title: initial ? prev.title : mandatoryTitleFor(date) }))
  }

  function toggleDepartment(dept: string) {
    setForm(prev => ({
      ...prev,
      departmentAccess: prev.departmentAccess.some(a => a.department === dept)
        ? prev.departmentAccess.filter(a => a.department !== dept)
        : [...prev.departmentAccess, { department: dept, showHistory: false }],
    }))
  }

  function toggleShowHistory(dept: string) {
    setForm(prev => ({
      ...prev,
      departmentAccess: prev.departmentAccess.map(a =>
        a.department === dept ? { ...a, showHistory: !a.showHistory } : a,
      ),
    }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.title.trim()) e.title = 'กรุณากรอกหัวข้อ'
    if (!form.slidesUrl.trim()) e.slidesUrl = 'กรุณากรอก Google Slides URL'
    else if (!form.slidesUrl.includes('/presentation/d/')) e.slidesUrl = 'URL ไม่ถูกต้อง — ต้องเป็น Google Slides URL'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const inputCls = (err?: string) =>
    `w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all ${
      err
        ? 'border-rose-300 bg-rose-50 focus:ring-2 focus:ring-rose-200'
        : 'border-gray-200 bg-white focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100'
    }`

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-pop-in"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{formTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Date — drives both the title and the Week Label, so the two can
              never say different weeks. Locked once created (see the comment
              on the form's init above). */}
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1.5">
              วันที่ <span className="text-rose-400">*</span>
            </label>
            <input
              type="date"
              value={toDateInputValue(form.publishDate)}
              onChange={e => e.target.value && setPublishDate(fromDateInputValue(e.target.value))}
              disabled={!!initial}
              className={`${inputCls()} ${initial ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              {initial
                ? 'แก้ไขวันที่ไม่ได้ — ใช้จัดหมวดเดือน/สัปดาห์ในหน้าคลังแล้ว'
                : `ใช้จัดหมวดในหน้าคลัง — ${weekLabelForDate(form.publishDate)}`}
            </p>
          </div>

          {/* Title — auto-filled from the date above ("Mandatory-Week37 Sep
              2026"); the admin can still override the wording if needed. */}
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1.5">
              หัวข้อ <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="เช่น Premium Fresh Seafood — Product Line ใหม่ Q3"
              className={inputCls(errors.title)}
            />
            {errors.title && <p className="text-xs text-rose-500 mt-1">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1.5">คำอธิบาย</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="สรุปเนื้อหาใน Slide เพื่อให้ user รู้ว่าจะได้เรียนรู้อะไร"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none resize-none min-h-[80px] leading-relaxed focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100 transition-all"
            />
          </div>

          {/* Slides URL */}
          <div>
            <label className="block text-xs font-normal text-gray-700 mb-1.5">
              Google Slides URL <span className="text-rose-400">*</span>
            </label>
            <input
              type="url"
              value={form.slidesUrl}
              onChange={e => set('slidesUrl', e.target.value)}
              placeholder="https://docs.google.com/presentation/d/..."
              className={inputCls(errors.slidesUrl)}
            />
            {errors.slidesUrl && <p className="text-xs text-rose-500 mt-1">{errors.slidesUrl}</p>}
            <p className="text-xs text-gray-400 mt-1.5">
              วาง URL จาก Google Slides (Share → Copy link) — ตั้งค่า "Anyone with the link can view"
            </p>
          </div>

          {/* Departments — who gets notified + can see this. Empty = everyone.
              Ticking a department into the list is remembered for next time
              (see rememberDepartments); the "แสดงผลทั้งหมด" checkbox under it is
              NOT remembered — it's a one-time grant scoped to this item only
              (see the comment on MandatoryDeptAccess in lib/mandatory.ts). */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">แผนกที่เกี่ยวข้อง</label>
            <p className="text-xs text-gray-500 mb-2">
              ไม่เลือกแผนกใดเลย = ทุกแผนกเห็นและได้รับแจ้งเตือน
            </p>
            {allDepartments.length === 0 ? (
              <p className="text-xs text-gray-400">ยังไม่มีข้อมูลแผนกในระบบ</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {allDepartments.map(dept => {
                  const on = form.departmentAccess.some(a => a.department === dept)
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => toggleDepartment(dept)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all duration-150 ${
                        on
                          ? 'bg-freshket-100 text-freshket-700'
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {dept}
                    </button>
                  )
                })}
              </div>
            )}

            {form.departmentAccess.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 divide-y divide-gray-100">
                {form.departmentAccess.map(a => (
                  <label key={a.department} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={a.showHistory}
                      onChange={() => toggleShowHistory(a.department)}
                      className="size-4 rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 shrink-0"
                    />
                    <span className="flex-1 text-xs font-bold text-gray-700">{a.department}</span>
                    <span className="text-xs text-gray-500">แสดงผลทั้งหมด</span>
                    <InfoTooltip text={`ถ้าติ๊ก แผนก ${a.department} จะเห็น Mandatory Reading ทุกฉบับที่เผยแพร่ก่อนหน้านี้ด้วย (ย้อนไปทั้งคลัง) ถ้าไม่ติ๊ก จะเห็นเฉพาะฉบับนี้เป็นต้นไป — ไม่ดึงของเก่ามาโชว์`} />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Publish toggle */}
          <div className="flex items-center justify-between pt-1 pb-1">
            <div>
              <p className="text-sm font-bold text-gray-900">Publish ทันที</p>
              <p className="text-xs text-gray-500 mt-0.5">User ในแผนกที่เลือกจะเห็น Slide นี้ทันที และได้รับแจ้งเตือน</p>
            </div>
            <button
              type="button"
              onClick={() => set('isPublished', !form.isPublished)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                form.isPublished ? 'bg-freshket-500' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                form.isPublished ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-normal text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => { if (validate()) onSave(form) }}
            className="px-5 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors shadow-sm"
          >
            {initial ? 'บันทึกการแก้ไข' : 'เพิ่ม Slide'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared icon components ────────────────────────────────────────────────────

function PublishIcon({ published, size = 3.5 }: { published: boolean; size?: number }) {
  const s = `size-${size}`
  if (published) {
    return (
      <svg className={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }
  return (
    <svg className={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}
