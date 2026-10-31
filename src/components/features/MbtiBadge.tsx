'use client'

import { useEffect, useState } from 'react'
import { useMyBucketResult } from '@/hooks/useFirestore'
import { MBTI_DEFINITION } from '@/lib/bucketAssessments'
import { getMbtiProfile, MBTI_PROFILE_NOTE } from '@/lib/bucketAssessments/mbtiProfiles'

// Pastel pill showing a person's MBTI code, for profile headers and people
// lists. Someone who hasn't taken the questionnaire gets a grey placeholder
// pill rather than nothing, so the row keeps its shape and "not taken yet"
// reads as a real state instead of looking like a rendering gap.
//
// Introvert/extravert types get different pastel hues, keyed off the first
// letter, so two codes read as visibly different at a glance instead of every
// badge being the same colour.
const AXIS_TONE: Record<string, string> = {
  I: 'bg-violet-100 text-violet-700 border-violet-200',
  E: 'bg-amber-100 text-amber-700 border-amber-200',
}

const FALLBACK_TONE = 'bg-freshket-100 text-freshket-700 border-freshket-200'
const EMPTY_TONE = 'bg-gray-100 text-gray-400 border-gray-200'

/**
 * The pill for a code that is already in hand — a roster loads everyone's codes in one query.
 * `openable` only changes how it looks (pointer, hover lift and ring, a small arrow) so people can
 * tell it is clickable; the click itself is wired by OpenableMbtiPill.
 */
export function MbtiPill({ code, className = '', openable = false }: { code: string | undefined; className?: string; openable?: boolean }) {
  const tone = !code
    ? EMPTY_TONE
    : AXIS_TONE[code.charAt(0).toUpperCase()] ?? FALLBACK_TONE
  const cue = openable && code
    ? 'cursor-pointer transition-all duration-150 group-hover:-translate-y-px group-hover:shadow-md group-hover:ring-2 group-hover:ring-freshket-300'
    : ''
  const hint = openable ? ' · คลิกเพื่ออ่านรายละเอียด' : ''

  return (
    <span
      title={code ? `${MBTI_DEFINITION.title}: ${code}${hint}` : `ยังไม่ได้ทำ${MBTI_DEFINITION.title}`}
      className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border tracking-wide ${tone} ${cue} ${className}`}
    >
      {code ?? '—'}
      {openable && code && (
        <svg className="size-3 opacity-60 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      )}
    </span>
  )
}

/** A pill that opens the type card when clicked — for a code already in hand (rosters). */
export function OpenableMbtiPill({ code, ownerName, className = '' }: { code: string | undefined; ownerName?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  if (!code || !getMbtiProfile(code)) return <MbtiPill code={code} className={className} />
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-freshket-300">
        <MbtiPill code={code} openable className={className} />
      </button>
      {open && <MbtiProfileModal code={code} ownerName={ownerName} onClose={() => setOpen(false)} />}
    </>
  )
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
            <span className="mt-2 size-1.5 rounded-full bg-freshket-500 shrink-0" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What a person reads about their type. Used under the result and in the profile pop-up, so
 * it is the same text both times. Renders nothing for a code without a profile.
 */
export function MbtiProfileContent({ code }: { code: string | undefined }) {
  const p = getMbtiProfile(code)
  if (!p) return null
  return (
    <div className="space-y-5">
      <div className="text-center">
        <MbtiPill code={p.code} className="!text-sm !px-4 !py-1.5" />
        <p className="text-lg font-black text-gray-900 mt-2">{p.nickname}</p>
        <p className="text-xs text-gray-400">{p.nicknameEn} · {p.group}</p>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl px-4 py-3">{p.summary}</p>
      <Section title="ไลฟ์สไตล์" items={p.lifestyle} />
      <Section title="การทำงาน" items={p.work} />
      <Section title="จุดแข็ง" items={p.strengths} />
      <Section title="สิ่งที่ควรพัฒนา" items={p.growth} />
      <p className="text-xs text-gray-400 leading-relaxed">{MBTI_PROFILE_NOTE}</p>
    </div>
  )
}

/** The type card as a pop-up, so it can be read again any time. */
export function MbtiProfileModal({ code, ownerName, onClose }: { code: string; ownerName?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`MBTI ${code}`}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <p className="text-sm font-bold text-gray-800">{MBTI_DEFINITION.title} {ownerName ? `ของ ${ownerName}` : 'ของคุณ'}</p>
          <button type="button" onClick={onClose} aria-label="ปิด"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          <MbtiProfileContent code={code} />
        </div>
      </div>
    </div>
  )
}

/**
 * `openable`: clicking the pill opens that person's type card (a team lead / manager / admin
 * reading a member's, or a person reading their own). `ownerName` titles the card for someone else.
 */
export function MbtiBadge({ uid, className = '', openable = false, ownerName }: { uid: string | undefined; className?: string; openable?: boolean; ownerName?: string }) {
  const { data: result } = useMyBucketResult(uid, MBTI_DEFINITION.id)
  if (!openable) return <MbtiPill code={result?.code} className={className} />
  return <OpenableMbtiPill code={result?.code} ownerName={ownerName} className={className} />
}
