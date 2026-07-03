// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import * as sw from './swUpdate'

beforeEach(() => {
  useStore.setState({ notifications: [] })
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
})

describe('showUpdatePrompt', () => {
  it('surfaces a non-dismissing "Update available" toast with an Update action', async () => {
    sw.showUpdatePrompt()
    const n = useStore.getState().notifications.at(-1)
    expect(n?.kind).toBe('info')
    expect(n?.title).toBe('Update available')
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
    expect(list.some((n) => n.title === 'Update available')).toBe(false)
    expect(list.filter((x) => x.kind === 'progress')).toHaveLength(0)
  })

  it('jumps straight to the Update prompt when a worker is already waiting (no spinner)', async () => {
    setServiceWorker({
      getRegistration: async () => ({ update: async () => {}, installing: null, waiting: {} }),
    })
    await sw.runUpdateCheck()
    const list = useStore.getState().notifications
    expect(list.at(-1)?.title).toBe('Update available')
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
    expect(list.at(-1)?.title).toBe('Update available')
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
