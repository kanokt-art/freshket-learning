'use client'

// The frame every feedback sheet shares: a white card that rises from the bottom of a phone, a close ✕ at
// the top right, the content centred, and a big rounded button at the foot. With `inline` (a computer) it
// is not a floating card but a panel in the page itself, where the lesson would be.
// Used to give feedback on a course and to read what a team lead or manager wrote — for every role.
export function FeedbackSheetFrame({ onClose, footer, children, inline = false }: {
  onClose: () => void
  /** Sit in the page instead of floating over it. */
  inline?: boolean
  /** The big button row at the foot (e.g. the green "Done" button). */
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  if (inline) {
    return (
      <section className="relative max-w-2xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="absolute top-4 right-4 p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-all duration-150"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="px-8 pt-8 pb-4 text-center">{children}</div>
        {footer && <div className="px-8 pb-8 pt-2 max-w-sm mx-auto">{footer}</div>}
      </section>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full sm:max-w-sm max-h-[92vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-sheet-up sm:animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2.5 shrink-0"><span className="h-1 w-10 rounded-full bg-gray-200" /></div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-all duration-150"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="flex-1 overflow-y-auto px-6 pt-8 pb-4 text-center">{children}</div>
        {footer && <div className="shrink-0 px-6 pb-6 pt-2">{footer}</div>}
      </div>
    </div>
  )
}

/** The big rounded call-to-action at the foot of a sheet. */
export function SheetButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-full bg-freshket-600 text-white text-base font-bold shadow-md hover:bg-freshket-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
    >
      {children}
    </button>
  )
}

/** A rounded pill, selectable (the "what did you like?" choices) or just a label. */
export function Chip({ children, selected, onClick }: { children: React.ReactNode; selected?: boolean; onClick?: () => void }) {
  const base = 'inline-flex items-center px-3.5 py-2 rounded-full text-sm transition-all duration-150'
  if (!onClick) return <span className={`${base} bg-gray-100 text-gray-600`}>{children}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!selected}
      className={`${base} ${selected ? 'bg-amber-300 text-gray-900 font-bold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
    >
      {children}
    </button>
  )
}
