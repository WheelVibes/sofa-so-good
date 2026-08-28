import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'
import { Modal } from '../Modal'
import { Icon } from '../toolbar/icons'

/**
 * The guard on the most destructive action in the app: starting a new apartment
 * throws away the current plan AND every piece of furniture standing in it.
 *
 * A modal rather than a yes/no confirm because there are two honest answers to
 * "new plan" — a bare canvas to draw on, or a starter room to push around — and
 * the old single "New" button silently picked the second while its tooltip
 * promised "a fresh, empty apartment shell", with no confirmation at all.
 * Each choice states what you get; the line below states what you lose.
 *
 * Opened from the 2D editor's Plan menu, the File menu and ⌘K, so its open state
 * lives in the store (`newPlanOpen`) rather than inside any one of them.
 */
export function NewPlanModal() {
  const open = useStore((s) => s.newPlanOpen)
  const setOpen = useStore((s) => s.setNewPlanOpen)
  const itemCount = useStore((s) => s.items.length)
  const canDraw = useFeature('floorPlanEditor')

  const start = (shell: boolean) => {
    const s = useStore.getState()
    s.newFloorPlan({ shell })
    setOpen(false)
    // Land where the work happens. Reached from the 3D File menu or ⌘K, an
    // empty canvas is otherwise just a blank screen with no visible next step —
    // the walls have to be drawn, and that is the 2D editor's job.
    if (canDraw && !s.floorPlanEditing) s.setFloorPlanEditing(true)
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Start a new apartment"
      sub="Replaces the current plan"
      footer={
        <div className="flex justify-end">
          <button type="button" className="btn btn-soft" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      }
    >
      <div className="onb-choices">
        <button type="button" className="onb-choice" onClick={() => start(false)}>
          <span className="onb-choice-ic">
            <Icon.FloorPlan width={20} height={20} />
          </span>
          <div>
            <b>Empty canvas</b>
            <em>Nothing at all — draw every wall yourself</em>
          </div>
          <Icon.ChevronRight width={18} height={18} />
        </button>
        <button type="button" className="onb-choice" onClick={() => start(true)}>
          <span className="onb-choice-ic">
            <Icon.Plus width={20} height={20} />
          </span>
          <div>
            <b>Starter room</b>
            <em>One 5.4 × 4.4 m shell to shape</em>
          </div>
          <Icon.ChevronRight width={18} height={18} />
        </button>
      </div>
      <p className="newplan-note">
        {itemCount > 0
          ? `The current plan and all ${itemCount} placed items are removed. Undo (Ctrl/⌘+Z) brings them back.`
          : 'The current plan is removed. Undo (Ctrl/⌘+Z) brings it back.'}
      </p>
    </Modal>
  )
}
