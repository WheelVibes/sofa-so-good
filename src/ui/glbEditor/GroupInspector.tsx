import type { PartGroup, SymmetryMode } from '../../furniture/glbEdit/editSpec'
import { Icon } from '../toolbar/icons'

/**
 * The GLB designer's per-transform-group edit panel (Stage 3a), shown when a
 * whole **group** is selected (distinct from a single part). Rename, numeric
 * group Position / Rotation (the same fields the group gizmo writes back to, so
 * a group can be moved precisely by typing as well as by dragging), plus the
 * Ungroup / Duplicate / Mirror actions. Purely presentational — the dialog owns
 * the spec; edits flow through `onPatchTransform` / `onRename` / the actions.
 */
export function GroupInspector({
  group,
  onRename,
  onPatchTransform,
  onUngroup,
  onDuplicate,
  onMirror,
  onRepeat,
}: {
  group: PartGroup
  onRename: (name: string) => void
  onPatchTransform: (patch: {
    position?: [number, number, number]
    rotation?: [number, number, number]
  }) => void
  onUngroup: () => void
  onDuplicate: () => void
  onMirror: () => void
  /** Symmetric "Repeat" — mirror the group to 2/4 positions about the asset
   *  bbox centre (Stage 3b). The real win for legs/feet placed one at a time. */
  onRepeat: (mode: SymmetryMode) => void
}) {
  const position = group.position ?? [0, 0, 0]
  const rotation = group.rotation ?? [0, 0, 0]
  const fields: {
    key: 'position' | 'rotation'
    label: string
    values: [number, number, number]
    step: number
    min: number
    max?: number
  }[] = [
    { key: 'position', label: 'Group position (m)', values: position, step: 0.05, min: -3, max: 3 },
    {
      key: 'rotation',
      label: 'Group rotation (°)',
      values: rotation,
      step: 15,
      min: -180,
      max: 180,
    },
  ]
  return (
    <div className="sec">
      <div className="sec-h">
        <span>Edit group</span>
      </div>
      <div style={{ marginBottom: 'var(--s-2)' }}>
        <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Name
        </div>
        <input
          className="input"
          style={{ width: '100%' }}
          value={group.name}
          aria-label="Group name"
          onChange={(e) => onRename(e.target.value)}
        />
      </div>
      {fields.map(({ key, label, values, step, min, max }) => (
        <div key={key} style={{ marginBottom: 'var(--s-2)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            {label}
          </div>
          <div style={{ display: 'flex', gap: 'var(--s-1)' }}>
            {[0, 1, 2].map((axis) => (
              <input
                key={axis}
                type="number"
                className="input"
                step={step}
                min={min}
                max={max}
                value={values[axis]}
                aria-label={`group ${key} ${'XYZ'[axis]}`}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  const next = values.map((o, k) => (k === axis ? v : o)) as [
                    number,
                    number,
                    number,
                  ]
                  onPatchTransform({ [key]: next })
                }}
                style={{ width: '33%' }}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="action-grid" style={{ marginTop: 'var(--s-2)' }}>
        <button type="button" className="act" aria-label="Duplicate group" onClick={onDuplicate}>
          <Icon.Copy width={13} height={13} /> Duplicate
        </button>
        <button type="button" className="act" aria-label="Mirror group" onClick={onMirror}>
          <Icon.FlipH width={13} height={13} /> Mirror
        </button>
        <button type="button" className="act" aria-label="Ungroup" onClick={onUngroup}>
          <Icon.Close width={13} height={13} /> Ungroup
        </button>
      </div>
      <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-1)' }}>
        Moving/rotating the group moves every shape in it together. Ungroup releases the shapes
        where they are (nothing jumps).
      </div>

      {/* Symmetric repeat (Stage 3b): mirror a placed fitting to the opposite
          side(s) about the asset bounding-box centre — place one leg, get four. */}
      <div
        className="label"
        style={{
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          margin: 'var(--s-2) 0 var(--s-1)',
        }}
      >
        Repeat to corners
      </div>
      <div className="action-grid">
        <button
          type="button"
          className="act"
          aria-label="Mirror to opposite side (X)"
          onClick={() => onRepeat('mirror-x')}
        >
          Mirror X
        </button>
        <button
          type="button"
          className="act"
          aria-label="Mirror to opposite side (Z)"
          onClick={() => onRepeat('mirror-z')}
        >
          Mirror Z
        </button>
        <button
          type="button"
          className="act"
          aria-label="Repeat to all four corners"
          onClick={() => onRepeat('quad')}
        >
          Repeat ×4
        </button>
      </div>
    </div>
  )
}
