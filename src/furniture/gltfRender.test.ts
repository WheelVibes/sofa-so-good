import { describe, expect, it } from 'vitest'
import { selectGltfRender } from './gltfRender'
import type { FurnitureItem, GltfDef } from './types'

// Minimal builtin GLB def + item for testing the per-part finish-override merge.
function builtinDef(extra: Partial<GltfDef> = {}): GltfDef {
  return {
    id: 'd1',
    kind: 'gltf',
    source: 'builtin',
    name: 'Test',
    category: 'misc',
    url: '/m/test.glb',
    defaultFootprint: { w: 1, d: 1, h: 1 },
    ...extra,
  } as GltfDef
}

function item(props: Record<string, unknown>): FurnitureItem {
  return {
    id: 'i1',
    defId: 'd1',
    position: [0, 0],
    rotation: 0,
    props,
  } as unknown as FurnitureItem
}

describe('selectGltfRender — per-part finish overrides', () => {
  it('applies inspector-typed finish:<material> overrides to a built-in GLB', () => {
    const r = selectGltfRender(
      item({ 'finish:Seat': '#ff0000', 'finish:Legs': '#222222' }),
      builtinDef(),
    )
    expect(r?.finishOverrides).toEqual({ Seat: '#ff0000', Legs: '#222222' })
  })

  it('drops blank overrides (a cleared swatch must not paint the part black)', () => {
    const r = selectGltfRender(item({ 'finish:Seat': '', 'finish:Legs': '#222222' }), builtinDef())
    expect(r?.finishOverrides).toEqual({ Legs: '#222222' })
  })

  it('returns no overrides object when nothing is set', () => {
    const r = selectGltfRender(item({}), builtinDef())
    expect(r?.finishOverrides).toBeUndefined()
  })

  it('merges def-level finishOverrides with per-item picks (item wins)', () => {
    const def = builtinDef({
      finishOverrides: { Seat: '#000000', Frame: '#888888' },
    } as Partial<GltfDef>)
    const r = selectGltfRender(item({ 'finish:Seat': '#ff0000' }), def)
    expect(r?.finishOverrides).toEqual({ Seat: '#ff0000', Frame: '#888888' })
  })
})
