/**
 * View ⇄ Edit toggle for the 2D plan editor header. View = pan/zoom + tap-to-inspect
 * only (safe one-finger pan on touch); Edit reveals the drawing tools + lets you
 * move/draw. Extracted from `FloorPlanEditor` (REFAC-2) — purely presentational,
 * the click-side effects (resetting the tool/drafts on entering View) stay owned
 * by the caller.
 */
export function EditModeToggle({
  editMode,
  onView,
  onEdit,
}: {
  editMode: 'view' | 'edit'
  onView: () => void
  onEdit: () => void
}) {
  return (
    <div className="seg accent">
      <button
        type="button"
        className={editMode === 'view' ? 'on' : ''}
        aria-pressed={editMode === 'view'}
        onClick={onView}
        title="View — pan & zoom only; dragging never moves anything"
      >
        View
      </button>
      <button
        type="button"
        className={editMode === 'edit' ? 'on' : ''}
        aria-pressed={editMode === 'edit'}
        onClick={onEdit}
        title="Edit — draw + move items (on touch, tap an item before dragging it)"
      >
        Edit
      </button>
    </div>
  )
}
