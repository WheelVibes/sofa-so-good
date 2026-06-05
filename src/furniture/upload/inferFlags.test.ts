import { describe, expect, it } from 'vitest'
import { inferCollisionFlags } from './inferFlags'

describe('inferCollisionFlags', () => {
  it('flags rugs / mats as noClip (and never mounted)', () => {
    for (const n of ['area_rug.glb', 'Living Room Rug.fbx', 'kitchen-mat.obj', 'tatami.glb']) {
      expect(inferCollisionFlags(n)).toEqual({ mounted: false, noClip: true })
    }
  })

  it('flags wall/ceiling fixtures as mounted', () => {
    for (const n of [
      'ceiling_lamp.glb',
      'pendant-light.glb',
      'wall art 03.glb',
      'wall_clock.glb',
      'range-hood.glb',
      'aircon_unit.glb',
      'sconce.glb',
    ]) {
      expect(inferCollisionFlags(n)).toEqual({ mounted: true, noClip: false })
    }
  })

  it('leaves ambiguous / floor items unflagged', () => {
    for (const n of [
      'sofa.glb',
      'dining_table.glb',
      'tv.glb',
      'floor_mirror.glb',
      'picture_frame.glb',
    ]) {
      expect(inferCollisionFlags(n)).toEqual({ mounted: false, noClip: false })
    }
  })

  it('matches on the base name, not the parent folder', () => {
    expect(inferCollisionFlags('wall art/sofa.glb')).toEqual({ mounted: false, noClip: false })
    expect(inferCollisionFlags('models/ceiling_lamp.glb')).toEqual({ mounted: true, noClip: false })
  })
})
