import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/flags/resolve'
import { FloorPlanZ } from '../state/schema'

describe('elementColors feature flag', () => {
  // Simple-tier + default-on → visible in BOTH modes (CLAUDE.md: tier-dependent
  // visibility must be tested in Simple and Pro).
  it('is enabled in both Simple and Pro mode', () => {
    expect(resolveFlags(true, {}, false, 'simple').elementColors).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').elementColors).toBe(true)
  })
})

describe('per-element colour persistence (schema round-trip)', () => {
  const plan = {
    id: 'plan-x',
    name: 'Test',
    extent: [10, 10] as [number, number],
    ceilingHeight: 2.6,
    rooms: [],
    walls: [
      {
        id: 'w1',
        start: [0, 0] as [number, number],
        end: [4, 0] as [number, number],
        thickness: 'internal' as const,
        color: '#ff8800',
      },
    ],
    openings: [
      {
        id: 'o1',
        kind: 'door' as const,
        wallId: 'w1',
        offset: 1,
        width: 0.9,
        sill: 0,
        head: 2,
        color: '#3366cc',
      },
      {
        id: 'o2',
        kind: 'window' as const,
        wallId: 'w1',
        offset: 2,
        width: 1,
        sill: 0.9,
        head: 2.1,
        color: '#88ddff',
      },
    ],
  }

  it('round-trips a per-wall colour and door/window colours', () => {
    const parsed = FloorPlanZ.parse(plan)
    expect(parsed.walls[0].color).toBe('#ff8800')
    expect(parsed.openings[0].color).toBe('#3366cc')
    expect(parsed.openings[1].color).toBe('#88ddff')
  })
})
