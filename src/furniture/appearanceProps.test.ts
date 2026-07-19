import { describe, expect, it } from 'vitest'
import {
  appearanceKeys,
  clearRecolorPatch,
  currentRecolorValue,
  extractAppearance,
  mergeAppearance,
  recolorPatch,
} from './appearanceProps'
import type { FurnitureDef, ParamField } from './types'

function paramDef(schema: ParamField[]): FurnitureDef {
  return {
    kind: 'parametric',
    id: 'test' as FurnitureDef['id'],
    name: 'Test',
    category: 'seating',
    defaultFootprint: { w: 1, d: 1, h: 1 },
    primitive: 'Sofa' as never,
    paramSchema: schema,
  } as unknown as FurnitureDef
}

const SOFA = paramDef([
  { kind: 'number', key: 'width', label: 'W', min: 0, max: 3, step: 0.1, default: 2 },
  { kind: 'color', key: 'color', label: 'Colour', default: '#888' },
  {
    kind: 'enum',
    key: 'fabric',
    label: 'Fabric',
    options: [{ value: 'linen', label: 'Linen' }],
    default: 'linen',
  },
  {
    kind: 'enum',
    key: 'orientation',
    label: 'Orientation',
    options: [{ value: 'left', label: 'Left' }],
    default: 'left',
  },
])

describe('appearanceKeys', () => {
  it('picks colour + look-naming enums, not size or unrelated enums', () => {
    const keys = appearanceKeys(SOFA)
    expect(keys).toContain('color')
    expect(keys).toContain('fabric')
    expect(keys).not.toContain('width') // size
    expect(keys).not.toContain('orientation') // form, not look
  })

  it('uses variant/tint for gltf items', () => {
    const gltf = {
      kind: 'gltf',
      id: 'x',
      name: 'x',
      category: 'seating',
    } as unknown as FurnitureDef
    expect(appearanceKeys(gltf)).toContain('variant')
    expect(appearanceKeys(gltf)).toContain('tint')
  })
})

describe('extractAppearance', () => {
  it('keeps only present appearance props', () => {
    const got = extractAppearance({ width: 2.4, color: '#111', fabric: 'velvet' }, SOFA)
    expect(got).toEqual({ color: '#111', fabric: 'velvet' })
  })
})

describe('mergeAppearance', () => {
  it('applies only keys the target understands, never size', () => {
    const chair = paramDef([
      { kind: 'color', key: 'color', label: 'Colour', default: '#888' },
      { kind: 'number', key: 'seatH', label: 'H', min: 0, max: 1, step: 0.1, default: 0.45 },
    ])
    const next = mergeAppearance(
      { color: '#000', seatH: 0.45 },
      { color: '#111', fabric: 'velvet', width: 9 },
      chair,
    )
    expect(next.color).toBe('#111') // shared dim transferred
    expect(next).not.toHaveProperty('fabric') // chair has no fabric
    expect(next.seatH).toBe(0.45) // size untouched
  })

  it('returns the same reference when nothing changes', () => {
    const props = { color: '#111' }
    expect(mergeAppearance(props, { color: '#111' }, SOFA)).toBe(props)
  })
})

const gltf = {
  kind: 'gltf',
  id: 'x',
  name: 'x',
  category: 'seating',
} as unknown as FurnitureDef

const MULTI_COLOR = paramDef([
  { kind: 'color', key: 'seatColor', label: 'Seat', default: '#7a5c3c' },
  { kind: 'color', key: 'legColor', label: 'Legs', default: '#4e3a24' },
  { kind: 'number', key: 'width', label: 'W', min: 0, max: 3, step: 0.1, default: 2 },
])

describe('recolorPatch', () => {
  it('targets props.tint for gltf/ikea defs', () => {
    expect(recolorPatch(gltf, '#ff8800')).toEqual({ tint: '#ff8800' })
  })

  it('sets EVERY color-kind paramSchema field for a parametric def', () => {
    expect(recolorPatch(MULTI_COLOR, '#ff8800')).toEqual({
      seatColor: '#ff8800',
      legColor: '#ff8800',
    })
  })

  it('a single-color parametric def patches just that field', () => {
    expect(recolorPatch(SOFA, '#111')).toEqual({ color: '#111' })
  })

  it('a parametric def with no color field patches nothing', () => {
    const noColor = paramDef([
      { kind: 'number', key: 'width', label: 'W', min: 0, max: 3, step: 0.1, default: 2 },
    ])
    expect(recolorPatch(noColor, '#111')).toEqual({})
  })
})

describe('clearRecolorPatch', () => {
  it('deletes tint for gltf/ikea defs', () => {
    expect(clearRecolorPatch(gltf)).toEqual({ tint: undefined })
  })

  it('resets every color-kind field to ITS OWN schema default for parametric', () => {
    expect(clearRecolorPatch(MULTI_COLOR)).toEqual({
      seatColor: '#7a5c3c',
      legColor: '#4e3a24',
    })
  })
})

describe('currentRecolorValue', () => {
  it('reads props.tint for gltf/ikea, or "" when absent', () => {
    expect(currentRecolorValue({ props: { tint: '#abcabc' } }, gltf)).toBe('#abcabc')
    expect(currentRecolorValue({ props: {} }, gltf)).toBe('')
  })

  it('reads the FIRST color field for parametric, live value winning over default', () => {
    expect(currentRecolorValue({ props: { seatColor: '#222222' } }, MULTI_COLOR)).toBe('#222222')
    expect(currentRecolorValue({ props: {} }, MULTI_COLOR)).toBe('#7a5c3c') // falls back to default
  })

  it("returns '' for a parametric def with no color field", () => {
    const noColor = paramDef([
      { kind: 'number', key: 'width', label: 'W', min: 0, max: 3, step: 0.1, default: 2 },
    ])
    expect(currentRecolorValue({ props: {} }, noColor)).toBe('')
  })
})
