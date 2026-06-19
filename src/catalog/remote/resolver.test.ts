import { describe, expect, it } from 'vitest'
import { bundleToFurnitureDef, bundleToMaterialDef } from './resolver'
import type { AssetBundle, RemoteEntry } from './types'

const matEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'wood',
  kind: 'material',
  name: 'Wood',
  category: 'floor',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'https://x',
}

const furnEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'chair',
  kind: 'furniture',
  name: 'Chair',
  category: 'seating',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'https://x',
}

describe('resolver', () => {
  it('produces a TexturedMaterialDef from a material bundle', () => {
    const bundle: AssetBundle = {
      kind: 'material',
      channels: { albedo: new Blob(['a']), normal: new Blob(['n']) },
    }
    const def = bundleToMaterialDef(matEntry, '2k', bundle)
    expect(def.kind).toBe('textured')
    expect(def.source).toBe('polyhaven')
    expect(def.runtimeUrls?.albedo).toMatch(/^blob:/)
    expect(def.runtimeUrls?.normal).toMatch(/^blob:/)
  })

  it('produces a RemoteGltfDef from a furniture bundle with rewritten URIs', () => {
    const bundle: AssetBundle = {
      kind: 'furniture',
      gltfJson: {
        buffers: [{ uri: 'scene.bin', byteLength: 1 }],
        images: [{ uri: 'textures/wood.jpg' }],
      },
      bin: new Blob(['b']),
      textures: { 'textures/wood.jpg': new Blob(['t']) },
      rootPath: 'asset.gltf',
    }
    const def = bundleToFurnitureDef(furnEntry, '2k', bundle)
    expect(def.kind).toBe('gltf')
    expect(def.source).toBe('remote')
    expect(def.runtimeUrl).toMatch(/^blob:/)
    expect(def.runtimeAssets['textures/wood.jpg']).toMatch(/^blob:/)
    expect(def.runtimeAssets['scene.bin']).toMatch(/^blob:/)
  })

  it('seeds defaultFootprint from the glTF POSITION accessor bounds (not 1×1×1)', () => {
    const bundle: AssetBundle = {
      kind: 'furniture',
      gltfJson: {
        buffers: [{ uri: 'scene.bin', byteLength: 1 }],
        images: [],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ min: [-0.5, 0, -0.25], max: [0.5, 0.84, 0.25] }],
      },
      bin: new Blob(['b']),
      textures: {},
      rootPath: 'chair.gltf',
    }
    const def = bundleToFurnitureDef(furnEntry, '2k', bundle)
    expect(def.defaultFootprint).toEqual({ w: 1, h: 0.84, d: 0.5 })
    expect(def.defaultFootprint).not.toEqual({ w: 1, d: 1, h: 1 })
  })

  it('falls back to a 1×1×1 footprint when no accessor bounds are available', () => {
    const bundle: AssetBundle = {
      kind: 'furniture',
      gltfJson: { buffers: [{ uri: 'scene.bin', byteLength: 1 }], images: [] },
      bin: new Blob(['b']),
      textures: {},
      rootPath: 'asset.gltf',
    }
    const def = bundleToFurnitureDef(furnEntry, '2k', bundle)
    expect(def.defaultFootprint).toEqual({ w: 1, d: 1, h: 1 })
  })

  it('preserves the provider on furniture defs (does not hardcode polyhaven)', () => {
    const acgFurnEntry: RemoteEntry = {
      provider: 'ambientcg',
      slug: 'wooden-chair',
      kind: 'furniture',
      name: 'Wooden Chair',
      category: 'seating',
      thumbUrl: '',
      resolutions: ['2k'],
      attribution: 'ambientCG',
      sourceUrl: 'https://ambientcg.com/view?id=wooden-chair',
    }
    const bundle: AssetBundle = {
      kind: 'furniture',
      gltfJson: { buffers: [{ uri: 'scene.bin', byteLength: 1 }], images: [] },
      bin: new Blob(['b']),
      textures: {},
      rootPath: 'asset.gltf',
    }
    const def = bundleToFurnitureDef(acgFurnEntry, '2k', bundle)
    expect(def.provider).toBe('ambientcg')
    expect(def.id).toBe('ambientcg:wooden-chair:2k')
  })
})
