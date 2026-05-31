import { useEffect, useRef, useState } from 'react'
import { useResolveStatus, useThumbnail } from '../../catalog/remote/hooks'
import type { RemoteEntry } from '../../catalog/remote/types'
import { useStore } from '../../state/store'

interface Props {
  entry: RemoteEntry
  onResolved: (id: string) => void
}

export function RemoteCard({ entry, onResolved }: Props) {
  const [visible, setVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const thumb = useThumbnail(entry, visible)
  const resolution = useStore((s) => s.preferredResolution)
  const resolve = useStore((s) => s.resolveRemoteAsset)
  const key = `${entry.provider}:${entry.slug}:${resolution}`
  const status = useResolveStatus(key)

  useEffect(() => {
    const el = cardRef.current
    if (!el || visible) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])

  return (
    <div
      ref={cardRef}
      className="relative flex flex-col gap-1 rounded border border-neutral-200 p-2 text-[10px]"
    >
      <div className="flex h-32 w-full items-center justify-center bg-neutral-100">
        {thumb ? (
          <img src={thumb} alt={entry.name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-neutral-300">…</span>
        )}
      </div>
      <div className="truncate font-medium text-neutral-800" title={entry.name}>
        {entry.name}
      </div>
      <div className="truncate text-[9px] text-neutral-400" title={entry.attribution}>
        {entry.attribution}
      </div>
      <button
        onClick={async () => {
          if (status === 'ready') {
            onResolved(key)
            return
          }
          await resolve(entry, resolution)
          onResolved(key)
        }}
        disabled={status === 'fetching'}
        className="rounded bg-blue-600 px-2 py-0.5 text-white disabled:bg-neutral-300"
      >
        {status === 'ready'
          ? 'Place'
          : status === 'fetching'
            ? 'Loading…'
            : status === 'error'
              ? 'Retry'
              : 'Add'}
      </button>
    </div>
  )
}
