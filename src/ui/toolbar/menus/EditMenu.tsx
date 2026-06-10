import { useFeature } from '../../../features/useFeature'
import { isDefaultPlan } from '../../../floorplan/planGeometry'
import { firstEditableRoomId } from '../../../state/rooms'
import { useStore } from '../../../state/store'
import { shortcutLabel } from '../shortcuts'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'

/** Edit cluster (orbit overview): the ways to *change the home itself* — step
 *  into a room to furnish & finish it, or open the 2D floor-plan editor to
 *  reshape walls, rooms, doors & windows. Grouped here (not under View) so the
 *  "look at it" controls and the "change it" controls are clearly separate. */
export function EditMenu() {
  const enterRoomEditor = useStore((s) => s.enterRoomEditor)
  const floorPlan = useStore((s) => s.floorPlan)
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const toggleFloorPlanEditing = useStore((s) => s.toggleFloorPlanEditing)
  const fFloorPlan = useFeature('floorPlanEditor')
  const editRoomId = firstEditableRoomId(floorPlan)
  const planLabel = isDefaultPlan(floorPlan) ? 'the default flat' : 'walls, rooms, doors & windows'

  return (
    <ToolbarMenu icon="Cube" label="Edit" active={floorPlanEditing} width={244}>
      <MenuItem
        icon="Cube"
        label="Edit a room"
        sub="Furnish & finish a room"
        ariaLabel="Edit a room"
        onClick={() => editRoomId && enterRoomEditor(editRoomId)}
      />
      {fFloorPlan ? (
        <MenuItem
          icon="FloorPlan"
          label={`Floor plan editor${chip(shortcutLabel('togglePlanEditor'))}`}
          sub={`Reshape ${planLabel}`}
          active={floorPlanEditing}
          onClick={toggleFloorPlanEditing}
        />
      ) : null}
    </ToolbarMenu>
  )
}

function chip(s: string): string {
  return s ? `  (${s})` : ''
}
