import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../state/store'
import { getThumb, putThumb } from './cache/db'
import { PROVIDERS } from './providers'
import type { ProviderId, RemoteEntry, RemoteKind, Resolution } from './types'

const limiter = (() => {
  let inFlight = 0
  const queue: (() => void)[] = []
  const tick = () => {
    while (inFlight < 8 && queue.length) {
      const job = queue.shift()!
      inFlight++
      job()
    }
  }
  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise((resolve, reject) => {
        const job = () =>
          fn()
            .then(resolve, reject)
            .finally(() => {
              inFlight--
              tick()
            })
        queue.push(job)
        tick()
      })
    },
  }
})()

export function useRemoteEntries(kind: RemoteKind): RemoteEntry[] {
  return useStore(
    useShallow((s) => {
      const all: RemoteEntry[] = []
      for (const p of Object.keys(s.remoteIndexes) as ProviderId[]) {
        for (const e of s.remoteIndexes[p].entries) {
          if (e.kind === kind) all.push(e)
        }
      }
      return all
    }),
  )
}

export function useThumbnail(entry: RemoteEntry, visible: boolean): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const cancelled = useRef(false)
  useEffect(() => {
    cancelled.current = false
    if (!visible || url) return
    const key = `${entry.provider}:${entry.slug}`
    ;(async () => {
      let blob = await getThumb(key)
      if (!blob) {
        blob = await limiter.schedule(() => PROVIDERS[entry.provider].fetchThumbnail(entry))
        await putThumb(key, blob)
      }
      if (!cancelled.current) setUrl(URL.createObjectURL(blob))
    })().catch(() => {
      // swallow; card stays placeholder
    })
    return () => {
      cancelled.current = true
    }
  }, [entry.provider, entry.slug, visible, url, entry])
  return url
}

/** In-memory per-`provider:slug:resolution` size cache (bytes, or null when the
 *  provider has no size data). Small + cheap to recompute, so it lives only for
 *  the session rather than in IDB. */
const sizeCache = new Map<string, number | null>()

/** Lazily fetch the download size (bytes) for `entry` at `resolution`, only once
 *  the card is `visible` (gated by the same IntersectionObserver as thumbnails)
 *  and cached across cards/renders. Returns `undefined` while unknown/loading,
 *  `null` when the provider exposes no size, else the byte total. */
export function useAssetSize(
  entry: RemoteEntry,
  resolution: Resolution,
  visible: boolean,
): number | null | undefined {
  const cacheKey = `${entry.provider}:${entry.slug}:${resolution}`
  const [size, setSize] = useState<number | null | undefined>(() => sizeCache.get(cacheKey))
  useEffect(() => {
    if (!visible) return
    if (sizeCache.has(cacheKey)) {
      setSize(sizeCache.get(cacheKey))
      return
    }
    const provider = PROVIDERS[entry.provider]
    if (!provider.fetchSize) {
      sizeCache.set(cacheKey, null)
      setSize(null)
      return
    }
    let cancelled = false
    limiter
      .schedule(() => provider.fetchSize!(entry, resolution))
      .then((n) => {
        const v = n ?? null
        sizeCache.set(cacheKey, v)
        if (!cancelled) setSize(v)
      })
      .catch(() => {
        if (!cancelled) setSize(null)
      })
    return () => {
      cancelled = true
    }
  }, [entry, entry.provider, resolution, visible, cacheKey])
  return size
}

export function useResolveStatus(key: string): 'idle' | 'fetching' | 'ready' | 'error' {
  return useStore((s) => {
    if (s.resolvedRemoteFurniture[key] || s.resolvedRemoteMaterials[key]) return 'ready'
    return s.remoteFetches[key] ?? 'idle'
  })
}
