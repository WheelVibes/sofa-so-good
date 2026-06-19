import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../state/store'
import { getThumb, putThumb } from './cache/db'
import { PROVIDERS } from './providers'
import type { ProviderId, RemoteEntry, RemoteKind } from './types'

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
  // The created object URL is tracked here and revoked ONLY on unmount — not in
  // the main effect's cleanup, which re-runs whenever `url` changes and would
  // otherwise revoke the URL we just set + are still rendering (BUG-007).
  const objectUrl = useRef<string | null>(null)
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
      if (!cancelled.current) {
        const u = URL.createObjectURL(blob)
        objectUrl.current = u
        setUrl(u)
      }
    })().catch(() => {
      // swallow; card stays placeholder
    })
    return () => {
      cancelled.current = true
    }
  }, [entry.provider, entry.slug, visible, url, entry])
  // Free the blob URL when the card unmounts (drawer close / virtualised scroll).
  useEffect(
    () => () => {
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = null
      }
    },
    [],
  )
  return url
}

/** Module-level cache of resolved download sizes (bytes), keyed by
 *  provider:slug:resolution. `null` = provider reported no size. */
const sizeCache = new Map<string, number | null>()

/** Lazily fetch the download size (bytes) for a remote entry at a resolution,
 *  once the card is visible. Returns `undefined` while unknown/loading, a
 *  number of bytes, or `null` if the provider can't report a size. */
export function useAssetSize(
  entry: RemoteEntry,
  resolution: string,
  visible: boolean,
): number | null | undefined {
  const key = `${entry.provider}:${entry.slug}:${resolution}`
  const [size, setSize] = useState<number | null | undefined>(() =>
    sizeCache.has(key) ? sizeCache.get(key) : undefined,
  )
  useEffect(() => {
    if (!visible) return
    if (sizeCache.has(key)) {
      setSize(sizeCache.get(key))
      return
    }
    const provider = PROVIDERS[entry.provider]
    if (!provider.fetchSize) {
      sizeCache.set(key, null)
      setSize(null)
      return
    }
    let cancelled = false
    limiter
      .schedule(() => provider.fetchSize!(entry, resolution as never))
      .then((bytes) => {
        sizeCache.set(key, bytes)
        if (!cancelled) setSize(bytes)
      })
      .catch(() => {
        if (!cancelled) setSize(null)
      })
    return () => {
      cancelled = true
    }
  }, [key, visible, entry, resolution])
  return size
}

export function useResolveStatus(key: string): 'idle' | 'fetching' | 'ready' | 'error' {
  return useStore((s) => {
    if (s.resolvedRemoteFurniture[key] || s.resolvedRemoteMaterials[key]) return 'ready'
    return s.remoteFetches[key] ?? 'idle'
  })
}
