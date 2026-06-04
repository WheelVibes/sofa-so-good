import { ROOMS } from '../../../apartment/constants'
import { useStore } from '../../../state/store'
import { shortcutLabel } from '../shortcuts'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'

/** View cluster: top-down view, reset to 3D overview, turntable auto-orbit,
 *  and per-room editor entry (isolate one room, IKEA-planner style). */
export function ViewMenu() {
  const requestTopView = useStore((s) => s.requestTopView)
  const requestHomeView = useStore((s) => s.requestHomeView)
  const autoRotate = useStore((s) => s.autoRotate)
  const toggleAutoRotate = useStore((s) => s.toggleAutoRotate)
  const enterRoomEditor = useStore((s) => s.enterRoomEditor)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
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
      <div className="my-1 border-t border-[var(--border)]" />
      {Object.values(ROOMS)
        .filter((r) => !r.external)
        .map((r) => (
          <MenuItem
            key={r.id}
            icon="FloorPlan"
            label={`Edit room: ${r.name}`}
            sub="Isolate this room to plan furniture"
            onClick={() => enterRoomEditor(r.id)}
          />
        ))}
    </ToolbarMenu>
  )
}

function chip(s: string): string {
  return s ? `  (${s})` : ''
}
