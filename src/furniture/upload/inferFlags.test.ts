import { describe, expect, it } from 'vitest'
import { inferCollisionFlags } from './inferFlags'

describe('inferCollisionFlags', () => {
  it('flags rugs / mats / carpets as noClip', () => {
    for (const n of ['living-rug.glb', 'Persian Carpet', 'door_mat.obj', 'hallway-runner.glb']) {
      expect(inferCollisionFlags(n)).toEqual({ mounted: false, noClip: true })
    }
  })

  it('flags wall / ceiling fixtures as mounted', () => {
    for (const n of [
      'pendant-light.glb',
      'wall-art-01.glb',
      'wall_sconce.fbx',
      'range-hood.glb',
      'ceiling-fan.glb',
      'wall-mounted-tv.glb',
      'curtains.glb',
    ]) {
      expect(inferCollisionFlags(n)).toEqual({ mounted: true, noClip: false })
    }
  })

  it('leaves ordinary floor furniture untagged', () => {
    for (const n of ['sofa.glb', 'dining-table.glb', 'floor-mirror.glb', 'matte-cabinet.glb']) {
      expect(inferCollisionFlags(n)).toEqual({ mounted: false, noClip: false })
    }
  })

  it('ignores the file extension and is case-insensitive', () => {
    expect(inferCollisionFlags('RUG.GLB')).toEqual({ mounted: false, noClip: true })
    expect(inferCollisionFlags('Wall_Clock.STL')).toEqual({ mounted: true, noClip: false })
  })
})
