'use client'

import { useEffect, useRef, useState } from 'react'

// Extract the 11-char video id from any common YouTube URL form. Returns null
// for non-YouTube URLs (Drive, Slides, …) which can't be seek-enforced.
export function youtubeVideoId(url?: string): string | null {
  if (!url) return null
  const m =
    url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

// ── YouTube IFrame API loader (once per page) ─────────────────────────────────
type YTPlayer = {
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (s: number, allowSeekAhead: boolean) => void
  destroy: () => void
}
let ytApiPromise: Promise<void> | null = null
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void }
  if (w.YT?.Player) return Promise.resolve()
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve() }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

// Anti-seek YouTube player. It tracks the furthest point legitimately watched
// (`allowed`); any attempt to scrub *forward* past that snaps the video back —
// so the learner can rewind/rewatch but cannot skip ahead. When they've watched
// ≥95% linearly, onComplete fires once (marking the lesson passable).
export function YouTubeGatedPlayer({ videoId, watched, onComplete }: {
  videoId: string
  watched: boolean
  onComplete: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const allowedRef = useRef(0)
  const completedRef = useRef(watched)
  const [pct, setPct] = useState(0)
  const [localDone, setLocalDone] = useState(watched)
  const [seekBlocked, setSeekBlocked] = useState(false)

  useEffect(() => {
    let destroyed = false
    let interval: ReturnType<typeof setInterval> | undefined

    function tick() {
      const p = playerRef.current
      if (!p) return
      const t = p.getCurrentTime()
      const dur = p.getDuration() || 0
      const allowed = allowedRef.current
      // Forward jump beyond a small tolerance = skip → snap back to allowed.
      if (t > allowed + 1.5) {
        setSeekBlocked(true)
        p.seekTo(allowed, true)
        window.setTimeout(() => setSeekBlocked(false), 1600)
        return
      }
      if (t > allowed) allowedRef.current = t
      const watchedPct = dur > 0 ? Math.min(100, Math.round((allowedRef.current / dur) * 100)) : 0
      setPct(watchedPct)
      if (watchedPct >= 95 && !completedRef.current) {
        completedRef.current = true
        setLocalDone(true)
        onComplete()
      }
    }

    loadYouTubeApi().then(() => {
      if (destroyed || !hostRef.current) return
      const YT = (window as unknown as { YT: {
        Player: new (el: HTMLElement, opts: unknown) => YTPlayer
        PlayerState: { PLAYING: number }
      } }).YT
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === YT.PlayerState.PLAYING) {
              if (!interval) interval = setInterval(tick, 400)
            }
          },
        },
      })
    })

    return () => {
      destroyed = true
      if (interval) clearInterval(interval)
      playerRef.current?.destroy?.()
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-gray-100 bg-black" style={{ aspectRatio: '16/9' }}>
        <div ref={hostRef} className="w-full h-full" />
      </div>
      {/* Our own progress bar — this is the source of truth for "passed", not the
          native scrubber (which we actively block from skipping ahead). */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(pct, watched ? 100 : 0)}%`, background: '#00ce7c' }} />
        </div>
        <span className="text-xs font-bold tabular-nums text-gray-500 w-9 text-right">{watched ? 100 : pct}%</span>
        {(localDone || watched) && <span className="text-xs font-bold text-freshket-600 whitespace-nowrap">ดูครบแล้ว</span>}
      </div>
      {seekBlocked && (
        <p className="text-xs font-bold text-rose-500">ข้ามไม่ได้ — ต้องดูตามลำดับเพื่อผ่านบทเรียน</p>
      )}
      {!(localDone || watched) && (
        <p className="text-xs text-gray-400">ดูให้ครบ 95% เพื่อผ่านบทเรียนนี้ (กดข้ามไม่ได้)</p>
      )}
    </div>
  )
}
