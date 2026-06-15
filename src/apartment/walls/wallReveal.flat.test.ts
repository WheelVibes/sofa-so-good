import { describe, expect, it } from 'vitest'
import { ROOMS, WALLS } from '../constants'
import { wallThicknessMetres } from '../wallSegments'
import { orientOutward, pointInRooms, type RoomRect, wallRevealFactor } from './wallRevealMath'

// Integration regression for the curated flat: the bedroom band sits on the
// north wall, which is OFFSET from the apartment's bounding-box centre. The old
// reveal metric oriented each wall's normal "away from the bbox centre", so a
// faced bedroom facade only partially faded (~0.5) while the centred living/
// kitchen walls faded fully — the reported bug. The per-wall point-in-room
// probe must orient the bedroom wall outward correctly so it fades to ~0 when
// the camera faces it, exactly like the other exterior walls.

const ROOM_RECTS: RoomRect[] = Object.values(ROOMS).map((r) => ({
  x: r.origin[0],
  z: r.origin[1],
  w: r.width,
  d: r.depth,
  ext: r.extension
    ? {
        x: r.origin[0] + r.extension.offset[0],
        z: r.origin[1] + r.extension.offset[1],
        w: r.extension.width,
        d: r.extension.depth,
      }
    : undefined,
}))
const isInterior = (x: number, z: number) => pointInRooms(x, z, ROOM_RECTS, 0.05)

/** Outward normal + midpoint of a wall, the way WallSegment computes it. */
function wallReveal(id: string) {
  const wall = WALLS.find((w) => w.id === id)
  if (!wall) throw new Error(`no wall ${id}`)
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz) || 1
  const mx = (wall.start[0] + wall.end[0]) / 2
  const mz = (wall.start[1] + wall.end[1]) / 2
  const probe = wallThicknessMetres(wall) / 2 + 0.3
  const out = orientOutward(mx, mz, -dz / len, dx / len, isInterior, probe)
  if (!out) throw new Error(`ambiguous outward for ${id}`)
  return { mx, mz, ...out }
}

describe('flat wall reveal (real ROOMS/WALLS)', () => {
  it('fades the bedroom north facade fully when the camera faces it', () => {
    const { mx, mz, nx, nz } = wallReveal('wall-ext-N')
    expect(nz).toBeLessThan(0) // outward points north (−Z), away from the bedrooms
    // Camera due north of the wall, looking south at the facade.
    const factor = wallRevealFactor(mx, -6, mx, mz, nx, nz)
    expect(factor).toBeCloseTo(0, 1) // ~fully translucent, not a partial ~0.5
  })

  it('keeps the bedroom north facade opaque from inside the flat', () => {
    const { mx, mz, nx, nz } = wallReveal('wall-ext-N')
    const factor = wallRevealFactor(mx, 6, mx, mz, nx, nz) // camera south (interior side)
    expect(factor).toBeCloseTo(1, 1)
  })

  it('fades the living/dining east facade fully when faced (sanity: centred wall)', () => {
    const { mx, mz, nx, nz } = wallReveal('wall-ext-E')
    expect(nx).toBeGreaterThan(0) // outward points east (+X)
    const factor = wallRevealFactor(mx + 6, mz, mx, mz, nx, nz)
    expect(factor).toBeCloseTo(0, 1)
  })

  it('agrees on the fade depth for an off-centre vs a centred exterior wall', () => {
    // The whole point of the fix: a faced bedroom (off-centre) wall reaches the
    // same near-zero factor as a faced south (more central) wall — no partial gap.
    const north = wallReveal('wall-ext-N')
    const south = wallReveal('wall-ext-S')
    const fNorth = wallRevealFactor(north.mx, -6, north.mx, north.mz, north.nx, north.nz)
    const fSouth = wallRevealFactor(south.mx, south.mz + 6, south.mx, south.mz, south.nx, south.nz)
    expect(Math.abs(fNorth - fSouth)).toBeLessThan(0.05)
  })
})
