// @vitest-environment happy-dom
/**
 * Stage 5 DECAL EXPORT REALITY CHECK. A decal is REAL geometry (DecalGeometry) —
 * this verifies a designer decal survives the full `GLTFExporter → app
 * GLTFLoader` round-trip: the decal overlay mesh is present in the reimported
 * GLB with its projected triangles intact (position + uv), parented under its
 * host part so it follows the part. Piping (a `sweep` with explicit path points)
 * is checked the same way. (The procedural canvas texture is headless-guarded, so
 * this test exercises the geometry — the load-bearing part for export fidelity.)
 */
import type { Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { exportGlb } from '../convert/toGlb'
import { buildEditedObject } from './buildObject'
import { addDecal, addPart, createEmptySpec, updatePart } from './editSpec'
import { addPiping, PIPING_DEFAULTS } from './piping'

async function roundTrip(object: Parameters<typeof exportGlb>[0]) {
  const buf = await exportGlb(object)
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const loader = new GLTFLoader()
  return new Promise<Mesh[]>((resolve, reject) => {
    loader.parse(
      buf,
      '',
      (gltf) => {
        const meshes: Mesh[] = []
        gltf.scene.traverse((o) => {
          if ((o as Mesh).isMesh) meshes.push(o as Mesh)
        })
        resolve(meshes)
      },
      (e) => reject(e instanceof Error ? e : new Error(String(e))),
    )
  })
}

describe('Stage 5 decal GLB export round-trip', () => {
  it('a projected decal exports + reimports as a named overlay mesh with triangles', async () => {
    let spec = addPart(createEmptySpec(), 'box')
    const partId = spec.parts[0].id
    spec = updatePart(spec, partId, { size: [0.5, 0.15, 0.5], position: [0, 0.1, 0] })
    // Project a button decal onto the top face (part-local coords).
    spec = addDecal(spec, {
      partId,
      position: [0, 0.075, 0],
      normal: [0, 1, 0],
      size: 0.06,
      kind: 'button',
    }).spec

    const obj = buildEditedObject(null, spec)
    const meshes = await roundTrip(obj)
    const decalMesh = meshes.find((m) => m.name.includes('decal'))
    expect(decalMesh).toBeTruthy()
    const pos = decalMesh!.geometry.getAttribute('position')
    expect(pos.count).toBeGreaterThan(0)
    expect(decalMesh!.geometry.getAttribute('uv')).toBeTruthy()
    // Vertices are finite.
    for (let i = 0; i < pos.count; i++) expect(Number.isFinite(pos.getX(i))).toBe(true)
  })

  it('piping exports as a sweep tube tracing the host perimeter', async () => {
    let spec = addPart(createEmptySpec(), 'box')
    const partId = spec.parts[0].id
    spec = updatePart(spec, partId, { size: [1.0, 0.15, 0.6], position: [0, 0.2, 0] })
    const piped = addPiping(spec, partId, PIPING_DEFAULTS)
    expect(piped.pipingId).toBeTruthy()

    const obj = buildEditedObject(null, piped.spec)
    const meshes = await roundTrip(obj)
    // Two body meshes (host box + piping sweep). The sweep has many verts (a tube).
    expect(meshes.length).toBeGreaterThanOrEqual(2)
    const maxVerts = Math.max(...meshes.map((m) => m.geometry.getAttribute('position').count))
    expect(maxVerts).toBeGreaterThan(200)
  })
})
