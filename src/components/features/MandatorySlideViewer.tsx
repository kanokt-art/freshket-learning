'use client'

import { toEmbedUrl, type MandatoryItem } from '@/lib/mandatory'

// Slide-over panel that embeds a Mandatory Reading Google Slides deck.
// Shared by the admin CRUD page and the learner list view.
export function MandatorySlideViewer({ item, onClose }: { item: MandatoryItem; onClose: () => void }) {
  const embedUrl = toEmbedUrl(item.slidesUrl)
  return (
    <>
      <style>{`@keyframes panelSlideIn { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
        <aside
          className="w-full sm:max-w-4xl bg-white shadow-2xl flex flex-col"
          style={{ animation: 'panelSlideIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center gap-4 px-6 py-4 border-b border-gray-100">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-freshket-100 text-freshket-700">
                  {item.weekLabel}
                </span>
                {!item.isPublished && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Draft</span>
                )}
              </div>
              <h2 className="text-base font-bold text-gray-900 truncate">{item.title}</h2>
            </div>
            <a
              href={item.slidesUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition-colors shrink-0"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              เปิดใน Google Slides
            </a>
            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Description */}
          {item.description && (
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
            </div>
          )}

          {/* Iframe */}
          <div className="flex-1 bg-gray-100 min-h-0">
            <iframe
              src={embedUrl}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay"
              title={item.title}
            />
          </div>
        </aside>
      </div>
    </>
  )
}
