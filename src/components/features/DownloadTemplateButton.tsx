'use client'

import { downloadCsvTemplate, type CsvTemplate } from '@/lib/utils/csvTemplates'

/**
 * Download-the-template control, shown next to every CSV upload field.
 *
 * One component rather than four copies of the same markup, so the four
 * import screens cannot drift into looking like four different features.
 *
 * `variant` is about placement, not decoration. The upload controls it sits
 * beside are not the same shape — a modal has a tight header row, a page
 * section has room for a full button — so a single style would be wrong in
 * one of the two places.
 */
export function DownloadTemplateButton({
  template,
  variant = 'button',
  className = '',
}: {
  template: CsvTemplate
  /** 'button' = standalone control; 'link' = inline, for tight headers. */
  variant?: 'button' | 'link'
  className?: string
}) {
  const icon = (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" />
    </svg>
  )

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={() => downloadCsvTemplate(template)}
        className={`inline-flex items-center gap-1.5 text-xs font-bold text-freshket-700 hover:text-freshket-600 transition-all duration-150 ${className}`}
      >
        {icon}
        {template.label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => downloadCsvTemplate(template)}
      className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl bg-freshket-100 text-freshket-700 border border-freshket-200 hover:bg-freshket-200 transition-all duration-150 ${className}`}
    >
      {icon}
      {template.label}
    </button>
  )
}
