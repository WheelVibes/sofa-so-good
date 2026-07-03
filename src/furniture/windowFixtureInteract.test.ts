import { describe, expect, it } from 'vitest'
import type { FurnitureItem, ParametricDef } from './types'
import {
  isInteractableWindowFixture,
  nextWindowFixtureProps,
  windowFixtureAimSegments,
  windowFixtureCloseAmount,
  windowFixtureLabel,
} from './windowFixtureInteract'

function makeDef(overrides: Partial<ParametricDef> = {}): ParametricDef {
  return {
    kind: 'parametric',
    id: 'curtains',
    name: 'Curtains',
    category: 'textiles',
    primitive: 'Curtain',
    defaultFootprint: { w: 2.0, d: 0.12, h: 2.75 },
    windowBound: true,
    paramSchema: [],
    ...overrides,
  }
}

const blindDef = () => makeDef({ id: 'roller-blind', primitive: 'RollerBlind' })

function makeItem(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: 'item-1',
    defId: 'curtains',
    position: [0, 0],
    rotation: 0,
    props: {},
    ...overrides,
  } as FurnitureItem
}

describe('isInteractableWindowFixture', () => {
  it('is true for a window-bound Curtain def', () => {
    expect(isInteractableWindowFixture(makeDef())).toBe(true)
  })

  it('is true for a window-bound RollerBlind def', () => {
    expect(isInteractableWindowFixture(blindDef())).toBe(true)
  })

  it('is false for a non-window-bound def (e.g. a sofa)', () => {
    expect(isInteractableWindowFixture(makeDef({ windowBound: false, primitive: 'Sofa' }))).toBe(
      false,
    )
  })

  it('is false for a window-bound def whose primitive has no toggle prop', () => {
    // Hypothetical future window fixture without a drawAmount/lower axis —
    // eligibility requires BOTH windowBound and a known toggleable primitive.
    expect(isInteractableWindowFixture(makeDef({ windowBound: true, primitive: 'Sofa' }))).toBe(
      false,
    )
  })

  it('is false for a GLB def, even if windowBound were somehow set', () => {
    const gltfDef = {
      kind: 'gltf',
      id: 'some-gltf',
      name: 'Some GLB',
      category: 'decor',
      defaultFootprint: { w: 1, d: 1, h: 1 },
      windowBound: true,
      source: 'builtin',
      url: 'x.glb',
    } as unknown as ParametricDef
    expect(isInteractableWindowFixture(gltfDef)).toBe(false)
  })
})

describe('windowFixtureCloseAmount', () => {
  it('reads a numeric drawAmount/lower prop, clamped to [0,1]', () => {
    expect(windowFixtureCloseAmount(makeDef(), { drawAmount: 0.3 })).toBe(0.3)
    expect(windowFixtureCloseAmount(makeDef(), { drawAmount: -1 })).toBe(0)
    expect(windowFixtureCloseAmount(makeDef(), { drawAmount: 5 })).toBe(1)
  })

  it('falls back to the Curtain legacy `style` prop when drawAmount is absent', () => {
    expect(windowFixtureCloseAmount(makeDef(), { style: 'open' })).toBe(0)
    expect(windowFixtureCloseAmount(makeDef(), { style: 'drawn' })).toBe(1)
    expect(windowFixtureCloseAmount(makeDef(), {})).toBe(1)
  })

  it('defaults RollerBlind to fully lowered (1) when `lower` is absent', () => {
    expect(windowFixtureCloseAmount(blindDef(), {})).toBe(1)
  })
})

describe('nextWindowFixtureProps', () => {
  it('flips a mostly-open curtain to fully drawn', () => {
    expect(nextWindowFixtureProps(makeDef(), { drawAmount: 0.2 })).toEqual({ drawAmount: 1 })
  })

  it('flips a mostly-drawn curtain to fully open', () => {
    expect(nextWindowFixtureProps(makeDef(), { drawAmount: 0.8 })).toEqual({ drawAmount: 0 })
  })

  it('flips a roller blind between raised and lowered', () => {
    expect(nextWindowFixtureProps(blindDef(), { lower: 0 })).toEqual({ lower: 1 })
    expect(nextWindowFixtureProps(blindDef(), { lower: 1 })).toEqual({ lower: 0 })
  })

  it('returns null for a def whose primitive has no toggle prop (e.g. a sofa)', () => {
    expect(nextWindowFixtureProps(makeDef({ primitive: 'Sofa' }), {})).toBeNull()
  })
})

describe('windowFixtureLabel', () => {
  it('labels a closed curtain "Open curtains" and an open one "Close curtains"', () => {
    expect(windowFixtureLabel(makeDef(), { drawAmount: 1 })).toEqual({
      action: 'Open',
      noun: 'curtains',
    })
    expect(windowFixtureLabel(makeDef(), { drawAmount: 0 })).toEqual({
      action: 'Close',
      noun: 'curtains',
    })
  })

  it('labels a lowered blind "Raise blind" and a raised one "Lower blind"', () => {
    expect(windowFixtureLabel(blindDef(), { lower: 1 })).toEqual({ action: 'Raise', noun: 'blind' })
    expect(windowFixtureLabel(blindDef(), { lower: 0 })).toEqual({ action: 'Lower', noun: 'blind' })
  })

  it('returns null for a non-fixture def', () => {
    expect(windowFixtureLabel(makeDef({ windowBound: false, primitive: 'Sofa' }), {})).toBeNull()
  })
})

describe('windowFixtureAimSegments', () => {
  const getDef = (id: string) => {
    if (id === 'curtains') return makeDef()
    if (id === 'sofa') return makeDef({ windowBound: false, primitive: 'Sofa' })
    return undefined
  }

  it('builds one segment per eligible item, skipping non-fixtures and unknown defs', () => {
    const items: FurnitureItem[] = [
      makeItem({ id: 'a', defId: 'curtains', position: [1, 2], rotation: 0 }),
      makeItem({ id: 'b', defId: 'sofa' }),
      makeItem({ id: 'c', defId: 'missing' }),
    ]
    const segs = windowFixtureAimSegments(items, getDef)
    expect(segs).toHaveLength(1)
    expect(segs[0].id).toBe('a')
  })

  it('centers the segment on the item position, spanning its full width', () => {
    const items: FurnitureItem[] = [makeItem({ id: 'a', position: [5, 5], rotation: 0 })]
    const [seg] = windowFixtureAimSegments(items, getDef)
    // Curtain defaultFootprint.w = 2.0 → half-width 1.0 either side of x=5.
    expect(seg.sx).toBeCloseTo(4)
    expect(seg.sz).toBeCloseTo(5)
    expect(seg.sx + seg.segDx).toBeCloseTo(6)
    expect(seg.sz + seg.segDz).toBeCloseTo(5)
  })

  it('rotates the segment with the item facing', () => {
    const items: FurnitureItem[] = [makeItem({ id: 'a', position: [0, 0], rotation: Math.PI / 2 })]
    const [seg] = windowFixtureAimSegments(items, getDef)
    // A 90° rotation swaps the width axis onto Z.
    expect(seg.sx).toBeCloseTo(0)
    expect(seg.sz).toBeCloseTo(-1)
    expect(seg.sx + seg.segDx).toBeCloseTo(0)
    expect(seg.sz + seg.segDz).toBeCloseTo(1)
  })
})
