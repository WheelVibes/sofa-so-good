import { ROOMS } from '../../../apartment/constants'
import { isDefaultPlan } from '../../../floorplan/planGeometry'
import { useStore } from '../../../state/store'
import { shortcutLabel } from '../shortcuts'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'
import { SavedViewsSection } from './SavedViewsSection'

/** View cluster: top-down view, reset to 3D overview, turntable auto-orbit,
 *  and a single "Edit a room" entry (isolate one room, IKEA-planner style;
 *  the room is then switched in place from the toolbar's room dropdown). */
export function ViewMenu() {
  const requestTopView = useStore((s) => s.requestTopView)
  const requestHomeView = useStore((s) => s.requestHomeView)
  const autoRotate = useStore((s) => s.autoRotate)
  const toggleAutoRotate = useStore((s) => s.toggleAutoRotate)
  const enterRoomEditor = useStore((s) => s.enterRoomEditor)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  // The per-room editor only supports the built-in apartment (its isolated room
  // geometry comes from the apartment constants), so hide the entry on a custom
  // floor plan.
  const onDefaultPlan = useStore((s) => isDefaultPlan(s.floorPlan))
  const defaultRoomId = Object.values(ROOMS).find((r) => !r.external)?.id
  return (
    <ToolbarMenu icon="TopView" label="View" active={autoRotate || roomEditorActive}>
      <MenuItem
        icon="TopView"
        label={`Top view${chip(shortcutLabel('topView'))}`}
        sub="Top-down plan view"
        onClick={requestTopView}
      />
      <MenuItem
        icon="Reset"
        label={`Reset view${chip(shortcutLabel('resetView'))}`}
        sub="Back to the 3D overview"
        onClick={requestHomeView}
      />
      <MenuItem
        icon="Turntable"
        label="Turntable"
        sub="Slowly auto-orbit the model"
        active={autoRotate}
        onClick={toggleAutoRotate}
      />
      {defaultRoomId && onDefaultPlan ? (
        <>
          <div className="my-1 border-t border-[var(--border)]" />
          <MenuItem
            icon="FloorPlan"
            label="Edit a room"
            sub="Isolate a room — switch from the toolbar"
            active={roomEditorActive}
            onClick={() => enterRoomEditor(defaultRoomId)}
          />
        </>
      ) : null}
      <SavedViewsSection />
    </ToolbarMenu>
  )
}

function chip(s: string): string {
  return s ? `  (${s})` : ''
}
