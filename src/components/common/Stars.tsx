'use client'

import { useState } from 'react'
import { MAX_STARS } from '@/lib/feedback/stars'

const STAR_PATH =
  'M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z'

/** A rating as stars, with the number beside it. Read only. */
export function StarsDisplay({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={`${value} จาก ${MAX_STARS} ดาว`}>
      {Array.from({ length: MAX_STARS }).map((_, i) => (
        <svg key={i} className={`size-3.5 ${i < value ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
          <path d={STAR_PATH} />
        </svg>
      ))}
      <span className="text-xs font-bold text-amber-600 ml-1">{value}/{MAX_STARS}</span>
    </span>
  )
}

/**
 * Pick a rating by clicking a star. Clicking the star that is already chosen clears it,
 * since a rating is optional. Each star is a button, so it works from the keyboard too.
 */
export function StarsInput({ value, onChange, disabled }: {
  value: number | null
  onChange: (next: number | null) => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="ให้คะแนน" onMouseLeave={() => setHover(null)}>
      {Array.from({ length: MAX_STARS }).map((_, i) => {
        const n = i + 1
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} ดาว`}
            disabled={disabled}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? null : n)}
            className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-freshket-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg className={`size-6 transition-colors duration-150 ${n <= shown ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
              <path d={STAR_PATH} />
            </svg>
          </button>
        )
      })}
      <span className="text-xs text-gray-400 ml-1.5 tabular-nums">{value != null ? `${value}/${MAX_STARS}` : 'ยังไม่ให้คะแนน'}</span>
    </div>
  )
}
