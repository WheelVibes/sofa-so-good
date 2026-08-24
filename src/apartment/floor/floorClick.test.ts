import { describe, expect, it } from 'vitest'
import { floorClickAction } from './floorClick'

describe('floorClickAction', () => {
  it('opens the finish picker inside the room editor — the custom-plan gap', () => {
    // `PlanRoomFloor` used to skip this branch entirely, so on a custom plan a
    // floor click in the room editor did nothing and the finishes panel was
    // unreachable from the canvas.
    expect(floorClickAction({ canEdit: true, cameraMode: 'orbit', roomEditorActive: true })).toBe(
      'select-room',
    )
  })

  it('dives into a room from the view-only overview', () => {
    expect(floorClickAction({ canEdit: false, cameraMode: 'orbit', roomEditorActive: false })).toBe(
      'enter-room',
    )
  })

  it('ignores floor clicks in walk mode', () => {
    expect(floorClickAction({ canEdit: false, cameraMode: 'walk', roomEditorActive: false })).toBe(
      'none',
    )
  })

  it('does not re-enter a room the user is already inside', () => {
    expect(floorClickAction({ canEdit: false, cameraMode: 'orbit', roomEditorActive: true })).toBe(
      'none',
    )
  })

  it('prefers selecting over entering when both could apply', () => {
    expect(floorClickAction({ canEdit: true, cameraMode: 'orbit', roomEditorActive: false })).toBe(
      'select-room',
    )
  })
})
