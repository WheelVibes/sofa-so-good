// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import * as sw from './swUpdate'

beforeEach(() => {
  useStore.setState({ notifications: [] })
  // showUpdatePrompt fires a background fetchDeployedVersion(); without a stub,
  // happy-dom resolves the relative URL against its default origin
  // (http://localhost:3000) and the suite makes REAL network connects — noisy
  // ECONNREFUSED logs misattributed to whichever test file is reporting.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response))
})

/** Minimal event-capable stand-in for a ServiceWorker mid-install. */
function fakeWorker(initial: string) {
  const listeners = new Set<() => void>()
  return {
    state: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    setState(next: string) {
      this.state = next
      for (const fn of [...listeners]) fn()
    },
  }
}

function setServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', { value, configurable: true })
}
function clearServiceWorker() {
  Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
}

afterEach(() => {
  clearServiceWorker()
  vi.unstubAllGlobals()
})

describe('showUpdatePrompt', () => {
  it('surfaces a non-dismissing "New version available" toast with an Update action', async () => {
    sw.showUpdatePrompt()
    const n = useStore.getState().notifications.at(-1)
    expect(n?.kind).toBe('info')
    expect(n?.title).toBe('New version available')
    expect(n?.actionLabel).toBe('Update')
    expect(typeof n?.onAction).toBe('function')
    expect(n?.autoDismissMs).toBeNull() // stays until the user acts
    expect(n?.icon).toBe('Versions')
  })

  it('de-dupes — repeated calls resurface one prompt, never stack copies', () => {
    sw.showUpdatePrompt()
    sw.showUpdatePrompt()
    sw.showUpdatePrompt()
    expect(useStore.getState().notifications).toHaveLength(1)
  })

  it('stays a single prompt even after the async version line mutates the message', async () => {
    // Real-world regression: the deployed version fetch resolves and rewrites
    // the toast's `message`, which used to dodge the kind+title+message de-dupe
    // and let a later call stack a second copy.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ version: '99.0.0.0' }),
    } as Response)
    try {
      sw.showUpdatePrompt()
      await vi.waitFor(() => {
        expect(useStore.getState().notifications[0]?.message).toBe('(v99.0.0.0)')
      })
      sw.showUpdatePrompt() // repeat AFTER the message changed
      sw.showUpdatePrompt()
      expect(useStore.getState().notifications).toHaveLength(1)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('raises a fresh prompt again after the previous one was dismissed', () => {
    sw.showUpdatePrompt()
    const first = useStore.getState().notifications[0]
    expect(first).toBeDefined()
    useStore.getState().notify.dismiss(first.id)
    sw.showUpdatePrompt()
    expect(useStore.getState().notifications).toHaveLength(1)
  })
})

describe('checkForUpdates', () => {
  it('returns unsupported with no service worker', async () => {
    clearServiceWorker()
    await expect(sw.checkForUpdates()).resolves.toBe('unsupported')
  })

  it('returns uptodate when no new worker is found', async () => {
    setServiceWorker({
      getRegistration: async () => ({
        update: async () => {},
        installing: null,
        waiting: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    await expect(sw.checkForUpdates()).resolves.toBe('uptodate')
  })

  it('returns waiting when a worker is already installed and ready', async () => {
    setServiceWorker({
      getRegistration: async () => ({ update: async () => {}, installing: null, waiting: {} }),
    })
    await expect(sw.checkForUpdates()).resolves.toBe('waiting')
  })

  it('returns downloading as soon as an installing worker appears', async () => {
    setServiceWorker({
      getRegistration: async () => ({
        update: () => new Promise(() => {}), // never settles (precache in flight)
        installing: fakeWorker('installing'),
        waiting: null,
      }),
    })
    await expect(sw.checkForUpdates()).resolves.toBe('downloading')
  })
})

describe('runUpdateCheck', () => {
  it('reports unsupported when no service worker is available', async () => {
    clearServiceWorker()
    await sw.runUpdateCheck()
    const n = useStore.getState().notifications.at(-1)
    expect(n?.kind).toBe('info')
    expect(n?.title).toMatch(/aren’t available/)
    // The transient progress toast was dismissed.
    expect(useStore.getState().notifications.filter((x) => x.kind === 'progress')).toHaveLength(0)
  })

  it('reports up-to-date (no update prompt) when no new worker is found', async () => {
    setServiceWorker({
      getRegistration: async () => ({
        update: async () => {},
        installing: null,
        waiting: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    await sw.runUpdateCheck()
    const list = useStore.getState().notifications
    expect(list.at(-1)?.title).toMatch(/latest version/)
    expect(list.some((n) => n.title === 'New version available')).toBe(false)
    expect(list.filter((x) => x.kind === 'progress')).toHaveLength(0)
  })

  it('jumps straight to the Update prompt when a worker is already waiting (no spinner)', async () => {
    setServiceWorker({
      getRegistration: async () => ({ update: async () => {}, installing: null, waiting: {} }),
    })
    await sw.runUpdateCheck()
    const list = useStore.getState().notifications
    expect(list.at(-1)?.title).toBe('New version available')
    expect(list.at(-1)?.actionLabel).toBe('Update')
    expect(list.filter((x) => x.kind === 'progress')).toHaveLength(0)
  })

  it('found worker: downloading toast upgrades to the prompt once the worker is installed', async () => {
    const worker = fakeWorker('installing')
    setServiceWorker({
      getRegistration: async () => ({
        update: () => new Promise(() => {}), // stays pending while precaching
        installing: worker,
        waiting: null,
      }),
    })
    const run = sw.runUpdateCheck()
    await Promise.resolve() // let detection settle on the installing worker
    await vi.waitFor(() => {
      const dl = useStore.getState().notifications.find((n) => n.kind === 'progress')
      expect(dl?.title).toMatch(/downloading/i)
    })
    worker.setState('installed') // precache finished → worker reaches waiting
    await run
    const list = useStore.getState().notifications
    expect(list.at(-1)?.title).toBe('New version available')
    expect(list.at(-1)?.actionLabel).toBe('Update')
    expect(list.filter((x) => x.kind === 'progress')).toHaveLength(0)
  })

  it('found worker: a redundant install turns the toast into an error', async () => {
    const worker = fakeWorker('installing')
    setServiceWorker({
      getRegistration: async () => ({
        update: () => new Promise(() => {}),
        installing: worker,
        waiting: null,
      }),
    })
    const run = sw.runUpdateCheck()
    await vi.waitFor(() => {
      expect(useStore.getState().notifications.some((n) => n.kind === 'progress')).toBe(true)
    })
    worker.setState('redundant') // install/precache failed
    await run
    const n = useStore.getState().notifications.at(-1)
    expect(n?.kind).toBe('error')
    expect(n?.message).toMatch(/failed to download/)
  })

  it('detection timeout reports up-to-date instead of wedging the spinner', async () => {
    vi.useFakeTimers()
    try {
      setServiceWorker({
        getRegistration: async () => ({
          update: () => new Promise(() => {}), // stalled network — never settles
          installing: null,
          waiting: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      })
      const run = sw.runUpdateCheck()
      await vi.advanceTimersByTimeAsync(10_000)
      await run
      const list = useStore.getState().notifications
      expect(list.at(-1)?.title).toMatch(/latest version/)
      expect(list.filter((x) => x.kind === 'progress')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('in-flight guard: rapid presses collapse to one spinner and one result', async () => {
    setServiceWorker({
      getRegistration: async () => ({
        update: async () => {},
        installing: null,
        waiting: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    // Fire three presses "at once" — the guard trips synchronously on entry, so
    // only the first raises the progress spinner; the rest are ignored.
    const runs = Promise.all([sw.runUpdateCheck(), sw.runUpdateCheck(), sw.runUpdateCheck()])
    expect(useStore.getState().notifications.filter((n) => n.kind === 'progress')).toHaveLength(1)
    await runs
    const list = useStore.getState().notifications
    expect(list.filter((n) => /latest version/.test(n.title))).toHaveLength(1)
    expect(list.filter((n) => n.kind === 'progress')).toHaveLength(0)
  })

  it('in-flight guard: a repeated press that finds a waiting worker yields ONE prompt', async () => {
    setServiceWorker({
      getRegistration: async () => ({ update: async () => {}, installing: null, waiting: {} }),
    })
    await Promise.all([sw.runUpdateCheck(), sw.runUpdateCheck(), sw.runUpdateCheck()])
    const list = useStore.getState().notifications
    expect(list.filter((n) => n.title === 'New version available')).toHaveLength(1)
  })

  it('surfaces an error when the update check throws', async () => {
    setServiceWorker({
      getRegistration: async () => ({
        update: async () => {
          throw new Error('offline')
        },
        installing: null,
        waiting: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    await sw.runUpdateCheck()
    // A throwing update() resolves to 'unsupported' → the env message.
    const n = useStore.getState().notifications.at(-1)
    expect(n?.kind).toBe('info')
    expect(n?.title).toMatch(/aren’t available/)
  })
})
