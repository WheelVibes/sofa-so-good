import type { Group, Mesh } from 'three'
import { describe, expect, it, vi } from 'vitest'

// getSurfaceMaterial builds a CanvasTexture (needs a real 2D context) — stub it
// so the object builder runs headless. This test asserts the SLOT-203 GLB
// reparent/namespace/dispose wiring, not procedural pixels.
vi.mock('../../materials/furnitureMaterials', () => ({
  getSurfaceMaterial: () => ({
    clone() {
      return { name: '', dispose() {} }
    },
  }),
}))
// Mock only the loader — return a tiny real three Group so the reparent/fit/
// namespace path runs offline + deterministically.
const { loadSpy } = vi.hoisted(() => ({ loadSpy: vi.fn() }))
vi.mock('./gltfSlot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gltfSlot')>()
  return { ...actual, loadSlotGltfScene: loadSpy }
})

import {
  buildConfiguredObject,
  buildConfiguredPreview,
  disposeConfiguredObject,
} from './buildObject'
import { getConfigurableProduct } from './products'

const mattress = getConfigurableProduct('mattress-frame')!

async function freshLampScene(): Promise<Group> {
  const { Group, Mesh, BoxGeometry, MeshStandardMaterial } = await import('three')
  const g = new Group()
  const mat = new MeshStandardMaterial()
  mat.name = 'desk_lamp_arm_01'
  g.add(new Mesh(new BoxGeometry(0.2, 0.9, 0.6), mat))
  return g
}

describe('buildConfiguredObject — GLB sub-asset option (SLOT-203)', () => {
  it('reparents the GLB at the slot anchor and namespaces its finish targets', async () => {
    loadSpy.mockImplementation(freshLampScene)
    const { object, finishTargets } = await buildConfiguredObject(mattress, {
      productId: 'mattress-frame',
      selections: {},
    })

    // The lamp GLB is loaded once, from the option's bundled url.
    expect(loadSpy).toHaveBeenCalledWith('/assets/furniture/desk-lamp-arm.glb')

    // A holder group carries the reparented scene at the slot anchor.
    const holder = object.children.find((c) => c.userData['__configuratorGltf'] === true)
    expect(holder).toBeDefined()
    expect(holder!.position.x).toBeCloseTo(-0.95, 6)
    expect(holder!.position.z).toBeCloseTo(-0.72, 6)
    expect(holder!.rotation.y).toBeCloseTo(Math.PI / 2, 6)

    // Its finish targets are namespaced under the slot id, joined with procedural.
    const keys = finishTargets.map((t) => t.key)
    expect(keys).toContain('lamp::desk_lamp_arm_01')
    expect(keys).toContain('base:frame') // procedural targets still present

    // Disposal frees the GLB subtree cleanly (owned textures/materials).
    expect(() => disposeConfiguredObject(object)).not.toThrow()
  })

  it('is fail-soft: a GLB that fails to load is skipped, not fatal', async () => {
    loadSpy.mockRejectedValue(new Error('offline'))
    const { object, finishTargets } = await buildConfiguredObject(mattress, {
      productId: 'mattress-frame',
      selections: {},
    })
    // No holder was added; procedural parts + targets still built.
    expect(object.children.some((c) => c.userData['__configuratorGltf'])).toBe(false)
    expect(finishTargets.some((t) => t.key.startsWith('lamp::'))).toBe(false)
    expect(finishTargets.some((t) => t.key === 'base:frame')).toBe(true)
    // Procedural box meshes are present.
    expect(object.children.some((c) => (c as Mesh).isMesh)).toBe(true)
  })

  it('omitting the lamp (optional slot → null) adds no GLB piece', async () => {
    loadSpy.mockImplementation(freshLampScene)
    const { object } = await buildConfiguredObject(mattress, {
      productId: 'mattress-frame',
      selections: { lamp: null },
    })
    expect(object.children.some((c) => c.userData['__configuratorGltf'])).toBe(false)
  })
})

describe('buildConfiguredPreview — non-blocking body (SLOT-203)', () => {
  it('returns the procedural body synchronously; the GLB attaches when ready', async () => {
    let resolveLoad: ((g: Awaited<ReturnType<typeof freshLampScene>>) => void) | null = null
    loadSpy.mockImplementation(
      () =>
        new Promise((res) => {
          resolveLoad = res
        }),
    )
    const { object, ready } = buildConfiguredPreview(mattress, {
      productId: 'mattress-frame',
      selections: {},
    })
    // Body is present immediately (procedural boxes), lamp not yet attached.
    expect(object.children.some((c) => (c as Mesh).isMesh)).toBe(true)
    expect(object.children.some((c) => c.userData['__configuratorGltf'])).toBe(false)

    // Resolve the (previously pending) GLB load → it attaches, ready settles.
    resolveLoad!(await freshLampScene())
    await ready
    expect(object.children.some((c) => c.userData['__configuratorGltf'])).toBe(true)
    disposeConfiguredObject(object)
  })

  it('a slow/failed GLB never blanks the procedural body', async () => {
    loadSpy.mockRejectedValue(new Error('offline'))
    const { object, ready } = buildConfiguredPreview(mattress, {
      productId: 'mattress-frame',
      selections: {},
    })
    expect(object.children.some((c) => (c as Mesh).isMesh)).toBe(true)
    await ready // resolves even though the load rejected (fail-soft)
    expect(object.children.some((c) => c.userData['__configuratorGltf'])).toBe(false)
  })
})
