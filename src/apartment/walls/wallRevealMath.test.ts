import { describe, expect, it } from 'vitest'
import {
  cornerNeighbors,
  cornerSpreadStrength,
  DEFAULT_WALL_REVEAL_STRENGTH,
  facingToward,
  formatWallFade,
  orientOutward,
  pointInRooms,
  REVEAL_ONSET,
  type RoomRect,
  revealStrength,
  revealTargetOpacity,
  revealTargetOpacityForFade,
  SPREAD_GATE,
  SPREAD_GATE_FULL,
  SPREAD_ONSET,
  smoothstep,
  WALL_TRANSLUCENT_MIN,
  type WallEndpoints,
  wallRevealStrength,
} from './wallRevealMath'

// A single 4×4 room with its NW interior corner at the origin.
const room: RoomRect[] = [{ x: 0, z: 0, w: 4, d: 4 }]

describe('orientOutward', () => {
  it('orients a north-edge wall normal outward (away from the room)', () => {
    // Wall along X at z=0; candidate normal +Z points into the room.
    const out = orientOutward(2, 0, 0, 1, (x, z) => pointInRooms(x, z, room))
    expect(out).toEqual({ nx: -0, nz: -1 }) // outward = −Z (north)
  })

  it('orients a west-edge wall normal outward', () => {
    const out = orientOutward(0, 2, 1, 0, (x, z) => pointInRooms(x, z, room))
    expect(out).toEqual({ nx: -1, nz: -0 }) // outward = −X (west)
  })

  it('returns null for an internal wall between two rooms (never fades)', () => {
    const two: RoomRect[] = [
      { x: 0, z: 0, w: 4, d: 4 },
      { x: 4, z: 0, w: 4, d: 4 },
    ]
    // Wall along Z at x=4 with a room on each side.
    expect(orientOutward(4, 2, 1, 0, (x, z) => pointInRooms(x, z, two))).toBeNull()
  })

  it('returns null when neither side is interior (ambiguous)', () => {
    expect(orientOutward(20, 20, 0, 1, (x, z) => pointInRooms(x, z, room))).toBeNull()
  })

  it('works for an L-shaped plan where a bbox centre would be unreliable', () => {
    // L-shape: two rooms forming an L; the bbox centre (3,3) sits in the notch
    // (outside both rooms), which would mis-orient the old centre heuristic.
    const L: RoomRect[] = [
      { x: 0, z: 0, w: 2, d: 6 }, // tall left arm
      { x: 0, z: 4, w: 6, d: 2 }, // bottom arm
    ]
    expect(pointInRooms(3, 3, L)).toBe(false) // bbox-centre is in the notch
    // North wall of the bottom arm's far-east stub (along X at z=4, x≈4..6):
    // mid (5,4), candidate +Z is inside the bottom arm → outward is −Z (north).
    const out = orientOutward(5, 4, 0, 1, (x, z) => pointInRooms(x, z, L))
    expect(out).toEqual({ nx: -0, nz: -1 })
  })
})

describe('facingToward (orientation-only)', () => {
  it('is +1 when the outward surface faces the camera head-on (a NEAR wall)', () => {
    // Camera looking toward +Z; a wall whose outward normal is −Z (its exterior
    // toward the camera) is being looked through head-on.
    expect(facingToward(0, 1, 0, -1)).toBeCloseTo(1)
  })

  it('is −1 for a far/back wall (outward normal along forward)', () => {
    expect(facingToward(0, 1, 0, 1)).toBeCloseTo(-1)
  })

  it('is 0 for an edge-on side wall (normal perpendicular to the view)', () => {
    expect(facingToward(0, 1, 1, 0)).toBeCloseTo(0)
    expect(facingToward(0, 1, -1, 0)).toBeCloseTo(0)
  })

  it('is independent of camera distance (only the forward direction matters)', () => {
    expect(facingToward(0, 1, 0, -1)).toBeCloseTo(facingToward(0, 5, 0, -1))
  })

  it('reads a near-vertical (top-down) view as fully away (walls stay solid)', () => {
    // Forward almost straight down → negligible horizontal component.
    expect(facingToward(0.02, 0.02, 0, -1)).toBe(-1)
    expect(facingToward(0.02, 0.02, 1, 0)).toBe(-1)
  })
})

describe('revealStrength (angle-graded curve — WALL-REVEAL-ANGLE-GRADED)', () => {
  it('is 0 at/below the onset (grazing / side-on / turned-away surfaces stay solid)', () => {
    expect(revealStrength(-1)).toBe(0) // far/back wall
    expect(revealStrength(0)).toBe(0) // edge-on side wall
    expect(revealStrength(REVEAL_ONSET)).toBe(0) // exactly at onset — not yet fading
    expect(revealStrength(REVEAL_ONSET - 0.01)).toBe(0)
  })

  it('starts subtly just past the onset (a barely-angled wall fades a little)', () => {
    const s = revealStrength(REVEAL_ONSET + 0.05)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(0.05)
  })

  it('peaks (1) when the surface faces the camera head-on', () => {
    expect(revealStrength(1)).toBe(1)
  })

  it('is monotonically non-decreasing across the whole toward range', () => {
    let prev = -1
    for (let t = -1; t <= 1.0001; t += 0.01) {
      const s = revealStrength(t)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })

  it('rests at genuine mid-band strengths between onset and head-on (graded, not binary)', () => {
    // The reversal of WALL-REVEAL-BINARY-TARGET: a moderately-angled NEAR wall
    // settles at a partial strength rather than snapping to an endpoint.
    const mid = revealStrength((REVEAL_ONSET + 1) / 2)
    expect(mid).toBeGreaterThan(0.3)
    expect(mid).toBeLessThan(0.7)
  })
})

describe('cornerSpreadStrength (WALL-REVEAL-CORNER-SPREAD)', () => {
  it('is 0 when no corner neighbour is meaningfully fading (below the gate)', () => {
    expect(cornerSpreadStrength(0.5, 0)).toBe(0)
    expect(cornerSpreadStrength(0.5, SPREAD_GATE)).toBe(0) // exactly at the gate — not yet
  })

  it('is 0 when this wall does not face the camera at least slightly', () => {
    expect(cornerSpreadStrength(SPREAD_ONSET, 1)).toBe(0) // exactly at onset
    expect(cornerSpreadStrength(0, 1)).toBe(0) // perpendicular side wall
    expect(cornerSpreadStrength(-0.5, 1)).toBe(0) // turned away (a far wall never spreads)
  })

  it('fades a slightly-facing corner companion once a neighbour fades by its own facing', () => {
    // Between SPREAD_ONSET and REVEAL_ONSET this wall has zero OWN strength but a
    // positive spread strength when a corner neighbour is strongly fading.
    const toward = (SPREAD_ONSET + REVEAL_ONSET) / 2
    expect(revealStrength(toward)).toBe(0)
    expect(cornerSpreadStrength(toward, 1)).toBeGreaterThan(0)
  })

  it('reaches a clearly visible strength at a realistic corner-companion angle', () => {
    // A corner neighbour of a head-on-faded wall is near-perpendicular, so its
    // own `toward` tops out ~0.3–0.5 — the spread curve (full at SPREAD_FULL)
    // must make that range visibly translucent, not a ~3% tint.
    expect(cornerSpreadStrength(0.35, 1)).toBeGreaterThan(0.2)
    expect(cornerSpreadStrength(0.35, 1)).toBeLessThan(1)
  })

  it('never exceeds the leading neighbour own strength (the 45° two-facade case)', () => {
    // At a ~45° corner view both facades fade by their OWN facing (~0.6 strength);
    // uncapped spread (full by SPREAD_FULL) would override that with ~1 and snap
    // both near peak, defeating the graded look. The cap keeps spread ≤ leader.
    expect(cornerSpreadStrength(0.9, 0.6)).toBeLessThanOrEqual(0.6)
    expect(cornerSpreadStrength(1, 0.55)).toBeLessThanOrEqual(0.55)
  })

  it('engages smoothly across the neighbour gate (no pop mid-orbit)', () => {
    const a = cornerSpreadStrength(0.3, SPREAD_GATE + 0.01)
    const b = cornerSpreadStrength(0.3, (SPREAD_GATE + SPREAD_GATE_FULL) / 2)
    const c = cornerSpreadStrength(0.3, SPREAD_GATE_FULL)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    // Saturated past the ramp (toward 0.3's spread curve sits below the cap here).
    expect(c).toBeCloseTo(cornerSpreadStrength(0.3, 1))
  })

  it('is monotonic in both the facing and the neighbour strength', () => {
    let prev = -1
    for (let t = -1; t <= 1.0001; t += 0.05) {
      const s = cornerSpreadStrength(t, 1)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
    prev = -1
    for (let nb = 0; nb <= 1.0001; nb += 0.05) {
      const s = cornerSpreadStrength(0.5, nb)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })
})

describe('wallRevealStrength (facing → strength composition)', () => {
  it('peaks for a head-on faced wall and is 0 for far/side walls', () => {
    expect(wallRevealStrength(0, 1, 0, -1)).toBe(1) // near wall, head-on
    expect(wallRevealStrength(0, 1, 0, 1)).toBe(0) // far wall
    expect(wallRevealStrength(0, 1, 1, 0)).toBe(0) // side wall
  })

  it('keeps a slightly-off-perpendicular side wall solid (within the onset margin)', () => {
    // Off-axis view tips a side wall a few degrees; within REVEAL_ONSET it must
    // still read fully solid — this is the exact bath case (toward ≈ 0.22).
    expect(wallRevealStrength(-0.22, 0.98, 1, 0)).toBe(0)
    expect(wallRevealStrength(0.19, 0.98, 1, 0)).toBe(0) // tipped away → solid
  })

  it('grades a moderately-angled near wall between 0 and 1', () => {
    // forward ≈ (−0.64, 0.77) vs outward +X wall → toward ≈ 0.64.
    const s = wallRevealStrength(-0.64, 0.77, 1, 0)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })
})

describe('revealTargetOpacity', () => {
  it('maps strength 0 → opaque and strength 1 → the mode floor', () => {
    expect(revealTargetOpacity(0, WALL_TRANSLUCENT_MIN)).toBe(1)
    expect(revealTargetOpacity(1, WALL_TRANSLUCENT_MIN)).toBeCloseTo(WALL_TRANSLUCENT_MIN, 10)
    expect(revealTargetOpacity(1, 0)).toBe(0) // auto-hide floor
  })

  it('settles anywhere along the line for partial strengths', () => {
    const half = revealTargetOpacity(0.5, WALL_TRANSLUCENT_MIN)
    expect(half).toBeCloseTo(1 - 0.5 * (1 - WALL_TRANSLUCENT_MIN))
  })
})

describe('WALL_TRANSLUCENT_MIN (WALL-REVEAL-PEAK)', () => {
  it('is a strong-but-visible peak floor (barely an outline, above the 0.02 visible cutoff)', () => {
    expect(WALL_TRANSLUCENT_MIN).toBe(0.05)
    expect(WALL_TRANSLUCENT_MIN).toBeGreaterThan(0.02)
  })
})

describe('revealTargetOpacityForFade (WALL-REVEAL-STRENGTH)', () => {
  it('fade 0 = fully opaque at EVERY strength (never fades)', () => {
    expect(revealTargetOpacityForFade(0, 0)).toBe(1)
    expect(revealTargetOpacityForFade(0, 0.5)).toBe(1)
    expect(revealTargetOpacityForFade(0, 1)).toBe(1)
  })

  it('fade 1 = fully hidden head-on, still angle-graded for grazing walls', () => {
    expect(revealTargetOpacityForFade(1, 1)).toBe(0) // head-on → gone
    expect(revealTargetOpacityForFade(1, 0)).toBe(1) // no facing → solid
    expect(revealTargetOpacityForFade(1, 0.5)).toBeCloseTo(0.5) // grazing → partial
  })

  it('an in-between fade sets the head-on opacity floor to 1 − fade', () => {
    expect(revealTargetOpacityForFade(0.6, 1)).toBeCloseTo(0.4)
    expect(revealTargetOpacityForFade(0.6, 0)).toBe(1)
    // Linear: 1 − strength · fade.
    expect(revealTargetOpacityForFade(0.6, 0.5)).toBeCloseTo(1 - 0.5 * 0.6)
  })

  it('the default fade reproduces the retired "translucent" peak floor', () => {
    expect(DEFAULT_WALL_REVEAL_STRENGTH).toBeCloseTo(0.95, 10)
    expect(revealTargetOpacityForFade(DEFAULT_WALL_REVEAL_STRENGTH, 1)).toBeCloseTo(
      WALL_TRANSLUCENT_MIN,
      10,
    )
    expect(revealTargetOpacityForFade(DEFAULT_WALL_REVEAL_STRENGTH, 0.5)).toBeCloseTo(
      revealTargetOpacity(0.5, WALL_TRANSLUCENT_MIN),
    )
  })
})

describe('formatWallFade', () => {
  it('labels the endpoints and shows a percentage in between', () => {
    expect(formatWallFade(0)).toBe('Off')
    expect(formatWallFade(1)).toBe('Hidden')
    expect(formatWallFade(0.95)).toBe('95%')
    expect(formatWallFade(0.5)).toBe('50%')
  })
})

describe('cornerNeighbors (WALL-REVEAL-CORNER-SPREAD adjacency)', () => {
  // A 4×4 room's four perimeter walls, wound corner-to-corner.
  const square: WallEndpoints[] = [
    { id: 'n', start: [0, 0], end: [4, 0] },
    { id: 'e', start: [4, 0], end: [4, 4] },
    { id: 's', start: [4, 4], end: [0, 4] },
    { id: 'w', start: [0, 4], end: [0, 0] },
  ]

  it('links walls sharing a corner endpoint (each square wall gets both its neighbours)', () => {
    const map = cornerNeighbors(square)
    expect(map.get('n')?.sort()).toEqual(['e', 'w'])
    expect(map.get('e')?.sort()).toEqual(['n', 's'])
    expect(map.get('s')?.sort()).toEqual(['e', 'w'])
    expect(map.get('w')?.sort()).toEqual(['n', 's'])
  })

  it('never links a wall to itself', () => {
    const map = cornerNeighbors(square)
    for (const [id, ids] of map) expect(ids).not.toContain(id)
  })

  it('never self-matches two clips carrying the SAME wall id', () => {
    // The room editor can render one host wall as multiple clips sharing an id;
    // their touching endpoints must not register the wall as its own neighbour.
    const clips: WallEndpoints[] = [
      { id: 'a', start: [0, 0], end: [2, 0] },
      { id: 'a', start: [2, 0], end: [4, 0] },
    ]
    const map = cornerNeighbors(clips)
    expect(map.get('a')).toEqual([])
  })

  it('honours the epsilon (near endpoints count, far ones do not)', () => {
    const walls: WallEndpoints[] = [
      { id: 'a', start: [0, 0], end: [4, 0] },
      { id: 'b', start: [4.04, 0], end: [4.04, 4] }, // 0.04 m gap — within eps 0.05
      { id: 'c', start: [4.2, 0], end: [4.2, 4] }, // 0.2 m gap — outside eps
    ]
    const map = cornerNeighbors(walls)
    expect(map.get('a')).toContain('b')
    expect(map.get('a')).not.toContain('c')
    // A larger epsilon (the room editor's clipped-endpoint case) picks c up too.
    expect(cornerNeighbors(walls, 0.25).get('a')).toContain('c')
  })

  it('does NOT link a T-junction (an endpoint mid-span of another wall is not a corner)', () => {
    const walls: WallEndpoints[] = [
      { id: 'through', start: [0, 0], end: [8, 0] },
      { id: 'stem', start: [4, 0], end: [4, 4] }, // ends at the through-wall's midpoint
    ]
    const map = cornerNeighbors(walls)
    expect(map.get('through')).toEqual([])
    expect(map.get('stem')).toEqual([])
  })
})

describe('pointInRooms', () => {
  it("detects points inside any of a room's parts", () => {
    // A room contributes one entry per part — the list is flat, so a room of
    // three rectangles is three entries and there is no cap at one extension.
    const r: RoomRect[] = [
      { x: 0, z: 0, w: 2, d: 2 },
      { x: 2, z: 0, w: 2, d: 1 },
      { x: 4, z: 0, w: 1, d: 3 },
    ]
    expect(pointInRooms(1, 1, r)).toBe(true)
    expect(pointInRooms(3, 0.5, r)).toBe(true) // second part
    expect(pointInRooms(4.5, 2.5, r)).toBe(true) // third part
    expect(pointInRooms(3, 1.5, r)).toBe(false) // outside all
  })

  it('honours the pad', () => {
    expect(pointInRooms(-0.04, 1, room, 0.05)).toBe(true)
    expect(pointInRooms(-0.04, 1, room, 0)).toBe(false)
  })
})

describe('smoothstep', () => {
  it('clamps and ramps', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
  })
})
