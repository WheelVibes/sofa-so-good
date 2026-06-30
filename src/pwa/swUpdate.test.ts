import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import * as sw from './swUpdate'

beforeEach(() => {
  useStore.setState({ notifications: [] })
})

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
      getRegistration: async () => ({ update: async () => {}, installing: null, waiting: null }),
    })
    await expect(sw.checkForUpdates()).resolves.toBe('uptodate')
  })

  it('returns updating when a worker is waiting', async () => {
    setServiceWorker({
      getRegistration: async () => ({ update: async () => {}, installing: null, waiting: {} }),
    })
    await expect(sw.checkForUpdates()).resolves.toBe('updating')
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
      getRegistration: async () => ({ update: async () => {}, installing: null, waiting: null }),
    })
    await sw.runUpdateCheck()
    const list = useStore.getState().notifications
    expect(list.at(-1)?.title).toMatch(/latest version/)
    expect(list.some((n) => n.title === 'Update available')).toBe(false)
    expect(list.filter((x) => x.kind === 'progress')).toHaveLength(0)
  })

  it('surfaces the Update prompt when a new worker is found', async () => {
    setServiceWorker({
      getRegistration: async () => ({ update: async () => {}, installing: {}, waiting: null }),
    })
    await sw.runUpdateCheck()
    const n = useStore.getState().notifications.at(-1)
    expect(n?.title).toBe('Update available')
    expect(n?.actionLabel).toBe('Update')
    expect(useStore.getState().notifications.filter((x) => x.kind === 'progress')).toHaveLength(0)
  })

  it('surfaces an error when the update check throws', async () => {
    setServiceWorker({
      getRegistration: async () => ({
        update: async () => {
          throw new Error('offline')
        },
      }),
    })
    await sw.runUpdateCheck()
    // A throwing update() resolves to 'unsupported' → the env message.
    const n = useStore.getState().notifications.at(-1)
    expect(n?.kind).toBe('info')
    expect(n?.title).toMatch(/aren’t available/)
  })
})
