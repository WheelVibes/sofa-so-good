// @vitest-environment happy-dom
/**
 * Stage 2 EXPORT REALITY CHECK. Empirically verifies which `MeshPhysicalMaterial`
 * finishing features three r184's `GLTFExporter` writes AND the app's own
 * `GLTFLoader` restores on reimport — a full round-trip (export a material with
 * each feature → parse the GLB → assert the property survives). The support
 * matrix these tests lock in is recorded in `docs/asset-studio-plan.md` (Stage 2).
 *
 * Result (all survive → nothing is preview-only in the SPEC/EXPORT sense):
 *   sheen / sheenColor / sheenRoughness ...... KHR_materials_sheen ......... ✅
 *   clearcoat / clearcoatRoughness ........... KHR_materials_clearcoat ...... ✅
 *   transmission ............................. KHR_materials_transmission ... ✅
 *   ior ...................................... KHR_materials_ior ............ ✅
 *   thickness ................................ KHR_materials_volume ......... ✅
 *   anisotropy / anisotropyRotation .......... KHR_materials_anisotropy ..... ✅
 *   gradient (COLOR_0 + vertexColors) ........ core glTF .................... ✅
 *
 * (Transmission is the only one with a RENDER caveat — its transmissive pass
 * needs a real GPU, so the in-editor preview reads flat on the low tiers. That is
 * a preview limitation, not an export one; the exported GLB is always correct.)
 */
import { BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshPhysicalMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { exportGlb } from '../convert/toGlb'

async function roundTripMaterial(
  mut: (m: MeshPhysicalMaterial) => void,
): Promise<MeshPhysicalMaterial> {
  const mat = new MeshPhysicalMaterial({ color: '#aabbcc' })
  mut(mat)
  const group = new Group()
  group.add(new Mesh(new BoxGeometry(1, 1, 1), mat))
  const buf = await exportGlb(group)
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.parse(
      buf,
      '',
      (gltf) => {
        let found: MeshPhysicalMaterial | null = null
        gltf.scene.traverse((o) => {
          if ((o as Mesh).isMesh) found = (o as Mesh).material as MeshPhysicalMaterial
        })
        found ? resolve(found) : reject(new Error('no mesh in parsed GLB'))
      },
      (e) => reject(e instanceof Error ? e : new Error(String(e))),
    )
  })
}

describe('Stage 2 physical material GLB export round-trip', () => {
  it('KHR_materials_sheen — sheen + sheenColor + sheenRoughness survive', async () => {
    const r = await roundTripMaterial((m) => {
      m.sheen = 1
      m.sheenRoughness = 0.4
      m.sheenColor.set('#8899ff')
    })
    expect(r.sheen).toBeCloseTo(1, 4)
    expect(r.sheenRoughness).toBeCloseTo(0.4, 4)
    expect(r.sheenColor.getHexString()).toBe('8899ff')
  })

  it('KHR_materials_clearcoat — clearcoat + clearcoatRoughness survive', async () => {
    const r = await roundTripMaterial((m) => {
      m.clearcoat = 0.9
      m.clearcoatRoughness = 0.1
    })
    expect(r.clearcoat).toBeCloseTo(0.9, 4)
    expect(r.clearcoatRoughness).toBeCloseTo(0.1, 4)
  })

  it('KHR_materials_transmission/ior/volume — transmission + ior + thickness survive', async () => {
    const r = await roundTripMaterial((m) => {
      m.transmission = 0.9
      m.ior = 1.5
      m.thickness = 0.3
    })
    expect(r.transmission).toBeCloseTo(0.9, 4)
    expect(r.ior).toBeCloseTo(1.5, 4)
    expect(r.thickness).toBeCloseTo(0.3, 4)
  })

  it('KHR_materials_anisotropy — anisotropy + anisotropyRotation survive', async () => {
    const r = await roundTripMaterial((m) => {
      m.anisotropy = 0.8
      m.anisotropyRotation = 1.2
    })
    expect(r.anisotropy).toBeCloseTo(0.8, 4)
    expect(r.anisotropyRotation).toBeCloseTo(1.2, 3)
  })

  it('gradient — COLOR_0 vertex attribute + vertexColors flag survive', async () => {
    const geo = new BoxGeometry(1, 1, 1)
    const n = geo.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) colors[i * 3] = 1 // red
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const group = new Group()
    group.add(new Mesh(geo, new MeshPhysicalMaterial({ vertexColors: true })))
    const buf = await exportGlb(group)
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const loader = new GLTFLoader()
    await new Promise<void>((resolve, reject) => {
      loader.parse(
        buf,
        '',
        (gltf) => {
          let hasColor = false
          let vc = false
          gltf.scene.traverse((o) => {
            const mesh = o as Mesh
            if (mesh.isMesh) {
              hasColor = !!mesh.geometry.getAttribute('color')
              vc = (mesh.material as MeshPhysicalMaterial).vertexColors
            }
          })
          expect(hasColor).toBe(true)
          expect(vc).toBe(true)
          resolve()
        },
        (e) => reject(e),
      )
    })
  })
})
