import { CSG_OPS, type CsgOp } from '../../furniture/glbEdit/csgCombine'
import { SHAPE_LABEL, type ShapePart } from '../../furniture/glbEdit/editSpec'
import { Select } from '../controls/Select'

/**
 * The designer's boolean-combine (CSG) panel: pick a second part and union /
 * subtract / intersect it with the selected one into a single baked `mesh` part.
 * Shown only when a part is selected and there is more than one part. Purely
 * presentational — the dialog owns the (async) combine.
 */
export function CombinePanel({
  sel,
  parts,
  combineWithId,
  combining,
  onPickCombineWith,
  onCombine,
}: {
  sel: ShapePart
  parts: ShapePart[]
  combineWithId: string
  combining: boolean
  onPickCombineWith: (id: string) => void
  onCombine: (op: CsgOp) => void
}) {
  return (
    <div className="sec">
      <div className="sec-h">
        <span>Combine (boolean)</span>
      </div>
      <Select
        className="input"
        ariaLabel="Combine with"
        value={combineWithId}
        onChange={onPickCombineWith}
        style={{ width: '100%', marginBottom: 'var(--s-2)' }}
        options={[
          { value: '', label: 'with…' },
          ...parts
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.id !== sel.id)
            .map(({ p, i }) => ({ value: p.id, label: `${p.kind} ${i + 1}` })),
        ]}
      />
      <div className="action-grid two">
        {CSG_OPS.map(({ op, label }) => (
          <button
            key={op}
            type="button"
            className="act"
            disabled={!combineWithId || combining}
            aria-label={`${label} ${sel.kind} with selected part`}
            onClick={() => onCombine(op)}
          >
            {combining ? '…' : label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 4 }}>
        Merges both shapes into one ("{SHAPE_LABEL.mesh}"), preserving each part's own finish on its
        faces. Subtract carves the picked shape out of this one. Shapes only — the source model
        can't be combined. Undo (⌘Z) reverses a combine.
      </div>
    </div>
  )
}
