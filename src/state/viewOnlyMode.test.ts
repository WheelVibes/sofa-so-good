import { beforeEach, describe, expect, it } from 'vitest'
import { canEditScene } from './editing'
import { useStore } from './store'

/**
 * Showroom (view-only) mode — the store-side gates (U1).
 *
 * The UI surface is gated in exactly four places, and three of them are here:
 * `canEditScene` (everything that selects, drags, transforms or picks a
 * finish), `enterRoomEditor` (the door to that mode) and `setFloorPlanEditing`
 * (the parallel 2D editing app). The fourth is the feature-flag dimension,
 * covered by `features/flags/viewOnly.test.ts`.
 */
describe('showroom mode — store gates', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('defaults to off, so nothing changes for an ordinary session', () => {
    expect(useStore.getState().viewOnly).toBe(false)
  })

  describe('canEditScene', () => {
    it('is true in the room editor with the orbit camera, as before', () => {
      expect(canEditScene({ roomEditor: { active: true, roomId: 'r' }, cameraMode: 'orbit' })).toBe(
        true,
      )
    })

    it('is false in showroom mode even in the room editor with orbit', () => {
      expect(
        canEditScene({
          roomEditor: { active: true, roomId: 'r' },
          cameraMode: 'orbit',
          viewOnly: true,
        }),
      ).toBe(false)
    })

    it('still honours its original rules when viewOnly is absent', () => {
      expect(
        canEditScene({ roomEditor: { active: false, roomId: null }, cameraMode: 'orbit' }),
      ).toBe(false)
      expect(
        canEditScene({ roomEditor: { active: true, roomId: 'r' }, cameraMode: 'firstPerson' }),
      ).toBe(false)
    })
  })

  describe('enterRoomEditor', () => {
    it('refuses to open the editor in showroom mode', () => {
      useStore.getState().setViewOnly(true)
      const roomId = useStore.getState().floorPlan.rooms[0].id
      useStore.getState().enterRoomEditor(roomId)
      expect(useStore.getState().roomEditor.active).toBe(false)
      expect(canEditScene(useStore.getState())).toBe(false)
    })

    it('opens normally once the visitor takes an editable copy', () => {
      useStore.getState().setViewOnly(true)
      const roomId = useStore.getState().floorPlan.rooms[0].id
      useStore.getState().enterRoomEditor(roomId)
      expect(useStore.getState().roomEditor.active).toBe(false)

      useStore.getState().setViewOnly(false)
      useStore.getState().enterRoomEditor(roomId)
      expect(useStore.getState().roomEditor.active).toBe(true)
      expect(canEditScene(useStore.getState())).toBe(true)
    })
  })

  describe('setFloorPlanEditing', () => {
    it('refuses to open the 2D plan editor in showroom mode', () => {
      useStore.getState().setViewOnly(true)
      useStore.getState().setFloorPlanEditing(true)
      expect(useStore.getState().floorPlanEditing).toBe(false)
    })

    it('never traps a session that is somehow already inside it', () => {
      useStore.getState().setFloorPlanEditing(true)
      expect(useStore.getState().floorPlanEditing).toBe(true)
      useStore.getState().setViewOnly(true)
      useStore.getState().setFloorPlanEditing(false)
      expect(useStore.getState().floorPlanEditing).toBe(false)
    })
  })

  describe('feature flags follow the mode', () => {
    // Both UI modes, per the CLAUDE.md "test BOTH modes" rule — showroom mode is
    // orthogonal to Simple/Pro, and a Pro user opening a showroom link keeps
    // their Pro preference.
    for (const uiMode of ['simple', 'pro'] as const) {
      it(`withholds the authoring flags and restores them on exit (${uiMode} mode)`, () => {
        useStore.getState().setUiMode(uiMode)
        const before = useStore.getState().featureFlags.floorPlanEditor

        useStore.getState().setViewOnly(true)
        expect(useStore.getState().featureFlags.floorPlanEditor).toBe(false)
        expect(useStore.getState().featureFlags.modelUpload).toBe(false)
        // The tour itself is untouched in either mode.
        expect(useStore.getState().featureFlags.shareExport).toBe(true)
        expect(useStore.getState().featureFlags.walkthrough).toBe(true)

        useStore.getState().setViewOnly(false)
        expect(useStore.getState().featureFlags.floorPlanEditor).toBe(before)
      })
    }
  })
})
