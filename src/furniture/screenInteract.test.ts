import { describe, expect, it } from 'vitest'
import {
  isInteractableScreen,
  nextScreenContentProps,
  screenAimSegments,
  screenLabel,
} from './screenInteract'
import type { FurnitureItem, ParametricDef } from './types'

const SCREEN_CONTENT_FIELD = {
  kind: 'enum' as const,
  key: 'screenContent',
  label: 'On-screen',
  default: 'landscape',
  options: [
    { value: 'landscape', label: 'Landscape' },
    { value: 'sunset', label: 'Sunset' },
    { value: 'abstract', label: 'Abstract' },
  ],
}

function makeDef(overrides: Partial<ParametricDef> = {}): ParametricDef {
  return {
    kind: 'parametric',
    id: 'monitor',
    name: 'Monitor',
    category: 'electronics',
    primitive: 'Monitor',
    defaultFootprint: { w: 0.62, d: 0.2, h: 0.5 },
    paramSchema: [SCREEN_CONTENT_FIELD],
    ...overrides,
  }
}

const sofaDef = () =>
  makeDef({ id: 'sofa-3seat', name: 'Sofa', primitive: 'Sofa', paramSchema: [] })

function makeItem(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: 'item-1',
    defId: 'monitor',
    position: [0, 0],
    rotation: 0,
    props: {},
    ...overrides,
  } as FurnitureItem
}

describe('isInteractableScreen', () => {
  it('is true for a parametric def with a screenContent enum field', () => {
    expect(isInteractableScreen(makeDef())).toBe(true)
  })

  it('is false for a parametric def with no screenContent field (e.g. a sofa)', () => {
    expect(isInteractableScreen(sofaDef())).toBe(false)
  })

  it('is false for a GLB def, even with a matching schema shape', () => {
    const gltfDef = {
      kind: 'gltf',
      id: 'some-gltf',
      name: 'Some GLB',
      category: 'electronics',
      defaultFootprint: { w: 1, d: 1, h: 1 },
      source: 'builtin',
      url: 'x.glb',
    } as unknown as ParametricDef
    expect(isInteractableScreen(gltfDef)).toBe(false)
  })
})

describe('nextScreenContentProps', () => {
  it('cycles landscape -> sunset -> abstract -> landscape', () => {
    expect(nextScreenContentProps(makeDef(), { screenContent: 'landscape' })).toEqual({
      screenContent: 'sunset',
    })
    expect(nextScreenContentProps(makeDef(), { screenContent: 'sunset' })).toEqual({
      screenContent: 'abstract',
    })
    expect(nextScreenContentProps(makeDef(), { screenContent: 'abstract' })).toEqual({
      screenContent: 'landscape',
    })
  })

  it('falls back to the field default when screenContent is absent', () => {
    // default is 'landscape' -> next is 'sunset'
    expect(nextScreenContentProps(makeDef(), {})).toEqual({ screenContent: 'sunset' })
  })

  it('starts from the first option when the current value is unrecognised', () => {
    expect(nextScreenContentProps(makeDef(), { screenContent: 'nonsense' })).toEqual({
      screenContent: 'landscape',
    })
  })

  it('returns null for a def with no screenContent field (e.g. a sofa)', () => {
    expect(nextScreenContentProps(sofaDef(), {})).toBeNull()
  })
})

describe('screenLabel', () => {
  it('labels every screen "Change wallpaper"', () => {
    expect(screenLabel(makeDef())).toEqual({ action: 'Change', noun: 'wallpaper' })
  })

  it('returns null for a non-screen def', () => {
    expect(screenLabel(sofaDef())).toBeNull()
  })
})

describe('screenAimSegments', () => {
  const getDef = (id: string) => {
    if (id === 'monitor') return makeDef()
    if (id === 'sofa') return sofaDef()
    return undefined
  }

  it('builds one segment per eligible item, skipping non-screens and unknown defs', () => {
    const items: FurnitureItem[] = [
      makeItem({ id: 'a', defId: 'monitor', position: [1, 2], rotation: 0 }),
      makeItem({ id: 'b', defId: 'sofa' }),
      makeItem({ id: 'c', defId: 'missing' }),
    ]
    const segs = screenAimSegments(items, getDef)
    expect(segs).toHaveLength(1)
    expect(segs[0].id).toBe('a')
  })

  it('centers the segment on the item position, spanning its full width', () => {
    const items: FurnitureItem[] = [makeItem({ id: 'a', position: [5, 5], rotation: 0 })]
    const [seg] = screenAimSegments(items, getDef)
    // Monitor defaultFootprint.w = 0.62 -> half-width 0.31 either side of x=5.
    expect(seg.sx).toBeCloseTo(4.69)
    expect(seg.sz).toBeCloseTo(5)
    expect(seg.sx + seg.segDx).toBeCloseTo(5.31)
    expect(seg.sz + seg.segDz).toBeCloseTo(5)
  })
})
