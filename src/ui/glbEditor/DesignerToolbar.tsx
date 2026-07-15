import { SHAPE_KINDS, SHAPE_LABEL } from '../../furniture/glbEdit/editSpec'
import { Icon } from '../toolbar/icons'

const SHAPES: { kind: (typeof SHAPE_KINDS)[number]; label: string }[] = SHAPE_KINDS.map((kind) => ({
  kind,
  label: SHAPE_LABEL[kind],
}))

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
  onAddShape: (kind: (typeof SHAPE_KINDS)[number]) => void
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
        {SHAPES.map((s) => (
          <button key={s.kind} type="button" className="act" onClick={() => onAddShape(s.kind)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
