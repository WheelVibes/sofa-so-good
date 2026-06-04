import { useStore } from '../../state/store'

const fmt = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

export function CachePane() {
  const bytes = useStore((s) => s.remoteCacheBytes)
  const clear = useStore((s) => s.clearRemoteCache)
  return (
    <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--text-3)]">
      <span>Cache: {fmt(bytes)}</span>
      <button
        onClick={() => void clear()}
        className="rounded bg-[var(--surface-3)] px-2 py-0.5 hover:bg-[var(--surface-3)]"
      >
        Clear
      </button>
    </div>
  )
}
