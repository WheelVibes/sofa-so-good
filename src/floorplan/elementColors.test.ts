import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/flags/resolve'
import { FloorPlanZ } from '../state/schema'
import { resolvePlanRoomCeiling } from './roomFinishes'
import type { PlanRoom } from './types'

describe('elementColors + openingStyles feature flags', () => {
  // Simple-tier + default-on → visible in BOTH modes (CLAUDE.md: tier-dependent
  // visibility must be tested in Simple and Pro).
  it('are enabled in both Simple and Pro mode', () => {
    for (const mode of ['simple', 'pro'] as const) {
      const f = resolveFlags(true, {}, false, mode)
      expect(f.elementColors).toBe(true)
      expect(f.openingStyles).toBe(true)
    }
  })
})

describe('ceilingFinish feature flag (simple tier)', () => {
  // Simple-tier + default-on → visible in BOTH modes, like floor/wall finish.
  it('is enabled in both Simple and Pro mode', () => {
    for (const mode of ['simple', 'pro'] as const) {
      expect(resolveFlags(true, {}, false, mode).ceilingFinish).toBe(true)
    }
  })
})

describe('resolvePlanRoomCeiling read order', () => {
  const room = (over: Partial<PlanRoom> = {}): PlanRoom => ({
    id: 'r1',
    name: 'Room',
    origin: [0, 0],
    width: 4,
    depth: 3,
    ...over,
  })
  it('reads slice → plan room default → null', () => {
    // No pick anywhere → default white (null).
    expect(resolvePlanRoomCeiling({ floor: {}, walls: {} }, room())).toBeNull()
    // Plan-room default applies when the slice has none.
    expect(
      resolvePlanRoomCeiling({ floor: {}, walls: {} }, room({ ceilingFinish: 'wall-paint-blue' })),
    ).toBe('wall-paint-blue')
    // Live slice wins over the plan-room default.
    expect(
      resolvePlanRoomCeiling(
        { floor: {}, walls: {}, ceiling: { r1: 'wall-brick-red' } },
        room({ ceilingFinish: 'wall-paint-blue' }),
      ),
    ).toBe('wall-brick-red')
  })
})

describe('itemOpacity feature flag (pro tier)', () => {
  // Pro-tier + default-on → forced OFF in Simple, ON in Pro (CLAUDE.md: a pro
  // feature must be tested hidden in Simple and present in Pro).
  it('is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(true, {}, false, 'simple').itemOpacity).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').itemOpacity).toBe(true)
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
        style: 'glazed',
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
        style: 'grille',
      },
    ],
  }

  it('round-trips a per-wall colour and door/window colours + styles', () => {
    const parsed = FloorPlanZ.parse(plan)
    expect(parsed.walls[0].color).toBe('#ff8800')
    expect(parsed.openings[0].style).toBe('glazed')
    expect(parsed.openings[1].style).toBe('grille')
    expect(parsed.openings[0].color).toBe('#3366cc')
    expect(parsed.openings[1].color).toBe('#88ddff')
  })
})
