import { RESOLUTIONS } from '../../catalog/remote/types'
import { useStore } from '../../state/store'

export function ResolutionPicker() {
  const value = useStore((s) => s.preferredResolution)
  const set = useStore((s) => s.setPreferredResolution)
  return (
    <div className="flex gap-1 text-[10px]">
      {RESOLUTIONS.map((r) => (
        <button
          key={r}
          onClick={() => set(r)}
          className={`rounded px-1.5 py-0.5 ${
            value === r
              ? 'bg-[var(--accent)] text-[var(--on-accent)]'
              : 'bg-[var(--surface-3)] text-[var(--text-2)]'
          }`}
        >
          {r.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
