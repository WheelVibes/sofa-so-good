import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { purgeRuntimeCachesOnVersionChange, RUNTIME_CACHE_NAMES } from './cachePurge'

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
  it('every listed cache name appears as a cacheName string in vite.config.ts', () => {
    const configPath = fileURLToPath(new URL('../../vite.config.ts', import.meta.url))
    const config = readFileSync(configPath, 'utf8')
    for (const name of RUNTIME_CACHE_NAMES) {
      expect(config).toContain(`cacheName: '${name}'`)
    }
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
