import { describe, expect, it } from 'vitest'
import { appearanceKeys, extractAppearance, mergeAppearance } from './appearanceProps'
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
    const gltf = { kind: 'gltf', id: 'x', name: 'x', category: 'seating' } as unknown as FurnitureDef
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
