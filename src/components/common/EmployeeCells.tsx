'use client'

import { useState } from 'react'
import { formatDateEN } from '@/lib/utils/dateFormatter'
import { tenureLabel } from '@/lib/users/tenure'

// The cells every employee table shares, so Position, Department and Start Date read the same on
// every screen: full text (never cut off), a copy icon, and length of service as a pill under the
// start date.

/**
 * A small copy-to-clipboard icon. A span, not a button, so it can sit inside a row that is itself
 * a button; it stops the click from reaching the row.
 */
export function CopyIcon({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  function copy(e: React.SyntheticEvent) {
    e.stopPropagation()
    e.preventDefault()
    try {
      void navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked: nothing to do */ }
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title={copied ? 'Copied' : label}
      aria-label={label}
      onClick={copy}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') copy(e) }}
      className="shrink-0 inline-flex p-0.5 rounded text-gray-300 hover:text-freshket-500 hover:bg-freshket-50 transition-colors cursor-pointer"
    >
      {copied ? (
        <svg className="size-3.5 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
        </svg>
      )}
    </span>
  )
}

/** Position or Department as full text with a copy icon. Shows a dash when empty. */
export function CopyableText({ text, className = '' }: { text?: string | null; className?: string }) {
  if (!text) return <span className="text-gray-300">—</span>
  return (
    <span className={`inline-flex items-start gap-1 min-w-0 ${className}`}>
      <span className="break-words min-w-0">{text}</span>
      <CopyIcon text={text} />
    </span>
  )
}

/** The start date with the length of service as a pill under it. */
export function StartDateCell({ startDate }: { startDate?: Date | string | null }) {
  if (!startDate) return <span className="text-gray-300">—</span>
  const tenure = tenureLabel(startDate)
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="whitespace-nowrap">{formatDateEN(startDate)}</span>
      {tenure && (
        <span className="inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full bg-freshket-100 text-freshket-700 border border-freshket-200 whitespace-nowrap">
          {tenure}
        </span>
      )}
    </div>
  )
}
