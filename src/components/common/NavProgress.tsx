'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavProgress() {
  const pathname = usePathname()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const doneTimer = useRef<ReturnType<typeof setTimeout>>()

  // Pathname changed → finish the bar
  useEffect(() => {
    if (state === 'loading') {
      setState('done')
      doneTimer.current = setTimeout(() => setState('idle'), 280)
    }
    return () => clearTimeout(doneTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Intercept clicks on internal <a> tags
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a[href]')
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      // skip: external, hash-only, new tab
      if (!href || href.startsWith('http') || href.startsWith('#') || a.getAttribute('target') === '_blank') return
      clearTimeout(doneTimer.current)
      setState('loading')
    }
    document.addEventListener('click', handle, true)
    return () => document.removeEventListener('click', handle, true)
  }, [])

  // Also intercept programmatic router.push via history.pushState
  useEffect(() => {
    const orig = history.pushState.bind(history)
    history.pushState = function (...args) {
      clearTimeout(doneTimer.current)
      setState('loading')
      return orig(...args)
    }
    return () => { history.pushState = orig }
  }, [])

  if (state === 'idle') return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none">
      <div
        className="h-full bg-freshket-500"
        style={{
          width:  state === 'loading' ? '82%' : '100%',
          opacity: state === 'done' ? 0 : 1,
          transition: state === 'loading'
            ? 'width 2.5s cubic-bezier(0.05, 0.05, 0, 1)'
            : 'width 0.12s ease-out, opacity 0.25s ease-in 0.05s',
        }}
      />
    </div>
  )
}
