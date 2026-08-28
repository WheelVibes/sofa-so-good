import { useState } from 'react'
import { useStore } from '../../../state/store'
import { Select } from '../../controls/Select'
import { confirmDeleteSavedPlan, confirmLoadSavedPlan } from '../../planActions'
import { SaveTemplateModal } from '../SaveTemplateModal'

export function PlanLibrary() {
  const saved = useStore((s) => s.savedPlans)
  const plan = useStore((s) => s.floorPlan)
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
        <Select
          value=""
          onChange={(v) => {
            // Loading replaces the whole plan — confirm first (it used to swap
            // on the select's change event with no way back but Ctrl+Z).
            const entry = saved.find((p) => p.id === v)
            if (entry) void confirmLoadSavedPlan(entry.id, entry.name)
          }}
          title="Load a saved apartment"
          className="input"
          style={{ width: 'auto' }}
          ariaLabel="Load a saved apartment"
          options={[
            { value: '', label: `Load… (${saved.length})` },
            ...saved.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      )}
      {saved.some((p) => p.name === plan.name) && (
        <button
          onClick={() => {
            const m = saved.find((p) => p.name === plan.name)
            // Library deletion is NOT part of the undo history, so it must ask.
            if (m) void confirmDeleteSavedPlan(m.id, m.name)
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
