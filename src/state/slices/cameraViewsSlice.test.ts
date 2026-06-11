import { beforeEach, describe, expect, it } from 'vitest'
import { cameraPose } from '../../scene/cameras/cameraForward'
import { useStore } from '../store'

describe('cameraViewsSlice', () => {
  beforeEach(() => {
    // Clear any persisted/saved views from a previous test.
    for (const v of [...useStore.getState().savedViews]) useStore.getState().deleteView(v.id)
  })

  it('snapshots the live camera pose under a name', () => {
    cameraPose.px = 5
    cameraPose.py = 3
    cameraPose.pz = 7
    cameraPose.tx = 1
    cameraPose.ty = 1.2
    cameraPose.tz = 2
    const id = useStore.getState().saveCurrentView('Lounge angle')
    const view = useStore.getState().savedViews.find((v) => v.id === id)
    expect(view?.name).toBe('Lounge angle')
    expect(view?.pos).toEqual([5, 3, 7])
    expect(view?.target).toEqual([1, 1.2, 2])
  })

  it('falls back to a default name when blank', () => {
    const id = useStore.getState().saveCurrentView('   ')
    const view = useStore.getState().savedViews.find((v) => v.id === id)
    expect(view?.name).toMatch(/^View \d+$/)
  })

  it('applyView sets the pending pose, bumps the nonce, and forces orbit mode', () => {
    useStore.setState({ cameraMode: 'firstPerson' } as never)
    const id = useStore.getState().saveCurrentView('A')
    const before = useStore.getState().applyViewNonce
    useStore.getState().applyView(id)
    const s = useStore.getState()
    expect(s.applyViewNonce).toBe(before + 1)
    expect(s.pendingViewPose).not.toBeNull()
    expect(s.cameraMode).toBe('orbit')
  })

  it('applyView on a missing id is a no-op', () => {
    const before = useStore.getState().applyViewNonce
    useStore.getState().applyView('nope')
    expect(useStore.getState().applyViewNonce).toBe(before)
  })

  it('deleteView removes the view', () => {
    const id = useStore.getState().saveCurrentView('Temp')
    useStore.getState().deleteView(id)
    expect(useStore.getState().savedViews.find((v) => v.id === id)).toBeUndefined()
  })

  it('renameView updates the name', () => {
    const id = useStore.getState().saveCurrentView('Old')
    useStore.getState().renameView(id, 'New')
    expect(useStore.getState().savedViews.find((v) => v.id === id)?.name).toBe('New')
  })

  it('setViewPano marks a view as a 360° slide, persists it, and unmarks cleanly', () => {
    const id = useStore.getState().saveCurrentView('Living 360')
    useStore.getState().setViewPano(id, true)
    expect(useStore.getState().savedViews.find((v) => v.id === id)?.pano).toBe(true)
    // Round-trips through the localStorage persistence (additive, optional).
    const persisted = JSON.parse(localStorage.getItem('hdb_camera_views') ?? '[]')
    expect(persisted.find((v: { id: string }) => v.id === id)?.pano).toBe(true)
    useStore.getState().setViewPano(id, false)
    const view = useStore.getState().savedViews.find((v) => v.id === id)
    expect(view?.pano).toBeUndefined()
    const after = JSON.parse(localStorage.getItem('hdb_camera_views') ?? '[]')
    expect('pano' in after.find((v: { id: string }) => v.id === id)).toBe(false)
  })

  it('setViewPano on a missing id leaves the list untouched', () => {
    const id = useStore.getState().saveCurrentView('Keep')
    useStore.getState().setViewPano('nope', true)
    expect(useStore.getState().savedViews.find((v) => v.id === id)?.pano).toBeUndefined()
  })

  it('captures + restores the lighting state (a shot = angle + ambiance)', () => {
    useStore.getState().setManualHour(20.5)
    useStore.getState().setLightsMode('on')
    const id = useStore.getState().saveCurrentView('Cosy shot')
    const view = useStore.getState().savedViews.find((v) => v.id === id)
    expect(view).toMatchObject({ mode: 'manual', hour: 20.5, lights: 'on' })
    useStore.getState().setManualHour(9)
    useStore.getState().setLightsMode('off')
    useStore.getState().applyView(id)
    expect(useStore.getState().manualHour).toBe(20.5)
    expect(useStore.getState().lightsMode).toBe('on')
  })
})
