import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  purgeRuntimeCachesOnVersionChange,
  RUNTIME_CACHE_NAMES,
  RUNTIME_CACHES_NOT_PURGED,
} from './cachePurge'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v)
    },
  }
}

describe('RUNTIME_CACHE_NAMES stays in sync with vite.config.ts', () => {
  const configPath = fileURLToPath(new URL('../../vite.config.ts', import.meta.url))
  const config = readFileSync(configPath, 'utf8')
  const declared = [...config.matchAll(/cacheName:\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1])

  it('finds the runtime caches in the config at all (guards the parser)', () => {
    expect(declared.length).toBeGreaterThanOrEqual(4)
  })

  it('every listed cache name appears as a cacheName string in vite.config.ts', () => {
    for (const name of RUNTIME_CACHE_NAMES) expect(declared).toContain(name)
  })

  // Security review R7, S3: the check used to run in the direction above only, so a
  // NEW cache (`lightmap-png-fallback`) slipped past it and outlived app updates.
  it('every cacheName in vite.config.ts is purged, or exempted with a reason', () => {
    const purged = new Set<string>(RUNTIME_CACHE_NAMES)
    const unaccounted = declared.filter((n) => !purged.has(n) && !(n in RUNTIME_CACHES_NOT_PURGED))
    expect(unaccounted).toEqual([])
    for (const [name, reason] of Object.entries(RUNTIME_CACHES_NOT_PURGED)) {
      expect(declared).toContain(name)
      expect(purged.has(name)).toBe(false)
      expect(reason.trim().length).toBeGreaterThan(20)
    }
  })

  it('the lightmap PNG cache never uses CacheFirst (its names are geometry, not pixel, hashes)', () => {
    const rule = config.slice(0, config.indexOf("cacheName: 'lightmap-png-fallback'"))
    const handler = [...rule.matchAll(/handler:\s*'(\w+)'/g)].pop()?.[1]
    expect(handler).toBe('StaleWhileRevalidate')
  })
})

describe('purgeRuntimeCachesOnVersionChange', () => {
  it('does nothing (but records the version) on the very first boot', async () => {
    const storage = fakeStorage()
    const del = vi.fn().mockResolvedValue(true)
    const ran = await purgeRuntimeCachesOnVersionChange('1.0.0.0', {
      storage,
      caches: { delete: del },
    })
    expect(ran).toBe(false)
    expect(del).not.toHaveBeenCalled()
    expect(storage.getItem('sofa.lastBootedVersion')).toBe('1.0.0.0')
  })

  it('does nothing on a repeat boot of the SAME version', async () => {
    const storage = fakeStorage({ 'sofa.lastBootedVersion': '1.0.0.0' })
    const del = vi.fn().mockResolvedValue(true)
    const ran = await purgeRuntimeCachesOnVersionChange('1.0.0.0', {
      storage,
      caches: { delete: del },
    })
    expect(ran).toBe(false)
    expect(del).not.toHaveBeenCalled()
  })

  it('purges exactly the runtime cache list on a version change, and updates the record', async () => {
    const storage = fakeStorage({ 'sofa.lastBootedVersion': '1.0.0.0' })
    const del = vi.fn().mockResolvedValue(true)
    const ran = await purgeRuntimeCachesOnVersionChange('1.0.0.1', {
      storage,
      caches: { delete: del },
    })
    expect(ran).toBe(true)
    expect(del.mock.calls.map((c) => c[0]).sort()).toEqual([...RUNTIME_CACHE_NAMES].sort())
    expect(storage.getItem('sofa.lastBootedVersion')).toBe('1.0.0.1')
  })

  it('is a no-op when localStorage is unavailable', async () => {
    const del = vi.fn()
    const ran = await purgeRuntimeCachesOnVersionChange('1.0.0.1', {
      storage: undefined,
      caches: { delete: del },
    })
    expect(ran).toBe(false)
    expect(del).not.toHaveBeenCalled()
  })

  it('swallows a caches.delete failure — a stale entry is not a crash', async () => {
    const storage = fakeStorage({ 'sofa.lastBootedVersion': '1.0.0.0' })
    const del = vi.fn().mockRejectedValue(new Error('quota'))
    await expect(
      purgeRuntimeCachesOnVersionChange('1.0.0.1', { storage, caches: { delete: del } }),
    ).resolves.toBe(true)
  })

  it('works with no CacheStorage available at all (e.g. SW disabled)', async () => {
    const storage = fakeStorage({ 'sofa.lastBootedVersion': '1.0.0.0' })
    await expect(
      purgeRuntimeCachesOnVersionChange('1.0.0.1', { storage, caches: undefined }),
    ).resolves.toBe(true)
  })
})
