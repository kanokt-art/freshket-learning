// "Something changed — look again."
//
// Firestore pushed every change to every open screen. Postgres behind an API
// does not, so a screen learns about changes two ways: it polls, and it is told.
// This is the "told" half. Anything that writes (a save through collection.ts,
// or a server route that changes data on the caller's behalf) calls invalidate,
// and every live query that could be affected reads again straight away.
//
// A path of null means "anything may have changed" — used after a call to a
// server route, whose writes the browser cannot see.

type Listener = (path: string | null) => void

const listeners = new Set<Listener>()

/** Hear about invalidations. Returns the way to stop. */
export function onInvalidate(cb: Listener): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Tell every live query on `path` (or all of them, for null) to read again. */
export function invalidate(path: string | null = null): void {
  for (const cb of Array.from(listeners)) cb(path)
}

let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Invalidate everything, but once for a burst of calls. A CSV import fires
 * several requests in a row; reloading every screen after each would be a storm.
 */
export function invalidateSoon(delayMs = 300): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = undefined; invalidate(null) }, delayMs)
}
