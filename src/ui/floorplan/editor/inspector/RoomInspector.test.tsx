// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../../state/store'
import { RoomInspector } from './RoomInspector'

/** A single custom-plan room, selected for the inspector. */
function placeRoom(name = "Ella's room"): string {
  const s = useStore.getState()
  s.newFloorPlan({ name: 'Test plan', shell: true })
  s.setFloorPlan({
    ...useStore.getState().floorPlan,
    walls: [],
    openings: [],
    rooms: [{ id: 'r1', name, origin: [0, 0], width: 3, depth: 3, floor: 'floor-wood-oak' }],
  })
  return 'r1'
}

describe('RoomInspector — Room type select (RM1)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to "Auto — <inferred>" when category is absent', () => {
    const id = placeRoom('Kitchen')
    const room = useStore.getState().floorPlan.rooms.find((r) => r.id === id)!
    render(<RoomInspector room={room} />)
    expect(screen.getByLabelText('Room type')).toBeTruthy()
    expect(screen.getByText('Auto — Kitchen')).toBeTruthy()
  })

  it("defaults to Auto — Other for a name the classifier can't infer", () => {
    const id = placeRoom("Ella's room")
    const room = useStore.getState().floorPlan.rooms.find((r) => r.id === id)!
    render(<RoomInspector room={room} />)
    expect(screen.getByText('Auto — Other')).toBeTruthy()
  })

  it('sets an explicit category via updateRoom (undoable)', () => {
    const id = placeRoom("Ella's room")
    const room = useStore.getState().floorPlan.rooms.find((r) => r.id === id)!
    render(<RoomInspector room={room} />)
    const trigger = screen.getByLabelText('Room type')
    act(() => {
      fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // opens the menu
    })
    act(() => {
      fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // moves to the next option (Living room)
    })
    act(() => {
      fireEvent.keyDown(trigger, { key: 'Enter' }) // commits
    })
    expect(useStore.getState().floorPlan.rooms.find((r) => r.id === id)!.category).toBe('living')
    // Undo restores the absent category.
    act(() => useStore.getState().undo())
    expect(useStore.getState().floorPlan.rooms.find((r) => r.id === id)!.category).toBeUndefined()
  })

  it('resets to auto when the first option is chosen again', () => {
    const id = placeRoom("Ella's room")
    useStore.getState().updateRoom(id, { category: 'living' })
    const room = useStore.getState().floorPlan.rooms.find((r) => r.id === id)!
    render(<RoomInspector room={room} />)
    const trigger = screen.getByLabelText('Room type')
    act(() => {
      fireEvent.keyDown(trigger, { key: 'ArrowUp' }) // opens the menu, moves up to Auto
    })
    act(() => {
      fireEvent.keyDown(trigger, { key: 'Home' })
    })
    act(() => {
      fireEvent.keyDown(trigger, { key: 'Enter' })
    })
    expect(useStore.getState().floorPlan.rooms.find((r) => r.id === id)!.category).toBeUndefined()
  })
})
