import { describe, expect, it } from 'vitest'
import type { AimSegment } from '../../collision/aimRay'
import { nearestAimedSegment } from '../../collision/aimRay'
import { prefixSegment } from './FirstPersonCamera'

/**
 * The screen/light aim pass merges two categories' segments into one
 * `nearestAimedSegment` call (WALK-SCREEN-INTERACT/WALK-LIGHT-INTERACT), each
 * namespaced with a `screen:`/`light:` id prefix, so whichever is physically
 * nearer wins regardless of category — unlike the fixed door-then-fixture
 * priority order. This isolates that merge from the full R3F frame loop.
 */
function merge(screens: AimSegment[], lights: AimSegment[]): AimSegment[] {
  return [
    ...screens.map((s) => prefixSegment('screen:', s)),
    ...lights.map((s) => prefixSegment('light:', s)),
  ]
}

const noBlock = () => false

describe('screen/light aim category merge', () => {
  // A ray straight along +X at z=0.5 crosses any Z-spanning segment [0,1] at
  // x=segment.sx, so "distance" here is simply each segment's sx.
  it('picks the nearer light over a farther screen', () => {
    const screens: AimSegment[] = [{ id: 'monitor-1', sx: 5, sz: 0, segDx: 0, segDz: 1 }]
    const lights: AimSegment[] = [{ id: 'lamp-1', sx: 1, sz: 0, segDx: 0, segDz: 1 }]
    const winner = nearestAimedSegment(0, 0.5, 1, 0, merge(screens, lights), 10, noBlock)
    expect(winner).toBe('light:lamp-1')
  })

  it('picks the nearer screen over a farther light', () => {
    const screens: AimSegment[] = [{ id: 'monitor-1', sx: 1, sz: 0, segDx: 0, segDz: 1 }]
    const lights: AimSegment[] = [{ id: 'lamp-1', sx: 5, sz: 0, segDx: 0, segDz: 1 }]
    const winner = nearestAimedSegment(0, 0.5, 1, 0, merge(screens, lights), 10, noBlock)
    expect(winner).toBe('screen:monitor-1')
  })

  it('returns null when nothing is in range on either side', () => {
    const screens: AimSegment[] = [{ id: 'monitor-1', sx: 50, sz: 0, segDx: 0, segDz: 1 }]
    const lights: AimSegment[] = [{ id: 'lamp-1', sx: 50, sz: 0, segDx: 0, segDz: 1 }]
    const winner = nearestAimedSegment(0, 0.5, 1, 0, merge(screens, lights), 10, noBlock)
    expect(winner).toBeNull()
  })

  it('the prefix round-trips cleanly back to the real item id', () => {
    const seg = prefixSegment('light:', { id: 'lamp-42', sx: 0, sz: 0, segDx: 1, segDz: 0 })
    expect(seg.id).toBe('light:lamp-42')
    expect(seg.id.slice('light:'.length)).toBe('lamp-42')
  })
})
