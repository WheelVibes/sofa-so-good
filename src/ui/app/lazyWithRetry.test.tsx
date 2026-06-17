import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  importWithRetry,
  isChunkLoadError,
  lazyWithRetry,
  reloadForFreshChunks,
} from './lazyWithRetry'

const chunkError = () => new Error('Failed to fetch dynamically imported module: /assets/x.js')

describe('isChunkLoadError', () => {
  it('matches the dynamic-import / module-script failure family', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new Error('Loading chunk 42 failed'))).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('kaboom in render'))).toBe(false)
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('reloadForFreshChunks', () => {
  let reload: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    sessionStorage.clear()
    reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })
  afterEach(() => vi.restoreAllMocks())

  it('reloads once when online', () => {
    expect(reloadForFreshChunks()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload again within the cooldown window (no loop)', () => {
    expect(reloadForFreshChunks()).toBe(true)
    expect(reloadForFreshChunks()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads while offline (a reload cannot fetch the chunk)', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(reloadForFreshChunks()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('importWithRetry', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })
  afterEach(() => vi.restoreAllMocks())

  it('resolves immediately when the import succeeds', async () => {
    const factory = vi.fn().mockResolvedValue({ default: 'ok' })
    await expect(importWithRetry(factory)).resolves.toEqual({ default: 'ok' })
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('retries a chunk-load failure and then succeeds', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValue({ default: 'recovered' })
    await expect(importWithRetry(factory, 2, 1)).resolves.toEqual({ default: 'recovered' })
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('surfaces a non-chunk error without retrying', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('kaboom in render'))
    await expect(importWithRetry(factory, 2, 1)).rejects.toThrow('kaboom in render')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('reloads (instead of rejecting) when retries are exhausted online', async () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    const factory = vi.fn().mockRejectedValue(chunkError())
    // The recovery path returns a never-resolving promise; race it against a tick.
    const pending = importWithRetry(factory, 1, 1)
    const sentinel = Symbol('pending')
    const result = await Promise.race([
      pending,
      new Promise((r) => setTimeout(() => r(sentinel), 30)),
    ])
    expect(result).toBe(sentinel)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledTimes(2) // initial + 1 retry
  })

  it('rejects when retries are exhausted offline (no reload possible)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const factory = vi.fn().mockRejectedValue(chunkError())
    await expect(importWithRetry(factory, 1, 1)).rejects.toThrow(/dynamically imported module/)
  })
})

describe('lazyWithRetry', () => {
  it('returns a React lazy component', () => {
    const C = lazyWithRetry(async () => ({ default: () => null }))
    // React.lazy components are objects tagged with a lazy $$typeof symbol.
    expect(typeof C).toBe('object')
    expect(C).toHaveProperty('$$typeof')
  })
})
