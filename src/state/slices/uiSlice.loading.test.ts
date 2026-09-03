import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('loading overlay state', () => {
  beforeEach(() => {
    useStore.setState({
      bootPhase: 'hydrating',
      loading: { active: false, label: '' },
      roomEditor: { active: false, roomId: null },
      cameraMode: 'orbit',
    })
  })

  it('setBootReady flips bootPhase to ready', () => {
    useStore.getState().setBootReady()
    expect(useStore.getState().bootPhase).toBe('ready')
  })

  it('showLoading / hideLoading toggle the transition overlay', () => {
    useStore.getState().showLoading('Entering walkthrough…')
    expect(useStore.getState().loading).toEqual({
      active: true,
      label: 'Entering walkthrough…',
    })
    useStore.getState().hideLoading()
    // Label preserved while it fades out; only active clears.
    expect(useStore.getState().loading).toEqual({
      active: false,
      label: 'Entering walkthrough…',
    })
  })

  it('setCameraMode shows the overlay only on a real mode change', () => {
    useStore.getState().setCameraMode('orbit') // no change
    expect(useStore.getState().loading.active).toBe(false)

    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().loading.active).toBe(true)
    expect(useStore.getState().loading.label).toMatch(/walkthrough/i)
  })

  it('setCameraMode does not show the overlay inside the room editor', () => {
    useStore.setState({ roomEditor: { active: true, roomId: 'bedroom2' } })
    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().loading.active).toBe(false)
  })

  it('room editor enter/exit set a labelled transition overlay', () => {
    useStore.getState().enterRoomEditor('bedroom2')
    expect(useStore.getState().loading).toEqual({ active: true, label: 'Entering room…' })

    useStore.getState().exitRoomEditor()
    expect(useStore.getState().loading).toEqual({ active: true, label: 'Exiting room…' })
  })

  it('setQualityTier shows the overlay only on a real tier change', () => {
    useStore.setState({ qualityTier: 'performance', qualityUserSet: false })
    useStore.getState().setQualityTier('performance') // no change
    expect(useStore.getState().loading.active).toBe(false)

    useStore.getState().setQualityTier('realistic')
    expect(useStore.getState().qualityTier).toBe('realistic')
    expect(useStore.getState().loading.active).toBe(true)
    expect(useStore.getState().loading.label).toMatch(/realistic/i)
  })

  it('re-selecting the already-active quality tier never flashes the overlay', () => {
    useStore.getState().setQualityTier('performance')
    useStore.getState().hideLoading()
    useStore.getState().setQualityTier('performance') // already active — must be a no-op
    expect(useStore.getState().loading.active).toBe(false)
  })
})
