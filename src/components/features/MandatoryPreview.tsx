'use client'

import { toEmbedUrl } from '@/lib/mandatory'

// Shared card thumbnail for a Mandatory Reading item. Used by both the admin
// card grid and the learner-facing card grid so the two stay visually
// identical.
//
// When a slidesUrl is given, the cover IS the actual Google Slides deck (first
// slide of the embed, same toEmbedUrl the full viewer uses) rather than a
// generic placeholder — so the card reads as a real preview of that week's
// content, not a stand-in icon. `pointer-events-none` keeps the iframe from
// swallowing the card's own click/hover — the deck is just a picture here, the
// full interactive embed lives in MandatorySlideViewer.
export function SlidePreviewArea({ isPublished, weekLabel, slidesUrl, hideBadges = false }: {
  isPublished: boolean
  weekLabel: string
  slidesUrl?: string
  /** Suppresses the week/Draft badges drawn over the cover — for a context
   * (like the list row) that already shows that same information next to the
   * thumbnail, where drawing it twice would be redundant clutter. */
  hideBadges?: boolean
}) {
  const embedUrl = slidesUrl ? toEmbedUrl(slidesUrl) : null

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden bg-gray-50"
      style={{ paddingTop: '56.25%' }}
    >
      {embedUrl ? (
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full border-0 pointer-events-none"
          tabIndex={-1}
          title={weekLabel}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, #d6fdf0 0%, #a7f3d0 60%, #d6fdf0 100%)' }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-14 rounded-2xl bg-white/80 flex items-center justify-center shadow-sm">
              <svg className="size-7 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
              </svg>
            </div>
          </div>
        </div>
      )}
      {!hideBadges && (
        <>
          <div className="absolute top-3 left-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/90 text-freshket-700 shadow-sm">
              {weekLabel}
            </span>
          </div>
          {!isPublished && (
            <div className="absolute top-3 right-3">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                Draft
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
