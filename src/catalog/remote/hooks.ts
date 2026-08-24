import { useCallback, useEffect, useRef, useState } from 'react'
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

/** What a card needs to render a thumbnail: the blob URL once it is there, a
 *  `failed` flag so a dead fetch shows a retry affordance instead of an eternal
 *  skeleton, and the retry itself. */
export interface ThumbnailState {
  url?: string
  failed: boolean
  retry(): void
}

export function useThumbnail(entry: RemoteEntry, visible: boolean): ThumbnailState {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const cancelled = useRef(false)
  // The created object URL is tracked here and revoked ONLY on unmount — not in
  // the main effect's cleanup, which re-runs whenever `url` changes and would
  // otherwise revoke the URL we just set + are still rendering (BUG-007).
  const objectUrl = useRef<string | null>(null)
  useEffect(() => {
    cancelled.current = false
    // `failed` is a real gate, not just a flag: it stops the effect re-running
    // straight back into a fetch that just threw, and clearing it in `retry()`
    // is what re-arms this effect.
    if (!visible || url || failed) return
    const key = `${entry.provider}:${entry.slug}`
    ;(async () => {
      let blob = await getThumb(key)
      const fetched = !blob
      if (!blob)
        blob = await limiter.schedule(() => PROVIDERS[entry.provider].fetchThumbnail(entry))
      if (!cancelled.current) {
        const u = URL.createObjectURL(blob)
        objectUrl.current = u
        setUrl(u)
      }
      // Cache AFTER showing it, and never let the write decide the outcome: a
      // failed IndexedDB put (quota, private mode) must not hide — or flag as
      // broken — a thumbnail we already have in hand.
      if (fetched) await putThumb(key, blob).catch(() => {})
    })().catch(() => {
      // The card shows a Retry chip rather than sitting on its skeleton — a
      // swallowed rejection here is what made a broken thumb URL look like a
      // load that never finished.
      if (!cancelled.current) setFailed(true)
    })
    return () => {
      cancelled.current = true
    }
  }, [entry.provider, entry.slug, visible, url, entry, failed])
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
  const retry = useCallback(() => setFailed(false), [])
  return { url, failed, retry }
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
