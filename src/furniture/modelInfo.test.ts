import { describe, expect, it } from 'vitest'
import { formatBytes, modelInfoText } from './modelInfo'
import type { BuiltinGltfDef, ParametricDef, UserGltfDef } from './types'

const fp = { w: 1, d: 1, h: 1 }

describe('formatBytes', () => {
  it('scales B / KB / MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB')
  })
})

describe('modelInfoText', () => {
  it('returns null for a parametric primitive (no download, no licence)', () => {
    const def = {
      id: 'p',
      name: 'Sofa',
      category: 'seating',
      kind: 'parametric',
      primitive: 'Sofa',
      paramSchema: [],
      defaultFootprint: fp,
    } as unknown as ParametricDef
    expect(modelInfoText(def)).toBeNull()
  })

  it('shows size for a user upload', () => {
    const def = {
      id: 'user-1',
      name: 'My chair',
      category: 'seating',
      kind: 'gltf',
      source: 'user',
      assetId: 'a',
      uploadedAt: '',
      defaultFootprint: fp,
      byteSize: 2 * 1024 * 1024,
    } as UserGltfDef
    expect(modelInfoText(def)).toBe('2 MB')
  })

  it('shows licence + attribution for a bundled CC-BY model', () => {
    const def = {
      id: 'b',
      name: 'Pool table',
      category: 'others',
      kind: 'gltf',
      source: 'builtin',
      url: '/x.glb',
      license: 'CC-BY',
      attribution: 'Evol-Love',
      defaultFootprint: fp,
    } as BuiltinGltfDef
    expect(modelInfoText(def)).toBe('CC-BY · Evol-Love')
  })
})
