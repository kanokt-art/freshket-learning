'use client'

import { useState, useRef, type ReactNode, type ChangeEvent } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/layout/Header'
import { ROLE_LABELS } from '@/types/user'
import { getDaysSince } from '@/lib/utils/newJoiner'

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

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  sale: 'bg-freshket-100 text-freshket-700 border-freshket-200',
  team_lead: 'bg-blue-100 text-blue-700 border-blue-200',
  manager: 'bg-purple-100 text-purple-700 border-purple-200',
  super_admin: 'bg-freshket-600 text-white border-freshket-700',
}

// ── Info row ──────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="size-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-normal text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm font-bold text-gray-800 leading-snug truncate">{value}</p>
      </div>
    </div>
  )
}

// ── Quick link card ───────────────────────────────────────────────────────────

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, signOut, isDemoMode } = useAuth()
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!user) return null

  const daysSince = getDaysSince(user.startDate)
  const currentPhoto = photoPreview ?? user.photoURL
  const initials = (user.nickname ?? user.displayName).charAt(0).toUpperCase()

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

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="โปรไฟล์" subtitle="ข้อมูลของฉัน" />

      <div className="flex-1 overflow-y-auto">

        {/* ── Hero ── */}
        <div className="bg-white border-b border-gray-100 px-6 pb-6 pt-7 flex flex-col items-center gap-3
                        lg:flex-row lg:items-center lg:gap-5 lg:px-8 lg:py-5">

          {/* Avatar */}
          <div className="relative shrink-0">
            {currentPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentPhoto}
                alt={user.displayName}
                className="size-24 lg:size-16 rounded-full object-cover ring-4 ring-freshket-100"
              />
            ) : (
              <div className="size-24 lg:size-16 rounded-full bg-freshket-500 flex items-center justify-center text-white text-3xl lg:text-xl font-black ring-4 ring-freshket-100">
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 size-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-freshket-300 hover:text-freshket-600 transition-all shadow-sm disabled:opacity-50"
              title="เปลี่ยนรูปโปรไฟล์"
            >
              {uploading ? (
                <span className="size-4 border-2 border-freshket-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>

          {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}

          {/* Name */}
          <div className="text-center lg:text-left lg:flex-1 min-w-0">
            <h2 className="text-xl font-black text-gray-900 leading-tight">{user.displayName}</h2>
            {user.nickname && <p className="text-sm font-normal text-gray-400 mt-0.5">({user.nickname})</p>}
          </div>

          {/* Role badge */}
          <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border lg:ml-auto lg:shrink-0 ${ROLE_BADGE[user.role] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
            {ROLE_LABELS[user.role]}
          </span>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-3 max-w-lg mx-auto lg:max-w-none lg:mx-0 lg:px-8 lg:py-6">

          <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2 px-1">ข้อมูลพนักงาน</p>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

              {/* Tenure row — inside the card, pastel tinted */}
              {user.startDate && (
                <div className="bg-freshket-50 border-b border-freshket-100 px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-freshket-200 flex items-center justify-center shrink-0">
                      <svg className="size-5 text-freshket-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-freshket-600 mb-0.5">อายุงาน</p>
                      <p className="text-base font-black text-freshket-700 leading-tight">{formatTenure(daysSince)}</p>
                      <p className="text-xs font-normal text-freshket-500 mt-0.5">เริ่มงาน {formatThaiDate(user.startDate)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-black text-freshket-200 leading-none tabular">{daysSince}</p>
                      <p className="text-xs font-bold text-freshket-400">วัน</p>
                    </div>
                  </div>
                </div>
              )}

            <div className="px-5 py-1">
              <InfoRow
                label="อีเมล"
                value={user.email}
                icon={
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                }
              />
              <InfoRow
                label="รหัสพนักงาน"
                value={user.employeeId}
                icon={
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
                  </svg>
                }
              />
              <InfoRow
                label="ตำแหน่ง"
                value={user.position}
                icon={
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
                  </svg>
                }
              />
              <InfoRow
                label="แผนก"
                value={user.department}
                icon={
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                }
              />
              <InfoRow
                label="Line Manager"
                value={user.lineManager}
                icon={
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                }
              />
            </div>{/* end px-5 py-1 */}
            </div>{/* end bg-white card */}
          </div>{/* end section wrapper */}

          {/* ── Demo mode notice ── */}
          {isDemoMode && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 px-4 py-3 flex items-start gap-3">
              <svg className="size-4 text-amber-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <div>
                <p className="text-xs font-bold text-amber-700">Demo Mode</p>
                <p className="text-xs font-normal text-amber-600 mt-0.5">การอัพโหลดรูปโปรไฟล์ใช้งานได้เฉพาะในระบบจริง</p>
              </div>
            </div>
          )}

          {/* ── Sign out ── */}
          <div className="pb-6 lg:pb-0">
            {!showSignOutConfirm ? (
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-rose-200 text-rose-500 text-sm font-bold hover:bg-rose-50 transition-colors"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
                ออกจากระบบ
              </button>
            ) : (
              <div className="bg-rose-50 rounded-2xl border border-rose-200 p-4 space-y-3">
                <p className="text-sm font-bold text-rose-700 text-center">ยืนยันออกจากระบบ?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSignOutConfirm(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold transition-colors"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>{/* end left col wrapper */}

        </div>
      </div>
    </div>
  )
}
