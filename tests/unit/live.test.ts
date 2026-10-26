import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachLive } from '@/lib/data/live'
import { invalidate, invalidateSoon } from '@/lib/data/invalidation'

// A live query is a read that repeats. What these tests pin is WHEN it reads —
// the cases where getting it wrong is silent: a screen that never shows your own
// save, a timer that keeps firing in a hidden tab, a stale answer landing on top
// of a fresh one, a request that is refused every minute forever.

let visibility: 'visible' | 'hidden' = 'visible'
const handlers = new Set<() => void>()

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  handlers.clear()
  // Just enough document for the module: the visibility flag and its event.
  vi.stubGlobal('document', {
    get visibilityState() { return visibility },
    addEventListener: (_: string, h: () => void) => handlers.add(h),
    removeEventListener: (_: string, h: () => void) => handlers.delete(h),
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A load whose answers the test releases by hand, so ordering can be controlled. */
function controlled<T>() {
  const pending: Array<(v: T) => void> = []
  const rejecters: Array<(e: unknown) => void> = []
  const load = vi.fn(() => new Promise<T>((res, rej) => { pending.push(res); rejecters.push(rej) }))
  return { load, resolve: (i: number, v: T) => pending[i](v), reject: (i: number, e: unknown) => rejecters[i](e) }
}

function start<T>(load: () => Promise<T>, over: Partial<{ path: string; pollMs: number }> = {}) {
  const applied: T[] = []
  const failed: unknown[] = []
  const stop = attachLive<T>({
    path: over.path ?? 'courses', pollMs: over.pollMs ?? 60_000,
    load, apply: (v) => applied.push(v), fail: (e) => failed.push(e),
  })
  return { applied, failed, stop }
}

describe('first read', () => {
  it('reads straight away and hands the result over', async () => {
    const load = vi.fn(async () => ['a'])
    const { applied, stop } = start(load)
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    expect(applied).toEqual([['a']])
    stop()
  })
})

describe('polling', () => {
  it('reads again every interval while the tab is visible', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { pollMs: 1000 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(load).toHaveBeenCalledTimes(4) // first + three ticks
    stop()
  })

  it('does not read while the tab is hidden', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { pollMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    visibility = 'hidden'
    await vi.advanceTimersByTimeAsync(5000)
    expect(load).toHaveBeenCalledTimes(1)
    stop()
  })

  it('catches up when the tab comes back after a while', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { pollMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    visibility = 'hidden'
    await vi.advanceTimersByTimeAsync(5000)
    visibility = 'visible'
    handlers.forEach((h) => h())
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not re-read on every flicker of visibility when it just read', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { pollMs: 60_000 })
    await vi.advanceTimersByTimeAsync(0)
    handlers.forEach((h) => h())
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops completely when stopped: no timer, no listener', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { pollMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(10_000)
    invalidate(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    expect(handlers.size).toBe(0)
  })
})

describe('being told something changed', () => {
  it('reads again when its collection is invalidated', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { path: 'courses' })
    await vi.advanceTimersByTimeAsync(0)
    invalidate('courses')
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
    stop()
  })

  it('ignores the invalidation of some other collection', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { path: 'courses' })
    await vi.advanceTimersByTimeAsync(0)
    invalidate('teams')
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    stop()
  })

  it('reads again when everything is invalidated', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { path: 'courses' })
    await vi.advanceTimersByTimeAsync(0)
    invalidate(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
    stop()
  })

  it('turns a burst of coarse invalidations into one', async () => {
    const load = vi.fn(async () => 1)
    const { stop } = start(load, { path: 'courses' })
    await vi.advanceTimersByTimeAsync(0)
    invalidateSoon(300); invalidateSoon(300); invalidateSoon(300)
    await vi.advanceTimersByTimeAsync(299)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2)
    expect(load).toHaveBeenCalledTimes(2)
    stop()
  })
})

describe('overlapping reads', () => {
  it('does not start a second read while one is running, but does not forget the request either', async () => {
    // The running read may have left before the change it was asked about, so
    // its answer could already be stale. The request is held and run after.
    const c = controlled<string>()
    const { applied, stop } = start(c.load)
    await vi.advanceTimersByTimeAsync(0)
    invalidate('courses')
    await vi.advanceTimersByTimeAsync(0)
    expect(c.load).toHaveBeenCalledTimes(1)

    c.resolve(0, 'old')
    await vi.advanceTimersByTimeAsync(0)
    expect(c.load).toHaveBeenCalledTimes(2)
    c.resolve(1, 'new')
    await vi.advanceTimersByTimeAsync(0)
    expect(applied).toEqual(['old', 'new'])
    stop()
  })

  it('collapses several requests made during one read into a single follow-up', async () => {
    const c = controlled<string>()
    const { stop } = start(c.load)
    await vi.advanceTimersByTimeAsync(0)
    invalidate('courses'); invalidate('courses'); invalidate(null)
    c.resolve(0, 'a')
    await vi.advanceTimersByTimeAsync(0)
    expect(c.load).toHaveBeenCalledTimes(2)
    c.resolve(1, 'b')
    await vi.advanceTimersByTimeAsync(0)
    expect(c.load).toHaveBeenCalledTimes(2)
    stop()
  })

  it('drops an answer that arrives after it was stopped', async () => {
    const c = controlled<string>()
    const { applied, stop } = start(c.load)
    await vi.advanceTimersByTimeAsync(0)
    stop()
    c.resolve(0, 'late')
    await vi.advanceTimersByTimeAsync(0)
    expect(applied).toEqual([])
  })
})

describe('failures', () => {
  it('reports a failed read and keeps trying on the next tick', async () => {
    let n = 0
    const load = vi.fn(async () => { if (++n === 1) throw Object.assign(new Error('down'), { status: 503 }); return 'ok' })
    const { applied, failed, stop } = start(load, { pollMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(failed).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(applied).toEqual(['ok'])
    stop()
  })

  it.each([403, 400])('gives up on a %i, which will not be different next time', async (status) => {
    const load = vi.fn(async () => { throw Object.assign(new Error('no'), { status }) })
    const { failed, stop } = start(load, { pollMs: 1000 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(load).toHaveBeenCalledTimes(1)
    expect(failed).toHaveLength(1)
    stop()
  })

  it('keeps trying after a 401, which is what signing in looks like from outside', async () => {
    const load = vi.fn(async () => { throw Object.assign(new Error('no token yet'), { status: 401 }) })
    const { stop } = start(load, { pollMs: 1000 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(load.mock.calls.length).toBeGreaterThan(1)
    stop()
  })
})
