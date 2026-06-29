import { useFeature } from '../../../features/useFeature'
import { firstEditableRoomId } from '../../../state/rooms'
import { useStore } from '../../../state/store'
import { Item, Section } from './parts'

/** Edit — step into a room / reshape the floor plan (overview only). */
export function EditHomeSection({
  activeId,
  act,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean }) => () => void
}) {
  const s = useStore
  const floorPlanForRooms = useStore((st) => st.floorPlan)
  const fFloorPlan = useFeature('floorPlanEditor')
  // The room the "Edit a room" entry dives into — first editable room of the
  // active plan (default apartment or a custom plan's own rooms).
  const defaultEditRoomId = firstEditableRoomId(floorPlanForRooms)

  return (
    <Section id="edit-home" title="Edit" icon="Cube" activeId={activeId}>
      {defaultEditRoomId ? (
        <Item
          icon="Cube"
          label="Edit a room"
          sub="Furnish + finish a room — pick which from the header"
          tourId="edit-room"
          onClick={act(() => s.getState().enterRoomEditor(defaultEditRoomId))}
        />
      ) : null}
      {fFloorPlan ? (
        <Item
          icon="FloorPlan"
          label="Floor plan editor"
          sub="Edit walls, rooms, doors & windows"
          onClick={act(() => s.getState().setFloorPlanEditing(true))}
        />
      ) : null}
    </Section>
  )
}
