import { describe, expect, it } from 'vitest'
import { FloorPlanZ } from '../state/schema'
import {
  buildSwitchCircuits,
  type CircuitLightInput,
  type CircuitSwitchInput,
  suggestCircuitLinks,
} from './switchCircuits'
import { hdb4Room } from './templates/hdb'
import type { FloorPlan } from './types'

const sw = (
  id: string,
  x: number,
  z: number,
  extra: Partial<CircuitSwitchInput> = {},
): CircuitSwitchInput => ({
  id,
  x,
  z,
  ...extra,
})
const light = (id: string, x: number, z: number, type = 'ceiling-light'): CircuitLightInput => ({
  id,
  x,
  z,
  type,
})

describe('PlanElectricalPoint switch-circuit schema round-trip (BSJ-3)', () => {
  it('preserves controls / gang / way through FloorPlanZ', () => {
    const plan: FloorPlan = {
      id: 'p',
      name: 'T',
      ceilingHeight: 2.6,
      extent: [4, 4],
      walls: [],
      openings: [],
      rooms: [],
      electricalPoints: [
        { id: 's1', x: 1, z: 1, kind: 'switch', controls: ['l1', 'l2'], gang: 2, way: 2 },
        { id: 's2', x: 2, z: 2, kind: 'switch' },
      ],
    }
    const parsed = FloorPlanZ.parse(plan)
    const s1 = parsed.electricalPoints?.find((p) => p.id === 's1')
    expect(s1?.controls).toEqual(['l1', 'l2'])
    expect(s1?.gang).toBe(2)
    expect(s1?.way).toBe(2)
    const s2 = parsed.electricalPoints?.find((p) => p.id === 's2')
    expect(s2?.controls).toBeUndefined()
  })
})

describe('buildSwitchCircuits (BSJ-3)', () => {
  it('assigns one circuit + L-marks per linked switch, deterministically', () => {
    const lights = [light('lA', 3, 1), light('lB', 3, 2)]
    const switches = [sw('s1', 1, 1, { controls: ['lA', 'lB'] })]
    const plan = buildSwitchCircuits(switches, lights)
    expect(plan.circuits).toHaveLength(1)
    expect(plan.circuits[0]!.tag).toBe('S1')
    expect(plan.tagBySwitchId.get('s1')).toBe('S1')
    // Lights sorted by (x,z,id): lA (z=1) before lB (z=2).
    expect(plan.lightMarkById.get('lA')).toBe('L1')
    expect(plan.lightMarkById.get('lB')).toBe('L2')
    expect(plan.circuits[0]!.lightMarks).toEqual(['L1', 'L2'])
    expect(plan.tagsByLightId.get('lA')).toEqual(['S1'])
  })

  it('is order-independent (stable S/L tags regardless of input order)', () => {
    const lights = [light('lA', 1, 1), light('lB', 5, 5)]
    const a = buildSwitchCircuits(
      [sw('sB', 5, 5, { controls: ['lB'] }), sw('sA', 1, 1, { controls: ['lA'] })],
      lights,
    )
    const b = buildSwitchCircuits(
      [sw('sA', 1, 1, { controls: ['lA'] }), sw('sB', 5, 5, { controls: ['lB'] })],
      [...lights].reverse(),
    )
    // sA is at the smaller (x,z), so it is always S1.
    expect(a.tagBySwitchId.get('sA')).toBe('S1')
    expect(b.tagBySwitchId.get('sA')).toBe('S1')
    expect(a.tagBySwitchId.get('sB')).toBe(b.tagBySwitchId.get('sB'))
    expect(a.lightMarkById.get('lA')).toBe(b.lightMarkById.get('lA'))
  })

  it('pairs two-way switches into one circuit with a/b tags', () => {
    const lights = [light('lA', 3, 3)]
    const switches = [
      sw('s1', 1, 1, { controls: ['lA'], way: 2 }),
      sw('s2', 5, 5, { controls: ['lA'], way: 2 }),
    ]
    const plan = buildSwitchCircuits(switches, lights)
    expect(plan.circuits).toHaveLength(1)
    expect(plan.circuits[0]!.way).toBe(2)
    expect(plan.circuits[0]!.switchIds).toEqual(['s1', 's2'])
    expect(plan.tagBySwitchId.get('s1')).toBe('S1a')
    expect(plan.tagBySwitchId.get('s2')).toBe('S1b')
    // Both share circuit number 1 → the light shows one tag.
    expect(plan.tagsByLightId.get('lA')).toEqual(['S1'])
  })

  it('counts unswitched lights and empty switches for the advisory', () => {
    const lights = [light('lA', 1, 1), light('lB', 2, 2), light('lC', 3, 3)]
    const switches = [
      sw('s1', 0, 0, { controls: ['lA'] }), // links lA
      sw('s2', 9, 9), // empty
      sw('s3', 8, 8, { controls: ['ghost'] }), // controls a missing light → empty
    ]
    const plan = buildSwitchCircuits(switches, lights)
    expect(plan.unswitchedLightCount).toBe(2) // lB + lC
    expect(plan.emptySwitchCount).toBe(2) // s2 + s3
  })

  it('describes a circuit by room + fixture type via the resolver', () => {
    const lights = [light('lA', 1, 1, 'ceiling-light'), light('lB', 1.5, 1, 'ceiling-light')]
    const plan = buildSwitchCircuits(
      [sw('s1', 0, 0, { controls: ['lA', 'lB'], gang: 2 })],
      lights,
      () => 'Living',
    )
    expect(plan.circuits[0]!.roomLabel).toBe('Living downlights (2-gang)')
  })
})

describe('suggestCircuitLinks heuristic (BSJ-3)', () => {
  it('links the door-nearest switch to the room lights (synthetic plan)', () => {
    // One 6×4 room, door on the bottom wall near x=1, two switches — one by the
    // door, one at the far corner — and one light. The door-nearest wins.
    const plan: FloorPlan = {
      id: 'p',
      name: 'T',
      ceilingHeight: 2.6,
      extent: [6, 4],
      walls: [{ id: 'w-bottom', start: [0, 0], end: [6, 0], thickness: 'external' }],
      openings: [
        { id: 'd1', kind: 'door', wallId: 'w-bottom', offset: 0.8, width: 0.9, sill: 0, head: 2.1 },
      ],
      rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 6, depth: 4 }],
    }
    const switches = [
      sw('near', 1.2, 0.4), // just inside the door
      sw('far', 5.5, 3.5), // opposite corner
    ]
    const lights = [light('lA', 3, 2)]
    const map = suggestCircuitLinks(plan, switches, lights)
    expect(map.get('near')).toEqual(['lA'])
    expect(map.has('far')).toBe(false)
  })

  it('links a switch in every room that has a switch + a light (HDB 4-room template)', () => {
    const plan = hdb4Room()
    // Place one switch + one light at each room's rectangular centre.
    const switches: CircuitSwitchInput[] = []
    const lights: CircuitLightInput[] = []
    for (const r of plan.rooms) {
      const cx = r.origin[0] + r.width / 2
      const cz = r.origin[1] + r.depth / 2
      switches.push(sw(`sw-${r.id}`, cx, cz))
      lights.push(light(`li-${r.id}`, cx, cz))
    }
    const map = suggestCircuitLinks(plan, switches, lights)
    // Every room got exactly its one switch linked to its one light.
    expect(map.size).toBe(plan.rooms.length)
    for (const r of plan.rooms) {
      expect(map.get(`sw-${r.id}`)).toEqual([`li-${r.id}`])
    }
  })
})
