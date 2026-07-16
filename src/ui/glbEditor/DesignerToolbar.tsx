import { type PrimitiveShapeKind, SHAPE_LABEL } from '../../furniture/glbEdit/editSpec'
import { UndoRedoButtons } from '../floorplan/editor/UndoRedoButtons'
import { useDesigner } from './designerContext'

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
export function DesignerToolbar() {
  const { canUndo, canRedo, doUndo: onUndo, doRedo: onRedo, addShape: onAddShape } = useDesigner()
  return (
    <div className="sec">
      <div className="sec-h">
        <span>Add shape</span>
        {/* Shared plan-editor undo/redo pair (prop-identical); the wrapper keeps
            this toolbar's right-alignment. Accepts its 16px icons. */}
        <div style={{ marginLeft: 'auto' }}>
          <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
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
