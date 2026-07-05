// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
})
