import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// Demo mode skips sign-in, so a deployed build must never run it: not from the env var, not from the browser.

async function load(nodeEnv: string, demoEnv: string, stored?: string) {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', nodeEnv)
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', demoEnv)
  if (stored !== undefined) {
    vi.stubGlobal('window', { localStorage: { getItem: () => stored, setItem: vi.fn() }, location: { reload: vi.fn() } })
  }
  return import('@/lib/demo/demoMode')
}

beforeEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('demo mode', () => {
  it('runs in development when the env var asks for it', async () => {
    const m = await load('development', 'true')
    expect(m.DEMO_MODE_ALLOWED).toBe(true)
    expect(m.getDemoMode()).toBe(true)
    expect(m.DEMO_MODE).toBe(true)
  })

  it('is off in development by default, and the browser toggle can turn it on there', async () => {
    expect((await load('development', 'false')).getDemoMode()).toBe(false)
    expect((await load('development', 'false', 'true')).getDemoMode()).toBe(true)
  })

  it('never runs in a deployed (production) build, whatever the env var says', async () => {
    const m = await load('production', 'true')
    expect(m.DEMO_MODE_ALLOWED).toBe(false)
    expect(m.getDemoMode()).toBe(false)
    expect(m.DEMO_MODE).toBe(false)
  })

  it('and the browser toggle cannot turn it on there either', async () => {
    const m = await load('production', 'true', 'true')
    expect(m.getDemoMode()).toBe(false)
    const reload = (globalThis as unknown as { window: { location: { reload: () => void } } }).window.location.reload
    m.toggleDemoMode()
    expect(reload).not.toHaveBeenCalled()
  })
})
