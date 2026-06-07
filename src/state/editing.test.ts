import { describe, expect, it } from 'vitest'
import { canEditScene } from './editing'
import type { RootState } from './store'

const scene = (active: boolean, cameraMode: 'orbit' | 'firstPerson') =>
  ({
    roomEditor: { active, roomId: active ? 'mainBedroom' : null },
    cameraMode,
  }) as Pick<RootState, 'roomEditor' | 'cameraMode'>

describe('canEditScene', () => {
  it('is true only inside the room editor with the orbit camera', () => {
    expect(canEditScene(scene(true, 'orbit'))).toBe(true)
  })

  it('is false in the view-only overview (no room editor)', () => {
    expect(canEditScene(scene(false, 'orbit'))).toBe(false)
  })

  it('is false in walk mode, even inside the room editor', () => {
    expect(canEditScene(scene(true, 'firstPerson'))).toBe(false)
  })
})
