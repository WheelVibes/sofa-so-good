import { useState } from 'react'
import { useStore } from '../../../state/store'
import { SaveTemplateModal } from '../SaveTemplateModal'

export function PlanLibrary() {
  const saved = useStore((s) => s.savedPlans)
  const plan = useStore((s) => s.floorPlan)
  const a = useStore.getState()
  const [saveOpen, setSaveOpen] = useState(false)
  return (
    <div className="flex items-center gap-1">
      <SaveTemplateModal open={saveOpen} onClose={() => setSaveOpen(false)} />
      <button
        type="button"
        onClick={() => setSaveOpen(true)}
        title="Save this apartment to your library (with its category)"
        className="btn btn-soft btn-sm"
      >
        Save
      </button>
      {saved.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) a.loadSavedPlan(e.target.value)
          }}
          title="Load a saved apartment"
          className="input"
          style={{ width: 'auto' }}
        >
          <option value="">Load… ({saved.length})</option>
          {saved.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {saved.some((p) => p.name === plan.name) && (
        <button
          onClick={() => {
            const m = saved.find((p) => p.name === plan.name)
            if (m) a.deleteSavedPlan(m.id)
          }}
          title="Delete this saved apartment from the library"
          className="btn btn-danger btn-sm"
        >
          Delete
        </button>
      )}
    </div>
  )
}
