import { describe, expect, it } from 'vitest'
import { planCollisionWalls } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { findWallClipsByLevel } from './levelWallClips'

// Deterministic 1 m × 1 m parametric box (no GLB bbox cache involved).
const BOX: FurnitureDef = {
  kind: 'parametric',
  id: 'box' as never,
  name: 'Box',
  category: 'others',
  primitive: 'Bed' as never,
  defaultFootprint: { w: 1, d: 1, h: 1 },
  paramSchema: [],
}
const defs: Record<string, FurnitureDef> = { box: BOX }

let seq = 0
const mk = (x: number, z: number, levelId?: string): FurnitureItem => ({
  id: `i-${seq++}`,
  defId: 'box' as never,
  position: [x, z],
  rotation: 0,
  levelId,
  props: { width: 1, depth: 1 },
})

// Two storeys: the ground wall spans x∈[0.1,7.9] along z=0.1; the upper
// storey's wall only spans x∈[0.1,4.9]. An item centred at x=6.5, z=0.1
// straddles the GROUND wall but clear floor on the upper storey.
const plan: FloorPlan = {
  id: 'ml-clips',
  name: 'ML clips',
  ceilingHeight: 2.6,
  extent: [8, 6],
  walls: [{ id: 'gw', start: [0.1, 0.1], end: [7.9, 0.1], thickness: 'external' }],
  openings: [],
  rooms: [],
  upperLevels: [
    {
      id: 'lvl-2',
      name: 'Upper',
      elevation: 2.9,
      walls: [{ id: 'uw', start: [0.1, 0.1], end: [4.9, 0.1], thickness: 'external' }],
      openings: [],
      rooms: [],
    },
  ],
}

const groundWalls = planCollisionWalls(plan, {})

describe('findWallClipsByLevel (F13/ML3)', () => {
  it('flags a ground item embedded in a ground wall', () => {
    const g = mk(6.5, 0.1)
    expect(findWallClipsByLevel([g], defs, plan, {}, groundWalls)).toEqual([g.id])
  })

  it('does NOT flag an upper-storey item that only overlaps the ground wall below it', () => {
    const u = mk(6.5, 0.1, 'lvl-2')
    expect(findWallClipsByLevel([u], defs, plan, {}, groundWalls)).toEqual([])
  })

  it("flags an upper-storey item embedded in its OWN storey's wall", () => {
    const u = mk(2, 0.1, 'lvl-2')
    expect(findWallClipsByLevel([u], defs, plan, {}, groundWalls)).toEqual([u.id])
  })

  it('degrades an unknown/stale level id to the ground floor (matches levelById)', () => {
    const stale = mk(6.5, 0.1, 'lvl-gone')
    expect(findWallClipsByLevel([stale], defs, plan, {}, groundWalls)).toEqual([stale.id])
  })

  it('single-storey plans short-circuit to a plain findWallClips (no behaviour change)', () => {
    const single: FloorPlan = { ...plan, upperLevels: undefined }
    const clip = mk(6.5, 0.1)
    const clear = mk(4, 3)
    const walls = planCollisionWalls(single, {})
    expect(findWallClipsByLevel([clip, clear], defs, single, {}, walls)).toEqual([clip.id])
    // Empty ground walls (partial plan) stays a no-op, exactly as before.
    expect(findWallClipsByLevel([clip], defs, single, {}, [])).toEqual([])
  })
})
