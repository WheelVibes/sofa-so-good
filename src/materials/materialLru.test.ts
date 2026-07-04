import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LruCache } from './materialLru'

/**
 * AUD-002 — the bounded LRU that backs the furniture material/texture caches.
 * Eviction disposal is deferred one frame (rAF/setTimeout) so a still-mounted
 * mesh has unmounted first, so the tests drive fake timers to flush it.
 */
describe('LruCache (AUD-002)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Force the setTimeout fallback path (deterministic to flush with timers).
    vi.stubGlobal('requestAnimationFrame', undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  /** Flush the one-frame-deferred disposal. */
  const flush = () => vi.runAllTimers()

  it('stays bounded at max and evicts in LRU order', () => {
    const disposed: string[] = []
    const c = new LruCache<string>({ max: 3, dispose: (v) => disposed.push(v) })
    c.set('a', 'A')
    c.set('b', 'B')
    c.set('c', 'C')
    expect(c.size).toBe(3)

    c.set('d', 'D') // overflow → evict LRU ('a')
    expect(c.size).toBe(3)
    flush()
    expect(disposed).toEqual(['A'])
    expect(c.get('a')).toBeUndefined()
    expect(c.get('d')).toBe('D')
  })

  it('calls dispose on every evicted entry, eldest first', () => {
    const dispose = vi.fn()
    const c = new LruCache<string>({ max: 2, dispose })
    c.set('a', 'A')
    c.set('b', 'B')
    c.set('c', 'C') // evict A
    c.set('d', 'D') // evict B
    flush()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenNthCalledWith(1, 'A')
    expect(dispose).toHaveBeenNthCalledWith(2, 'B')
  })

  it('get() refreshes recency so the touched key survives the next eviction', () => {
    const disposed: string[] = []
    const c = new LruCache<string>({ max: 2, dispose: (v) => disposed.push(v) })
    c.set('a', 'A')
    c.set('b', 'B')
    // Touch 'a' → 'b' becomes the LRU.
    expect(c.get('a')).toBe('A')
    c.set('c', 'C') // evicts the now-LRU 'b'
    flush()
    expect(disposed).toEqual(['B'])
    expect(c.get('a')).toBe('A')
    expect(c.get('b')).toBeUndefined()
  })

  it('re-inserting an existing key refreshes recency without disposing the live value', () => {
    const dispose = vi.fn()
    const c = new LruCache<string>({ max: 2, dispose })
    c.set('a', 'A')
    c.set('b', 'B')
    // Re-insert 'a' (same identity): must NOT dispose, and must make 'b' the LRU.
    c.set('a', 'A')
    flush()
    expect(dispose).not.toHaveBeenCalled()
    expect(c.size).toBe(2)

    c.set('c', 'C') // evicts 'b' (the LRU after 'a' was refreshed)
    flush()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledWith('B')
    expect(c.get('a')).toBe('A')
  })

  it('does not dispose anything while under capacity', () => {
    const dispose = vi.fn()
    const c = new LruCache<string>({ max: 4, dispose })
    c.set('a', 'A')
    c.set('b', 'B')
    flush()
    expect(dispose).not.toHaveBeenCalled()
    expect(c.size).toBe(2)
  })

  it('clamps a non-positive max to at least 1', () => {
    const dispose = vi.fn()
    const c = new LruCache<string>({ max: 0, dispose })
    c.set('a', 'A')
    c.set('b', 'B') // evicts 'a'
    flush()
    expect(c.size).toBe(1)
    expect(dispose).toHaveBeenCalledWith('A')
  })

  it('delete() removes a key immediately without disposing (caller owns disposal)', () => {
    const dispose = vi.fn()
    const c = new LruCache<string>({ max: 4, dispose })
    c.set('a', 'A')
    c.set('b', 'B')

    expect(c.delete('a')).toBe('A')
    expect(c.size).toBe(1)
    flush()
    expect(dispose).not.toHaveBeenCalled()

    // Removing an absent key is a no-op that returns undefined.
    expect(c.delete('missing')).toBeUndefined()
    expect(c.size).toBe(1)
  })

  it('clearForTest disposes every entry synchronously', () => {
    const dispose = vi.fn()
    const c = new LruCache<string>({ max: 4, dispose })
    c.set('a', 'A')
    c.set('b', 'B')
    c.clearForTest()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(c.size).toBe(0)
  })
})
