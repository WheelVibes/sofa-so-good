/**
 * Stacked sections (F13). A section is THE drawing where storeys matter — the
 * one sheet a contractor reads to see how the levels stack — and `buildSection`
 * cut the ground floor only, so a maisonette's Section A–A showed an
 * open-topped ground floor with nothing above it.
 *
 * Verified to FAIL without the fix.
 */
import { describe, expect, it } from 'vitest'
import { buildSection, type SectionItemInput } from './section'
import type { FloorPlan } from './types'

/**
 * Two storeys, each a 6 m-wide room between two walls, the upper at elevation
 * 3. A cut at z = 2 crosses both. Upper ceiling is deliberately DIFFERENT
 * (2.2 vs 2.8) so a lifted storey can't be confused with a taller ground one.
 */
function maisonette(): FloorPlan {
  const walls = (prefix: string) => [
    { id: `${prefix}-w`, start: [0, 0], end: [0, 4], thickness: 'external' },
    { id: `${prefix}-e`, start: [6, 0], end: [6, 4], thickness: 'external' },
  ]
  return {
    id: 'p',
    name: 'Maisonette',
    extent: [6, 4],
    ceilingHeight: 2.8,
    walls: walls('g'),
    openings: [],
    rooms: [{ id: 'g-live', name: 'Living', origin: [0, 0], width: 6, depth: 4 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        ceilingHeight: 2.2,
        walls: walls('u'),
        openings: [
          { id: 'u-win', wallId: 'u-w', kind: 'window', offset: 1, width: 1.2, sill: 0.9, head: 2 },
        ],
        rooms: [{ id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 6, depth: 4 }],
      },
    ],
  } as unknown as FloorPlan
}

const single = () => ({ ...maisonette(), upperLevels: [] }) as unknown as FloorPlan
const CUT = { axis: 'z', at: 2 } as const

describe('buildSection — stacked storeys', () => {
  it('cuts BOTH storeys, not just the ground floor', () => {
    const s = buildSection(maisonette(), CUT)
    expect(s.rooms.map((r) => r.name).sort()).toEqual(['Bedroom', 'Living'])
    // Two walls per storey.
    expect(s.walls).toHaveLength(4)
  })

  it('lifts the upper storey to its own elevation', () => {
    const s = buildSection(maisonette(), CUT)
    const bases = [...new Set(s.rooms.map((r) => r.base))].sort((a, b) => a - b)
    expect(bases).toEqual([0, 3])
    const tops = [...new Set(s.walls.map((w) => w.top))].sort((a, b) => a - b)
    // Ground 0→2.8; upper 3→5.2 (its own 2.2 m ceiling, not the ground's 2.8).
    expect(tops).toEqual([2.8, 5.2])
    expect([...new Set(s.walls.map((w) => w.base))].sort((a, b) => a - b)).toEqual([0, 3])
  })

  it('reports the WHOLE-HOME height, so the dimension is not the ground storey', () => {
    expect(buildSection(maisonette(), CUT).height).toBeCloseTo(5.2, 6)
    expect(buildSection(single(), CUT).height).toBeCloseTo(2.8, 6)
  })

  it('lifts an upper-storey opening with its wall', () => {
    const s = buildSection(maisonette(), CUT)
    const win = s.openings.find((o) => o.kind === 'window')
    expect(win).toBeTruthy()
    // 0.9 sill / 2.0 head, both raised by the 3 m elevation.
    expect(win!.sill).toBeCloseTo(3.9, 6)
    expect(win!.head).toBeCloseTo(5.0, 6)
  })

  it('keeps the ground slab as floorY', () => {
    expect(buildSection(maisonette(), CUT).floorY).toBe(0)
  })
})

describe('buildSection — stacked furniture', () => {
  const sil = (id: string, levelId?: string): SectionItemInput => ({
    id,
    label: id,
    // Straddles the z = 2 cut line.
    corners: [
      [2, 1.5],
      [3, 1.5],
      [3, 2.5],
      [2, 2.5],
    ],
    height: 1,
    ...(levelId ? { levelId } : {}),
  })

  it('stands an upstairs piece on the UPPER floor, not the ground slab', () => {
    const s = buildSection(maisonette(), CUT, [sil('bed', 'upper')])
    const item = s.items.find((i) => i.id === 'bed')!
    expect(item.base).toBe(3)
    expect(item.height).toBeCloseTo(1, 6)
  })

  it('does not draw the same piece once per storey', () => {
    // The wrapper cuts every level, so an unfiltered silhouette list would
    // appear twice — once standing on each floor.
    const s = buildSection(maisonette(), CUT, [sil('sofa'), sil('bed', 'upper')])
    expect(s.items.filter((i) => i.id === 'sofa')).toHaveLength(1)
    expect(s.items.filter((i) => i.id === 'bed')).toHaveLength(1)
    expect(s.items.find((i) => i.id === 'sofa')!.base).toBe(0)
  })

  it('treats an untagged piece as ground', () => {
    expect(buildSection(maisonette(), CUT, [sil('rug')]).items[0]!.base).toBe(0)
  })
})

describe('buildSection — single-storey is unchanged', () => {
  it('matches the pre-fix shape for a plan with no upper levels', () => {
    const s = buildSection(single(), CUT)
    expect(s.rooms.every((r) => r.base === 0)).toBe(true)
    expect(s.walls.every((w) => w.base === 0)).toBe(true)
    expect(s.rooms.map((r) => r.name)).toEqual(['Living'])
  })
})

/**
 * An opening on a CUT wall is a void the width of the WALL, not of the opening.
 * A cut wall runs perpendicular to the section axis, so you see it as a thin
 * column with a hole punched through it. Using the opening's along-wall run drew
 * a 1.2 m window as a 1.2 m hole in a 0.2 m wall — spilling across the rooms
 * either side. Found in a report frame, not by a test.
 */
describe('buildSection — an opening gap is the wall thickness', () => {
  /** One external (0.2 m) wall at x = 0 running along z, with a wide window. */
  function oneWall(): FloorPlan {
    return {
      id: 'p',
      name: 'p',
      extent: [6, 4],
      ceilingHeight: 2.8,
      walls: [{ id: 'w', start: [0, 0], end: [0, 4], thickness: 'external' }],
      openings: [
        { id: 'win', wallId: 'w', kind: 'window', offset: 1, width: 2, sill: 0.9, head: 2.1 },
      ],
      rooms: [{ id: 'r', name: 'Room', origin: [0, 0], width: 6, depth: 4 }],
    } as unknown as FloorPlan
  }

  it('draws the gap as the wall thickness, not the 2 m opening width', () => {
    const s = buildSection(oneWall(), { axis: 'z', at: 2 })
    const wall = s.walls.find((w) => Math.abs(w.pos) < 1e-6)!
    const gap = s.openings[0]!
    expect(gap.width).toBeCloseTo(0.2, 6)
    expect(gap.width).toBeCloseTo(wall.thickness, 6)
  })

  it('still uses the opening run to decide WHETHER the cut hits it', () => {
    // The window spans z 1..3 on the wall; a cut at z = 3.5 misses it.
    expect(buildSection(oneWall(), { axis: 'z', at: 2 }).openings).toHaveLength(1)
    expect(buildSection(oneWall(), { axis: 'z', at: 3.5 }).openings).toHaveLength(0)
  })

  it('keeps the void inside the wall column', () => {
    const s = buildSection(oneWall(), { axis: 'z', at: 2 })
    const wall = s.walls.find((w) => Math.abs(w.pos) < 1e-6)!
    const gap = s.openings[0]!
    expect(gap.pos - gap.width / 2).toBeGreaterThanOrEqual(wall.pos - wall.thickness / 2 - 1e-9)
    expect(gap.pos + gap.width / 2).toBeLessThanOrEqual(wall.pos + wall.thickness / 2 + 1e-9)
  })
})
