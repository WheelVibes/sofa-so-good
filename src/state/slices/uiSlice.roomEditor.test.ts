import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('roomEditor state', () => {
  beforeEach(() => {
    useStore.setState({
      roomEditor: { active: false, roomId: null },
      qualityTier: 'realistic',
      qualityUserSet: true,
      assetTier: null,
      cameraMode: 'firstPerson',
    })
  })

  // Bugs #13/#16: graphics settings are global + persistent — the room editor
  // must NOT force its own tier; it inherits (and never clobbers) the user's.
  it('enter keeps the user graphics tier + asset tier and sets orbit', () => {
    useStore.getState().enterRoomEditor('bedroom2')
    const s = useStore.getState()
    expect(s.roomEditor).toEqual({ active: true, roomId: 'bedroom2' })
    expect(s.qualityTier).toBe('realistic')
    expect(s.assetTier).toBe(null)
    expect(s.cameraMode).toBe('orbit')
  })

  it('exit leaves the (unchanged) graphics tier intact', () => {
    useStore.getState().enterRoomEditor('bedroom2')
    useStore.getState().exitRoomEditor()
    const s = useStore.getState()
    expect(s.roomEditor.active).toBe(false)
    expect(s.qualityTier).toBe('realistic')
    expect(s.assetTier).toBe(null)
  })
})
