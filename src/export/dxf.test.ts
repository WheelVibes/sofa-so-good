import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { dxfLine, dxfPolyline, dxfText, planToDxf } from './dxf'

/** Count non-overlapping occurrences of `needle` in `hay`. */
function count(hay: string, needle: string): number {
  let n = 0
  let i = 0
  for (;;) {
    const idx = hay.indexOf(needle, i)
    if (idx === -1) break
    n++
    i = idx + needle.length
  }
  return n
}

/** Number of DXF entities of `type` (group code 0 == type). */
function entityCount(dxf: string, type: string): number {
  return count(dxf, `\n0\n${type}\n`)
}

const smallPlan: FloorPlan = {
  id: 'p1',
  name: 'Test Flat',
  ceilingHeight: 2.6,
  extent: [4, 3],
  walls: [
    { id: 'w-n', start: [0, 0], end: [4, 0], thickness: 'external' },
    { id: 'w-e', start: [4, 0], end: [4, 3], thickness: 'external' },
    { id: 'w-s', start: [4, 3], end: [0, 3], thickness: 'external' },
    { id: 'w-w', start: [0, 3], end: [0, 0], thickness: 'external' },
  ],
  openings: [
    { id: 'd1', kind: 'door', wallId: 'w-w', offset: 1, width: 0.9, sill: 0, head: 2.1 },
    { id: 'win1', kind: 'window', wallId: 'w-n', offset: 1.5, width: 1.2, sill: 0.9, head: 2.1 },
  ],
  rooms: [{ id: 'living', name: 'Living Room', origin: [0, 0], width: 4, depth: 3 }],
}

describe('planToDxf', () => {
  const dxf = planToDxf(smallPlan)

  it('emits a well-formed DXF skeleton', () => {
    expect(dxf).toContain('SECTION')
    expect(dxf).toContain('ENTITIES')
    expect(dxf).toContain('HEADER')
    expect(dxf).toContain('TABLES')
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
  })

  it('declares metres via $INSUNITS = 6', () => {
    expect(dxf).toContain('$INSUNITS')
    expect(dxf).toMatch(/\$INSUNITS\n70\n6/)
  })

  it('defines all five layers in the LAYER table', () => {
    for (const layer of ['WALLS', 'ROOMS', 'DOORS', 'WINDOWS', 'LABELS']) {
      expect(dxf).toContain(layer)
    }
    // Each layer appears as a LAYER table entry (group code 2).
    expect(count(dxf, '\n2\nWALLS\n')).toBeGreaterThanOrEqual(1)
  })

  it('emits one LINE per non-zero wall', () => {
    expect(entityCount(dxf, 'LINE')).toBe(smallPlan.walls.length + smallPlan.openings.length)
  })

  it('emits one closed POLYLINE per room', () => {
    expect(entityCount(dxf, 'POLYLINE')).toBe(smallPlan.rooms.length)
    expect(dxf).toMatch(/POLYLINE\n8\nROOMS\n66\n1\n70\n1/)
  })

  it('emits openings on DOORS and WINDOWS layers', () => {
    expect(dxf).toMatch(/LINE\n8\nDOORS/)
    expect(dxf).toMatch(/LINE\n8\nWINDOWS/)
  })

  it('labels each room by name on the LABELS layer', () => {
    expect(entityCount(dxf, 'TEXT')).toBe(smallPlan.rooms.length)
    expect(dxf).toContain('Living Room')
    expect(dxf).toMatch(/TEXT\n8\nLABELS/)
  })

  it('flips Z to -Y so the plan is not mirrored', () => {
    // North wall runs along z=0 → Y=0; south wall along z=3 → Y=-3.
    expect(dxf).toContain('20\n-3.000000')
    expect(dxf).not.toContain('20\n3.000000')
  })
})

describe('planToDxf edge cases', () => {
  it('handles an empty plan without throwing', () => {
    const empty: FloorPlan = {
      id: 'e',
      name: 'Empty',
      ceilingHeight: 2.6,
      extent: [0, 0],
      walls: [],
      openings: [],
      rooms: [],
    }
    const dxf = planToDxf(empty)
    expect(dxf).toContain('ENTITIES')
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
    expect(entityCount(dxf, 'LINE')).toBe(0)
  })

  it('guards missing arrays (Array.isArray) and zero-length walls', () => {
    // Intentionally malformed plan: missing openings/rooms, a degenerate wall.
    const bad = {
      id: 'b',
      name: 'Bad',
      ceilingHeight: 2.6,
      extent: [2, 2],
      walls: [
        { id: 'good', start: [0, 0], end: [2, 0], thickness: 'external' },
        { id: 'zero', start: [1, 1], end: [1, 1], thickness: 'internal' },
      ],
    } as unknown as FloorPlan
    const dxf = planToDxf(bad)
    // Only the non-degenerate wall yields a LINE; no openings/rooms/labels.
    expect(entityCount(dxf, 'LINE')).toBe(1)
    expect(entityCount(dxf, 'POLYLINE')).toBe(0)
    expect(entityCount(dxf, 'TEXT')).toBe(0)
  })

  it('skips openings whose wall is missing', () => {
    const plan: FloorPlan = {
      ...smallPlan,
      openings: [
        { id: 'orphan', kind: 'door', wallId: 'nope', offset: 0, width: 1, sill: 0, head: 2 },
      ],
    }
    const dxf = planToDxf(plan)
    // 4 wall LINEs, 0 opening LINEs.
    expect(entityCount(dxf, 'LINE')).toBe(smallPlan.walls.length)
  })

  it('exports a polygon room outline', () => {
    const plan: FloorPlan = {
      ...smallPlan,
      rooms: [
        {
          id: 'L',
          name: 'L Room',
          origin: [0, 0],
          width: 3,
          depth: 3,
          polygon: [
            [0, 0],
            [3, 0],
            [3, 1],
            [1, 1],
            [1, 3],
            [0, 3],
          ],
        },
      ],
    }
    const dxf = planToDxf(plan)
    expect(entityCount(dxf, 'POLYLINE')).toBe(1)
    // 6 polygon vertices → 6 VERTEX entities.
    expect(entityCount(dxf, 'VERTEX')).toBe(6)
  })
})

describe('dxf helpers', () => {
  it('dxfLine writes both endpoints with Z flipped', () => {
    const s = dxfLine('WALLS', 1, 2, 3, 4)
    expect(s).toContain('LINE')
    expect(s).toMatch(/10\n1\.000000/)
    expect(s).toMatch(/20\n-2\.000000/)
    expect(s).toMatch(/11\n3\.000000/)
    expect(s).toMatch(/21\n-4\.000000/)
  })

  it('dxfPolyline is closed and lists every vertex', () => {
    const s = dxfPolyline('ROOMS', [
      [0, 0],
      [1, 0],
      [1, 1],
    ])
    expect(s).toMatch(/POLYLINE\n8\nROOMS\n66\n1\n70\n1/)
    expect(count(s, '\n0\nVERTEX\n')).toBe(3)
    expect(s).toContain('SEQEND')
  })

  it('dxfText sanitises newlines in the label', () => {
    const s = dxfText('LABELS', 0, 0, 'Master\nBedroom')
    expect(s).toContain('Master Bedroom')
    expect(s).not.toContain('Master\nBedroom')
  })
})
