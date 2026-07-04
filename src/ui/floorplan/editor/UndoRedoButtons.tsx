import { Icon } from '../../toolbar/icons'

/**
 * Undo/redo buttons (also bound to ⌘Z / ⇧⌘Z globally) — visible in the plan
 * editor toolbar since touch has no keyboard shortcut. Extracted from
 * `FloorPlanEditor` (REFAC-2); purely presentational.
 */
export function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  return (
    <div className="seg" style={{ alignItems: 'center' }}>
      <button
        type="button"
        title="Undo (⌘Z)"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Icon.Undo width={16} height={16} />
      </button>
      <button
        type="button"
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Icon.Redo width={16} height={16} />
      </button>
    </div>
  )
}
