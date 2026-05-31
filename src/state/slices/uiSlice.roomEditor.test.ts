import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('roomEditor state', () => {
  beforeEach(() => {
    useStore.setState({
      roomEditor: { active: false, roomId: null },
      qualityTier: 'high',
      qualityUserSet: false,
      assetTier: null,
      cameraMode: 'firstPerson',
    })
  })

  it('enter pins performance + Original assets and sets orbit', () => {
    useStore.getState().enterRoomEditor('bedroom2')
    const s = useStore.getState()
    expect(s.roomEditor).toEqual({ active: true, roomId: 'bedroom2' })
    expect(s.qualityTier).toBe('performance')
    expect(s.assetTier).toBe('high')
    expect(s.cameraMode).toBe('orbit')
  })

  it('exit restores the prior render + asset tier', () => {
    useStore.getState().enterRoomEditor('bedroom2')
    useStore.getState().exitRoomEditor()
    const s = useStore.getState()
    expect(s.roomEditor.active).toBe(false)
    expect(s.qualityTier).toBe('high')
    expect(s.assetTier).toBe(null)
  })
})
