import { type PrimitiveShapeKind, SHAPE_LABEL } from '../../furniture/glbEdit/editSpec'
import { Icon } from '../toolbar/icons'

// Primitives first, then the Stage-1a profile-driven "More shapes" cluster.
const PRIMITIVE_KINDS: PrimitiveShapeKind[] = [
  'box',
  'cylinder',
  'sphere',
  'cone',
  'pyramid',
  'capsule',
  'torus',
  'wedge',
]
const PROFILE_SHAPE_KINDS: PrimitiveShapeKind[] = ['lathe', 'extrude', 'sweep']

/**
 * The designer's build toolbar: undo/redo (with disabled states, mirroring the
 * dialog's ⌘Z / ⇧⌘Z) + the "Add shape" primitive palette. Purely presentational —
 * the dialog owns the spec + history.
 */
export function DesignerToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddShape,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onAddShape: (kind: PrimitiveShapeKind) => void
}) {
  return (
    <div className="sec">
      <div className="sec-h">
        <span>Add shape</span>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            aria-label="Undo"
            title="Undo (⌘Z)"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Icon.Undo width={14} height={14} />
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Icon.Redo width={14} height={14} />
          </button>
        </div>
      </div>
      <div className="action-grid two">
        {PRIMITIVE_KINDS.map((kind) => (
          <button key={kind} type="button" className="act" onClick={() => onAddShape(kind)}>
            {SHAPE_LABEL[kind]}
          </button>
        ))}
      </div>
      <div
        className="label"
        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', margin: 'var(--s-2) 0 4px' }}
      >
        More shapes
      </div>
      <div className="action-grid">
        {PROFILE_SHAPE_KINDS.map((kind) => (
          <button key={kind} type="button" className="act" onClick={() => onAddShape(kind)}>
            {SHAPE_LABEL[kind]}
          </button>
        ))}
      </div>
    </div>
  )
}
