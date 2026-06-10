import { describe, expect, it } from 'vitest'
import { placementFlags } from './saveAsset'

describe('placementFlags', () => {
  it('floor → no special flags', () => {
    expect(placementFlags('floor')).toEqual({})
  })
  it('wall → mounted (skips wall-body collision)', () => {
    expect(placementFlags('wall')).toEqual({ mounted: true })
  })
  it('floor-covering → noClip (rug-style, never blocks)', () => {
    expect(placementFlags('floorCovering')).toEqual({ noClip: true })
  })
})
