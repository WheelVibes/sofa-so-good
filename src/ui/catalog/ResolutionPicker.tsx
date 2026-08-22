import { RESOLUTIONS } from '../../catalog/remote/types'
import { useStore } from '../../state/store'

export function ResolutionPicker() {
  const value = useStore((s) => s.preferredResolution)
  const set = useStore((s) => s.setPreferredResolution)
  return (
    <div className="flex gap-1">
      {RESOLUTIONS.map((r) => (
        <button key={r} onClick={() => set(r)} className={`seg-btn${value === r ? ' on' : ''}`}>
          {r.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
