import { describe, expect, it } from 'vitest'
import {
  isInteractableLight,
  lightAimSegments,
  lightLabel,
  nextLightPowerProps,
} from './lightInteract'
import type { FurnitureItem, FurnitureType, ParametricDef } from './types'

function makeDef(overrides: Partial<ParametricDef> = {}): ParametricDef {
  return {
    kind: 'parametric',
    id: 'table-lamp',
    name: 'Table lamp',
    category: 'lighting',
    primitive: 'TableLamp',
    defaultFootprint: { w: 0.3, d: 0.3, h: 0.44 },
    paramSchema: [],
    ...overrides,
  }
}

const sofaDef = () => makeDef({ id: 'sofa-3seat', name: 'Sofa', primitive: 'Sofa' })

function makeItem(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: 'item-1',
    defId: 'table-lamp',
    position: [0, 0],
    rotation: 0,
    props: {},
    ...overrides,
  } as FurnitureItem
}

describe('isInteractableLight', () => {
  it('is true for a registered fixture (e.g. table-lamp)', () => {
    expect(isInteractableLight('table-lamp' as FurnitureType, {})).toBe(true)
  })

  it('is false for a plain sofa with no light history', () => {
    expect(isInteractableLight('sofa-3seat' as FurnitureType, {})).toBe(false)
  })

  it('is true for any item already flagged (on or off) via the itemAsLight override', () => {
    expect(isInteractableLight('sofa-3seat' as FurnitureType, { lightOn: 'yes' })).toBe(true)
    expect(isInteractableLight('sofa-3seat' as FurnitureType, { lightOn: 'no' })).toBe(true)
  })
})

describe('nextLightPowerProps', () => {
  it('turns a default-on registered fixture off', () => {
    expect(nextLightPowerProps('table-lamp' as FurnitureType, {})).toEqual({ lightOn: 'no' })
  })

  it('turns an off fixture back on', () => {
    expect(nextLightPowerProps('table-lamp' as FurnitureType, { lightOn: 'no' })).toEqual({
      lightOn: 'yes',
    })
  })

  it('round-trips a user-override light source on a non-fixture item', () => {
    const sofa = 'sofa-3seat' as FurnitureType
    expect(nextLightPowerProps(sofa, { lightOn: 'yes' })).toEqual({ lightOn: 'no' })
    expect(nextLightPowerProps(sofa, { lightOn: 'no' })).toEqual({ lightOn: 'yes' })
  })

  it('returns null for a non-interactable item (e.g. a sofa with no light history)', () => {
    expect(nextLightPowerProps('sofa-3seat' as FurnitureType, {})).toBeNull()
  })

  it('respects a gated fixture (vanity) — off toggle wins even when its own gate would pass', () => {
    const vanity = 'vanity' as FurnitureType
    expect(nextLightPowerProps(vanity, { lights: 'yes', mirror: 'rect' })).toEqual({
      lightOn: 'no',
    })
  })
})

describe('lightLabel', () => {
  it('labels an on fixture "Turn off {name}"', () => {
    expect(lightLabel(makeDef(), {})).toEqual({ action: 'Turn off', noun: 'table lamp' })
  })

  it('labels an off fixture "Turn on {name}"', () => {
    expect(lightLabel(makeDef(), { lightOn: 'no' })).toEqual({
      action: 'Turn on',
      noun: 'table lamp',
    })
  })

  it('returns null for a non-interactable def (e.g. a sofa)', () => {
    expect(lightLabel(sofaDef(), {})).toBeNull()
  })
})

describe('lightAimSegments', () => {
  const getDef = (id: string) => {
    if (id === 'table-lamp') return makeDef()
    if (id === 'sofa') return sofaDef()
    return undefined
  }

  it('builds one segment per eligible item, skipping non-lights and unknown defs', () => {
    const items: FurnitureItem[] = [
      makeItem({ id: 'a', defId: 'table-lamp', position: [1, 2], rotation: 0 }),
      makeItem({ id: 'b', defId: 'sofa' }),
      makeItem({ id: 'c', defId: 'missing' }),
    ]
    const segs = lightAimSegments(items, getDef)
    expect(segs).toHaveLength(1)
    expect(segs[0].id).toBe('a')
  })

  it('includes a non-fixture item flagged as a user light-source override', () => {
    const items: FurnitureItem[] = [makeItem({ id: 'a', defId: 'sofa', props: { lightOn: 'yes' } })]
    const segs = lightAimSegments(items, getDef)
    expect(segs).toHaveLength(1)
    expect(segs[0].id).toBe('a')
  })

  it('centers the segment on the item position, spanning its full width', () => {
    const items: FurnitureItem[] = [makeItem({ id: 'a', position: [5, 5], rotation: 0 })]
    const [seg] = lightAimSegments(items, getDef)
    // table-lamp defaultFootprint.w = 0.3 -> half-width 0.15 either side of x=5.
    expect(seg.sx).toBeCloseTo(4.85)
    expect(seg.sz).toBeCloseTo(5)
    expect(seg.sx + seg.segDx).toBeCloseTo(5.15)
    expect(seg.sz + seg.segDz).toBeCloseTo(5)
  })
})
