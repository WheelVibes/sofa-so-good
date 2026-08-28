import { describe, expect, it } from 'vitest'
import { ROOMS, WALLS } from '../constants'
import { roomParts } from '../roomGeometry'
import { wallThicknessMetres } from '../wallSegments'
import {
  cornerNeighbors,
  orientOutward,
  pointInRooms,
  type RoomRect,
  wallRevealStrength,
} from './wallRevealMath'

// Integration regression for the curated flat: the bedroom band sits on the
// north wall, which is OFFSET from the apartment's bounding-box centre. The old
// reveal metric oriented each wall's normal "away from the bbox centre", so a
// faced bedroom facade only partially faded (~0.5) while the centred living/
// kitchen walls faded fully — the reported bug. The per-wall point-in-room
// probe must orient the bedroom wall outward correctly so it reaches PEAK fade
// strength when the camera faces it, exactly like the other exterior walls.
//
// The reveal is ORIENTATION-ONLY and ANGLE-GRADED (WALL-REVEAL-ANGLE-GRADED):
// fade strength depends purely on the camera's look direction vs the wall's
// outward normal (not the camera's position), so these assertions drive
// `wallRevealStrength` with a forward vector rather than a camera coordinate.
// Looking THROUGH a facade from outside means the forward vector opposes the
// outward normal (strength → 1); looking OUT through it from inside means the
// forward runs along the outward normal (strength 0 → fully opaque).

const ROOM_RECTS: RoomRect[] = Object.values(ROOMS).flatMap((r) =>
  roomParts(r).map((p) => ({ x: p.x0, z: p.z0, w: p.x1 - p.x0, d: p.z1 - p.z0 })),
)
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
  it('reaches peak fade strength on the bedroom north facade when the camera faces it', () => {
    const { nx, nz } = wallReveal('wall-ext-N-west')
    expect(nz).toBeLessThan(0) // outward points north (−Z), away from the bedrooms
    // Camera looking INTO the facade (forward opposes the outward normal).
    const strength = wallRevealStrength(-nx, -nz, nx, nz)
    expect(strength).toBeCloseTo(1, 1) // ~peak fade, not a partial ~0.5
  })

  it('keeps the bedroom north facade fully opaque from inside the flat (a FAR wall)', () => {
    const { nx, nz } = wallReveal('wall-ext-N-west')
    // Camera looking OUT through the facade from inside (forward along outward):
    // the far-wall case the retired binary target guarded — excluded structurally
    // by the graded curve (facingToward ≤ 0 → strength exactly 0).
    const strength = wallRevealStrength(nx, nz, nx, nz)
    expect(strength).toBe(0)
  })

  it('reaches peak fade on the living/dining east facade when faced (sanity: centred wall)', () => {
    const { nx, nz } = wallReveal('wall-ext-E-mid')
    expect(nx).toBeGreaterThan(0) // outward points east (+X)
    const strength = wallRevealStrength(-nx, -nz, nx, nz)
    expect(strength).toBeCloseTo(1, 1)
  })

  it('agrees on the fade depth for an off-centre vs a centred exterior wall', () => {
    // The whole point of the fix: a faced bedroom (off-centre) wall reaches the
    // same near-peak strength as a faced south (more central) wall — no partial gap.
    // Orientation-only, so both are driven by a forward vector facing the wall.
    const north = wallReveal('wall-ext-N-west')
    const south = wallReveal('wall-ext-S')
    const sNorth = wallRevealStrength(-north.nx, -north.nz, north.nx, north.nz)
    const sSouth = wallRevealStrength(-south.nx, -south.nz, south.nx, south.nz)
    expect(Math.abs(sNorth - sSouth)).toBeLessThan(0.05)
  })

  it('links perimeter facades to their corner neighbours (corner-spread adjacency)', () => {
    // The curated flat's WALLS share exact corner endpoints, so the default
    // epsilon links each exterior facade to the walls meeting it at a corner.
    const map = cornerNeighbors(WALLS.map((w) => ({ id: w.id, start: w.start, end: w.end })))
    const northNbs = map.get('wall-ext-N-west') ?? []
    expect(northNbs.length).toBeGreaterThan(0)
    expect(northNbs).not.toContain('wall-ext-N-west')
    // Symmetry: every neighbour lists the facade back.
    for (const nb of northNbs) expect(map.get(nb)).toContain('wall-ext-N-west')
  })
})
