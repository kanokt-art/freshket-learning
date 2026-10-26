// Keeping a screen's data fresh without a push channel.
//
// Firestore held a connection open and pushed every change. A request/response
// API cannot, so a "live" query is three things working together:
//
//   • it reads once straight away,
//   • it reads again when the app says something changed (invalidation.ts) —
//     which is what makes the person's OWN save show up at once — and
//   • it reads again on a timer, to pick up other people's changes, but only
//     while the tab is actually on screen.
//
// This module is that behaviour and nothing else: it is handed a way to load,
// and a place to put what it loaded. The shared registry that decides WHICH
// queries are live (and for how long) stays in useFirestore.ts.

import { onInvalidate } from './invalidation'

export interface LiveOptions<T> {
  /** The collection this reads from; an invalidation of it (or of everything) triggers a read. */
  path: string
  /** How often to look for other people's changes while the tab is visible. */
  pollMs: number
  load: () => Promise<T>
  /** A read finished. */
  apply: (value: T) => void
  /** A read failed. Polling carries on unless the failure can never go away. */
  fail: (error: unknown) => void
}

/** Failures that retrying will not fix: the request itself is wrong, or this person may not read it. */
function isPermanent(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status
  return status === 400 || status === 403
}

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

/** Start reading. Returns the way to stop. */
export function attachLive<T>(opts: LiveOptions<T>): () => void {
  let stopped = false
  let inFlight = false
  // A refresh asked for while one is running is remembered, not dropped: the
  // running one may have started before the change it was asked about.
  let again = false
  let lastRead = 0
  let timer: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    stopped = true
    if (timer) clearInterval(timer)
    unsubscribe()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
  }

  async function refresh(): Promise<void> {
    if (stopped) return
    if (inFlight) { again = true; return }
    inFlight = true
    try {
      const value = await opts.load()
      lastRead = Date.now()
      if (!stopped) opts.apply(value)
    } catch (e) {
      if (stopped) return
      opts.fail(e)
      if (isPermanent(e)) { stop(); return }
    } finally {
      inFlight = false
    }
    if (again && !stopped) { again = false; void refresh() }
  }

  const unsubscribe = onInvalidate((path) => {
    // A path of null means "anything may have changed".
    if (path === null || path === opts.path) void refresh()
  })

  function onVisible() {
    // Coming back to the tab: catch up if it has been a while.
    if (visible() && Date.now() - lastRead >= opts.pollMs) void refresh()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  timer = setInterval(() => { if (visible()) void refresh() }, opts.pollMs)
  void refresh()

  return stop
}
