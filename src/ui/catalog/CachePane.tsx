import { useStore } from '../../state/store'
import { Button } from '../controls/Button'

const fmt = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

export function CachePane() {
  const bytes = useStore((s) => s.remoteCacheBytes)
  const clear = useStore((s) => s.clearRemoteCache)
  return (
    <div
      className="flex items-center justify-between"
      style={{
        borderTop: '1px solid var(--border)',
        padding: 'var(--s-3) var(--s-4)',
        fontSize: 'var(--t-2xs)',
        color: 'var(--text-3)',
      }}
    >
      <span>Cache: {fmt(bytes)}</span>
      <Button size="sm" onClick={() => void clear()}>
        Clear
      </Button>
    </div>
  )
}
