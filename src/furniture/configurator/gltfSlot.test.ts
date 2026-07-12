import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it, vi } from 'vitest'

// Mock the loader stack so the parse-cache test is hermetic (no real GLTFLoader,
// no drei pulled in via `gltf/decoders`, no network). The pure helpers below are
// unaffected — they touch none of these.
const { loadAsyncSpy } = vi.hoisted(() => ({ loadAsyncSpy: vi.fn() }))
vi.mock('../gltf/decoders', () => ({ DRACO_DECODER_PATH: '/draco/' }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setDRACOLoader() {}
    setMeshoptDecoder() {}
    loadAsync = loadAsyncSpy
  },
}))
vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    setDecoderPath() {}
  },
}))
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }))

import {
  fitScaleToFootprint,
  loadSlotGltfScene,
  namespaceFinishKey,
  namespaceGltfFinishTargets,
} from './gltfSlot'

describe('namespaceFinishKey (SLOT-203)', () => {
  it('prefixes a discovered key with the slot namespace', () => {
    expect(namespaceFinishKey('lamp', 'shade')).toBe('lamp::shade')
    expect(namespaceFinishKey('base', 'desk_lamp_arm_01')).toBe('base::desk_lamp_arm_01')
  })

  it('keeps two slots loading the same GLB from colliding', () => {
    expect(namespaceFinishKey('leftLamp', 'shade')).not.toBe(
      namespaceFinishKey('rightLamp', 'shade'),
    )
  })
})

describe('fitScaleToFootprint (SLOT-203)', () => {
  it('returns ~1 when the loaded height already matches the footprint', () => {
    expect(fitScaleToFootprint([0.2, 0.9, 0.6], { w: 0.2, d: 0.6, h: 0.9 })).toBeCloseTo(1, 6)
  })

  it('scales uniformly to match a taller/shorter declared height', () => {
    expect(fitScaleToFootprint([0.2, 0.5, 0.6], { w: 0.2, d: 0.6, h: 1.0 })).toBeCloseTo(2, 6)
    expect(fitScaleToFootprint([0.2, 2.0, 0.6], { w: 0.2, d: 0.6, h: 1.0 })).toBeCloseTo(0.5, 6)
  })

  it('falls back to 1 for degenerate inputs (never distorts to 0/∞)', () => {
    expect(fitScaleToFootprint([0.2, 0, 0.6], { w: 0.2, d: 0.6, h: 0.9 })).toBe(1)
    expect(fitScaleToFootprint([0.2, 0.9, 0.6], { w: 0.2, d: 0.6, h: 0 })).toBe(1)
  })
})

describe('namespaceGltfFinishTargets (SLOT-203)', () => {
  function mesh(name: string, matName: string, mat?: MeshStandardMaterial): Mesh {
    const material = mat ?? new MeshStandardMaterial()
    if (!mat) material.name = matName
    const m = new Mesh(new BoxGeometry(1, 1, 1), material)
    m.name = name
    return m
  }

  it('renames each material group under the slot prefix and returns its targets', () => {
    const root = new Group()
    root.add(mesh('Body', 'desk_lamp_arm_01'))
    root.add(mesh('Bulb', 'desk_lamp_arm_01_light'))
    const targets = namespaceGltfFinishTargets(root, 'lamp')
    expect(targets.map((t) => t.key).sort()).toEqual([
      'lamp::desk_lamp_arm_01',
      'lamp::desk_lamp_arm_01_light',
    ])
    // Materials are actually renamed so listFinishTargets/finish overrides match.
    const names = new Set<string>()
    root.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) names.add((m.material as MeshStandardMaterial).name)
    })
    expect(names).toEqual(new Set(['lamp::desk_lamp_arm_01', 'lamp::desk_lamp_arm_01_light']))
  })

  it('does NOT double-namespace a material shared across meshes', () => {
    const shared = new MeshStandardMaterial()
    shared.name = 'metal'
    const root = new Group()
    root.add(mesh('A', 'metal', shared))
    root.add(mesh('B', 'metal', shared))
    const targets = namespaceGltfFinishTargets(root, 'lamp')
    expect(targets).toHaveLength(1)
    expect(targets[0]!.key).toBe('lamp::metal')
    expect(shared.name).toBe('lamp::metal') // renamed once, not 'lamp::lamp::metal'
  })

  it('falls back to the mesh name when a material is unnamed', () => {
    const root = new Group()
    const unnamed = new MeshStandardMaterial() // name === ''
    root.add(mesh('Shade', '', unnamed))
    const targets = namespaceGltfFinishTargets(root, 'lamp')
    expect(targets[0]!.key).toBe('lamp::Shade')
  })

  it('humanises the label', () => {
    const root = new Group()
    root.add(mesh('Body', 'desk_lamp_arm_01'))
    const [t] = namespaceGltfFinishTargets(root, 'lamp')
    expect(t!.label).toBe('Lamp desk lamp arm 01')
  })
})

describe('loadSlotGltfScene — parse cache + per-attach material clone (SLOT-203)', () => {
  it('parses a url ONCE across repeated attaches, returning independent clones', async () => {
    const template = new Group()
    const mat = new MeshStandardMaterial()
    mat.name = 'shade'
    template.add(new Mesh(new BoxGeometry(1, 1, 1), mat))
    loadAsyncSpy.mockResolvedValue({ scene: template })

    const a = await loadSlotGltfScene('/assets/furniture/cache-me.glb')
    const b = await loadSlotGltfScene('/assets/furniture/cache-me.glb')

    // The expensive parse ran once; the second attach reused the cached scene.
    expect(loadAsyncSpy).toHaveBeenCalledTimes(1)
    expect(a).not.toBe(b) // independent clones

    // Per-attach material instances: renaming one (as namespaceGltfFinishTargets
    // does) must not leak onto the other instance or the cached template.
    const matA = (a.children[0] as Mesh).material as MeshStandardMaterial
    const matB = (b.children[0] as Mesh).material as MeshStandardMaterial
    expect(matA).not.toBe(matB)
    expect(matA).not.toBe(mat)
    matA.name = 'lamp::shade'
    expect(matB.name).toBe('shade')
    expect(mat.name).toBe('shade')
  })
})
