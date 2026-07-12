import { describe, expect, it } from 'vitest'
import { buildCabinet, type CabinetSpec } from './cabinetModel'

const base = (over: Partial<CabinetSpec> = {}): CabinetSpec => ({
  type: 'base',
  width: 0.6,
  height: 0.72,
  depth: 0.6,
  columns: 1,
  front: 'slab',
  toeKick: 0.1,
  countertop: true,
  countertopThickness: 0.04,
  cornice: false,
  drawerRows: 3,
  ...over,
})

const byRole = (m: ReturnType<typeof buildCabinet>, role: string) =>
  m.parts.filter((p) => p.role === role)

describe('buildCabinet — structural soundness', () => {
  it('stacks toe-kick → carcass → countertop with the carcass resting on the toe-kick', () => {
    const m = buildCabinet(base())
    const toe = byRole(m, 'toeKick')[0]
    const carcass = byRole(m, 'carcass')[0]
    const top = byRole(m, 'countertop')[0]
    expect(toe).toBeTruthy()
    // Toe-kick bottom on the floor.
    expect(toe.position[1] - toe.size[1] / 2).toBeCloseTo(0)
    // Carcass bottom sits exactly on the toe-kick top.
    const carcassBottom = carcass.position[1] - carcass.size[1] / 2
    expect(carcassBottom).toBeCloseTo(toe.size[1])
    // Countertop sits exactly on the carcass top.
    const carcassTop = carcass.position[1] + carcass.size[1] / 2
    expect(top.position[1] - top.size[1] / 2).toBeCloseTo(carcassTop)
    // totalHeight reaches the countertop top.
    expect(m.totalHeight).toBeCloseTo(carcassTop + top.size[1])
  })

  it('recesses the toe-kick behind the carcass front face', () => {
    const m = buildCabinet(base())
    const toe = byRole(m, 'toeKick')[0]
    const carcass = byRole(m, 'carcass')[0]
    const toeFront = toe.position[2] + toe.size[2] / 2
    const carcassFront = carcass.position[2] + carcass.size[2] / 2
    expect(toeFront).toBeLessThan(carcassFront)
  })

  it('keeps every front proud of the carcass front face', () => {
    const m = buildCabinet(base({ columns: 2 }))
    const carcass = byRole(m, 'carcass')[0]
    const carcassFront = carcass.position[2] + carcass.size[2] / 2
    for (const door of byRole(m, 'door')) {
      expect(door.position[2]).toBeGreaterThan(carcassFront)
    }
  })

  it('divides the width into the requested number of door columns', () => {
    expect(byRole(buildCabinet(base({ columns: 1 })), 'door')).toHaveLength(1)
    expect(byRole(buildCabinet(base({ columns: 3 })), 'door')).toHaveLength(3)
  })

  it('clamps absurd column counts into 1–4', () => {
    expect(byRole(buildCabinet(base({ columns: 99 })), 'door')).toHaveLength(4)
    expect(byRole(buildCabinet(base({ columns: 0 })), 'door')).toHaveLength(1)
  })
})

describe('buildCabinet — front styles', () => {
  it('drawers produce drawerRows × columns drawer fronts (each with a handle)', () => {
    const m = buildCabinet(base({ front: 'drawers', columns: 2, drawerRows: 3 }))
    expect(byRole(m, 'drawer')).toHaveLength(6)
    expect(byRole(m, 'handle')).toHaveLength(6)
    expect(byRole(m, 'door')).toHaveLength(0)
  })

  it('glass fronts add an inset pane behind each door', () => {
    const m = buildCabinet(base({ front: 'glass', columns: 2 }))
    expect(byRole(m, 'door')).toHaveLength(2)
    expect(byRole(m, 'glass')).toHaveLength(2)
    // Pane is inset narrower than its door.
    expect(byRole(m, 'glass')[0].size[0]).toBeLessThan(byRole(m, 'door')[0].size[0])
  })

  it('open fronts emit shelves and no doors/handles', () => {
    const m = buildCabinet(base({ front: 'open', height: 0.72 }))
    expect(byRole(m, 'door')).toHaveLength(0)
    expect(byRole(m, 'handle')).toHaveLength(0)
    expect(byRole(m, 'shelf').length).toBeGreaterThanOrEqual(1)
  })
})

describe('buildCabinet — type-specific elements', () => {
  it('wall cabinets have no toe-kick and never a countertop', () => {
    const m = buildCabinet(base({ type: 'wall', toeKick: 0.1, countertop: true, cornice: true }))
    expect(byRole(m, 'toeKick')).toHaveLength(0)
    expect(byRole(m, 'countertop')).toHaveLength(0)
    expect(byRole(m, 'cornice')).toHaveLength(1)
  })

  it('tall cabinets keep the toe-kick and can take a cornice but not a countertop', () => {
    const m = buildCabinet(base({ type: 'tall', height: 2.0, cornice: true, countertop: true }))
    expect(byRole(m, 'toeKick')).toHaveLength(1)
    expect(byRole(m, 'cornice')).toHaveLength(1)
    expect(byRole(m, 'countertop')).toHaveLength(0)
    const carcass = byRole(m, 'carcass')[0]
    const carcassTop = carcass.position[1] + carcass.size[1] / 2
    expect(m.totalHeight).toBeGreaterThan(carcassTop) // cornice adds height
  })

  it('base cabinets never get a cornice', () => {
    const m = buildCabinet(base({ type: 'base', cornice: true }))
    expect(byRole(m, 'cornice')).toHaveLength(0)
  })

  it('a plain countertop is one slab with no worktop cutout', () => {
    const m = buildCabinet(base({ countertop: true, worktop: 'none' }))
    expect(byRole(m, 'countertop')).toHaveLength(1)
    expect(m.worktopCutout).toBeNull()
  })

  it('a sink turns the worktop into a 4-strip frame around a cutout', () => {
    const m = buildCabinet(base({ width: 0.8, countertop: true, worktop: 'sink' }))
    expect(byRole(m, 'countertop')).toHaveLength(4) // left/right/back/front rim
    expect(m.worktopCutout?.kind).toBe('sink')
    const cut = m.worktopCutout!
    // Opening fits inside the cabinet width/depth and sits at the worktop top.
    expect(cut.w).toBeLessThan(0.8)
    expect(cut.topY).toBeCloseTo(m.totalHeight)
  })

  it('a hob cuts the worktop the same way and is tagged as a hob', () => {
    const m = buildCabinet(base({ width: 0.8, countertop: true, worktop: 'hob' }))
    expect(byRole(m, 'countertop')).toHaveLength(4)
    expect(m.worktopCutout?.kind).toBe('hob')
  })

  it('a worktop feature only applies with a countertop on a base cabinet', () => {
    expect(buildCabinet(base({ countertop: false, worktop: 'sink' })).worktopCutout).toBeNull()
    expect(buildCabinet(base({ type: 'tall', worktop: 'hob' })).worktopCutout).toBeNull()
  })
})

describe('buildCabinet — handle styles', () => {
  it('defaults to bar handles (one per door)', () => {
    const m = buildCabinet(base({ columns: 2, front: 'slab' }))
    expect(m.handleStyle).toBe('bar')
    expect(byRole(m, 'handle')).toHaveLength(2)
  })

  it('omits all handle parts for a handleless cabinet', () => {
    const m = buildCabinet(base({ columns: 2, front: 'slab', handle: 'none' }))
    expect(m.handleStyle).toBe('none')
    expect(byRole(m, 'handle')).toHaveLength(0)
  })

  it('keeps a handle part per drawer for the knob style', () => {
    const m = buildCabinet(base({ columns: 2, front: 'drawers', drawerRows: 3, handle: 'knob' }))
    expect(m.handleStyle).toBe('knob')
    expect(byRole(m, 'handle')).toHaveLength(6)
  })

  it('reports a footprint that includes the countertop overhang + front proudness', () => {
    const m = buildCabinet(base({ width: 0.6, depth: 0.6 }))
    expect(m.bounds.w).toBeGreaterThan(0.6)
    expect(m.bounds.d).toBeGreaterThan(0.6)
  })
})

describe('buildCabinet — open/close front grouping (CABINET-OPEN)', () => {
  it('tags each door with its column index and an outer-edge hinge side', () => {
    const m = buildCabinet(base({ columns: 2, front: 'slab' }))
    const doors = byRole(m, 'door')
    expect(doors.map((d) => d.column)).toEqual([0, 1])
    // Left-half column hinges left; right-half column hinges right → a natural
    // double-door open with handles meeting in the middle.
    expect(doors[0].hinge).toBe('left')
    expect(doors[1].hinge).toBe('right')
  })

  it('groups a glass pane + handle onto the same column as their door', () => {
    const m = buildCabinet(base({ columns: 2, front: 'glass' }))
    for (const role of ['door', 'glass', 'handle'] as const) {
      expect(byRole(m, role).map((p) => p.column)).toEqual([0, 1])
    }
  })

  it('tags every drawer front (and handle) with its column, and no hinge', () => {
    const m = buildCabinet(base({ columns: 2, front: 'drawers', drawerRows: 3 }))
    const drawers = byRole(m, 'drawer')
    expect(drawers).toHaveLength(6)
    // Three drawers per column: [0,0,0,1,1,1].
    expect(drawers.map((d) => d.column).sort()).toEqual([0, 0, 0, 1, 1, 1])
    expect(drawers.every((d) => d.hinge === undefined)).toBe(true)
  })

  it('leaves the static carcass/toe-kick/countertop with no column', () => {
    const m = buildCabinet(base({ columns: 2 }))
    for (const role of ['carcass', 'toeKick', 'countertop'] as const) {
      expect(byRole(m, role).every((p) => p.column === undefined)).toBe(true)
    }
  })
})
