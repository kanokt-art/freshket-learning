'use client'

import { useState, useRef, type ReactNode, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/layout/Header'
import { ROLE_LABELS } from '@/types/user'
import { BUCKET_ASSESSMENT_LIST } from '@/lib/bucketAssessments'
import { BucketResultCard } from '@/components/features/BucketResultCard'
import { MbtiBadge } from '@/components/features/MbtiBadge'
import { getDaysSince } from '@/lib/utils/newJoiner'
import { formatPersonName } from '@/lib/users/displayName'

// The profile reads like a phone's settings: a big title, the person with their photo, one highlight card
// (how long they have been with Freshket), then a list of rows. A row opens its own page, sliding in from
// the right, with a back arrow.

// ── Tenure formatter ──────────────────────────────────────────────────────────

function formatTenure(days: number): string {
  if (days >= 9999) return 'ไม่ระบุ'
  if (days === 0) return 'วันแรก'
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const rem = days % 30
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ปี`)
  if (months > 0) parts.push(`${months} เดือน`)
  if (rem > 0 || parts.length === 0) parts.push(`${rem} วัน`)
  return parts.join(' ')
}

function formatThaiDate(date: Date): string {
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const Chevron = () => (
  <svg className="size-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
)

const icon = (d: string) => (
  <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const ICON = {
  person: 'M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  sparkle: 'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z',
  book: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
  bell: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
  logout: 'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9',
}

// ── Building blocks ───────────────────────────────────────────────────────────

function Avatar({ photo, initials, size }: { photo?: string | null; initials: string; size: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-24 text-3xl' : 'size-14 text-xl'
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" className={`${cls} rounded-full object-cover bg-gray-100`} />
  ) : (
    <div className={`${cls} rounded-full bg-freshket-100 text-freshket-700 flex items-center justify-center font-black`}>{initials}</div>
  )
}

function MenuRow({ iconPath, label, onClick, href, danger }: { iconPath: string; label: string; onClick?: () => void; href?: string; danger?: boolean }) {
  const inner = (
    <>
      <span className={danger ? 'text-rose-500' : 'text-gray-800'}>{icon(iconPath)}</span>
      <span className={`flex-1 text-base text-left ${danger ? 'text-rose-600 font-bold' : 'text-gray-800'}`}>{label}</span>
      {!danger && <Chevron />}
    </>
  )
  const cls = 'w-full flex items-center gap-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-xl transition-all duration-150'
  return href
    ? <Link href={href} className={cls}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-base text-gray-900 mt-0.5 break-words">{value}</p>
    </div>
  )
}

/** A row's own page, sliding in from the right with a back arrow. */
function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto animate-slide-in-right">
      <div className="max-w-lg mx-auto px-5 pt-4 pb-10">
        <button
          type="button"
          onClick={onBack}
          aria-label="กลับ"
          className="size-10 -ml-2 flex items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 transition-all duration-150"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        </button>
        <h1 className="text-3xl font-black text-gray-900 mt-3 mb-4">{title}</h1>
        {children}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Section = null | 'info' | 'assessments'

export default function ProfilePage() {
  const { user, signOut, isDemoMode } = useAuth()
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [section, setSection] = useState<Section>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!user) return null

  const daysSince = getDaysSince(user.startDate)
  const currentPhoto = photoPreview ?? user.photoURL
  const initials = (user.nickname ?? user.displayName).charAt(0).toUpperCase()
  const name = formatPersonName(user)

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('ไฟล์ใหญ่เกิน 5 MB')
      return
    }
    const uid = user.uid
    setUploadError(null)
    setUploading(true)
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${uid}/avatar.${ext}`
      const { error } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      setPhotoPreview(data.publicUrl + '?t=' + Date.now())
    } catch {
      setUploadError('อัพโหลดรูปไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setUploading(false)
    }
  }

  const fileInput = <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="hidden lg:block"><Header title="โปรไฟล์" subtitle="ข้อมูลของฉัน" /></div>

      {section === 'info' ? (
        <SubPage title="ข้อมูลส่วนตัว" onBack={() => setSection(null)}>
          <div className="flex flex-col items-center py-4">
            <div className="relative">
              <Avatar photo={currentPhoto} initials={initials} size="lg" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || isDemoMode}
                className="absolute bottom-0 right-0 size-9 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:text-freshket-600 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="เปลี่ยนรูปโปรไฟล์"
              >
                {uploading ? (
                  <span className="size-4 border-2 border-freshket-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                  </svg>
                )}
              </button>
              {fileInput}
            </div>
            {uploadError && <p className="text-xs text-rose-500 mt-2">{uploadError}</p>}
            {isDemoMode && <p className="text-xs text-amber-600 mt-2">Demo Mode: เปลี่ยนรูปได้เฉพาะในระบบจริง</p>}
          </div>
          <InfoRow label="ชื่อ" value={name} />
          <InfoRow label="อีเมล" value={user.email} />
          <InfoRow label="รหัสพนักงาน" value={user.employeeId} />
          <InfoRow label="ตำแหน่ง" value={user.position} />
          <InfoRow label="แผนก" value={user.department} />
          <InfoRow label="Line Manager" value={user.lineManager} />
          <InfoRow label="บทบาทในระบบ" value={ROLE_LABELS[user.role]} />
          {user.startDate && <InfoRow label="วันเริ่มงาน" value={formatThaiDate(user.startDate)} />}
        </SubPage>
      ) : section === 'assessments' ? (
        <SubPage title="ผลประเมินของฉัน" onBack={() => setSection(null)}>
          <div className="space-y-3">
            {BUCKET_ASSESSMENT_LIST.map((def) => (
              <BucketResultCard key={def.id} uid={user.uid} definition={def} />
            ))}
          </div>
        </SubPage>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-5 pt-8 pb-10">
            <h1 className="text-3xl font-black text-gray-900">โปรไฟล์</h1>

            {/* The person — opens their personal information */}
            <button
              type="button"
              onClick={() => setSection('info')}
              className="w-full flex items-center gap-4 mt-6 pb-6 border-b border-gray-100 text-left group"
            >
              <Avatar photo={currentPhoto} initials={initials} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-lg text-gray-900 truncate">{name}</p>
                <p className="text-sm text-gray-500 truncate">{user.position || ROLE_LABELS[user.role]}</p>
              </div>
              <MbtiBadge uid={user.uid} />
              <Chevron />
            </button>

            {/* Highlight card: time with Freshket */}
            {user.startDate && (
              <div className="mt-6 rounded-2xl bg-white border border-gray-100 shadow-[0_6px_20px_rgba(0,0,0,0.08)] p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-900">อยู่กับ Freshket มา {formatTenure(daysSince)}</p>
                  <p className="text-sm text-gray-500 mt-1 leading-snug">เริ่มงาน {formatThaiDate(user.startDate)}</p>
                </div>
                <div className="size-20 shrink-0 rounded-2xl bg-freshket-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-freshket-700 tabular-nums leading-none">{daysSince >= 9999 ? '—' : daysSince}</span>
                  <span className="text-xs font-bold text-freshket-600 mt-1">วัน</span>
                </div>
              </div>
            )}

            <h2 className="text-2xl font-black text-gray-900 mt-8 mb-1">การตั้งค่า</h2>
            <div>
              <MenuRow iconPath={ICON.person} label="ข้อมูลส่วนตัว" onClick={() => setSection('info')} />
              <MenuRow iconPath={ICON.sparkle} label="ผลประเมินของฉัน" onClick={() => setSection('assessments')} />
              <MenuRow iconPath={ICON.book} label="หลักสูตรของฉัน" href="/courses" />
              <MenuRow iconPath={ICON.bell} label="การแจ้งเตือน" href="/notifications" />
            </div>

            <div className="mt-6">
              {!showSignOutConfirm ? (
                <MenuRow iconPath={ICON.logout} label="ออกจากระบบ" danger onClick={() => setShowSignOutConfirm(true)} />
              ) : (
                <div className="bg-rose-50 rounded-2xl border border-rose-200 p-4 space-y-3">
                  <p className="text-sm font-bold text-rose-700 text-center">ยืนยันออกจากระบบ?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSignOutConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all duration-150"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={signOut}
                      className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold transition-all duration-150"
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
