// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { pointInRoom } from '../floorplan/types'
import { useStore } from '../state/store'
import { EmptyRoomHint } from './EmptyRoomHint'

/** Put the store into "editing an empty room in orbit, catalog closed" — the one
 *  state in which the hint shows. `items: []` makes the room read as empty
 *  regardless of the room polygon (the point-in-room test is never reached). */
function showState() {
  const s = useStore.getState()
  useStore.setState({
    roomEditor: { active: true, roomId: 'r1' },
    floorPlan: { ...s.floorPlan, rooms: [{ id: 'r1', name: 'Room' }] },
    items: [],
    cameraMode: 'orbit',
    catalogOpen: false,
  } as never)
}

/** Editing the empty Main Bedroom of the real default flat, so the starter chips
 *  resolve a room kind AND `addStarter` finds a real room shell to place into. */
function showDefaultFlatBedroom() {
  useStore.setState({
    roomEditor: { active: true, roomId: 'mainBedroom' },
    floorPlan: buildDefaultPlan(),
    items: [],
    cameraMode: 'orbit',
    catalogOpen: false,
  } as never)
}

function setMode(mode: 'simple' | 'pro') {
  useStore.getState().setUiMode(mode)
  useStore.getState().reresolveFeatureFlags()
}

describe('EmptyRoomHint', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('shows the empty-room hint and can be dismissed (stays hidden)', () => {
    showState()
    const { rerender } = render(<EmptyRoomHint />)
    expect(screen.getByText('This room is empty')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(useStore.getState().dismissedCallouts).toContain('empty-room-hint')

    rerender(<EmptyRoomHint />)
    expect(screen.queryByText('This room is empty')).toBeNull()
  })

  it('does not render when the catalog is open', () => {
    showState()
    useStore.setState({ catalogOpen: true } as never)
    render(<EmptyRoomHint />)
    expect(screen.queryByText('This room is empty')).toBeNull()
  })

  it('shows no starter chips for an unmapped room kind (plain prompt only)', () => {
    showState() // room named "Room" → kind 'other' → no chips
    render(<EmptyRoomHint />)
    expect(screen.getByRole('button', { name: /open catalog/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /queen bed/i })).toBeNull()
  })

  // roomStarters is simple-tier → present in BOTH modes.
  for (const mode of ['simple', 'pro'] as const) {
    it(`renders room-kind starter chips in ${mode} mode`, () => {
      showDefaultFlatBedroom()
      setMode(mode)
      render(<EmptyRoomHint />)
      expect(screen.getByRole('button', { name: /queen bed/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /wardrobe/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /nightstand/i })).toBeInTheDocument()
    })
  }

  it('adds one sensibly-placed piece in-room when a chip is tapped', () => {
    showDefaultFlatBedroom()
    setMode('simple')
    render(<EmptyRoomHint />)
    expect(useStore.getState().items).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /queen bed/i }))

    const items = useStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]!.defId).toBe('bed-queen')
    const room = useStore.getState().floorPlan.rooms.find((r) => r.id === 'mainBedroom')!
    expect(pointInRoom(room, items[0]!.position[0], items[0]!.position[1])).toBe(true)
  })

  it('hides starter chips when the roomStarters flag is off', () => {
    showDefaultFlatBedroom()
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, roomStarters: false },
    } as never)
    render(<EmptyRoomHint />)
    expect(screen.queryByRole('button', { name: /queen bed/i })).toBeNull()
    expect(screen.getByRole('button', { name: /open catalog/i })).toBeInTheDocument()
  })
})
