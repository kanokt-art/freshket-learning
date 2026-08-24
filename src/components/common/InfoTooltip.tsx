'use client'

export function InfoTooltip({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`relative inline-flex group/tooltip ${className}`}>
      <svg className="size-3.5 text-gray-300 hover:text-gray-500 cursor-help transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
      <span className="pointer-events-none absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 rounded-lg bg-gray-900 text-white text-xs font-normal leading-relaxed px-2.5 py-1.5 opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150">
        {text}
      </span>
    </span>
  )
}
