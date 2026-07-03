// @vitest-environment happy-dom
/**
 * End-to-end verification of the worker-export pipeline WITHOUT a real
 * Worker: build a scene → prune it (`buildExportRoot`) → marshal
 * (`marshalSceneForWorker`) → `structuredClone` (simulates the `postMessage`
 * boundary a real Worker would cross) → reconstruct
 * (`reconstructSceneFromMarshal`, exactly what `exportWorker.worker.ts` runs)
 * → export via the SAME `exportGlb` the small-scene path uses → parse the
 * resulting GLB back with `GLTFLoader` to prove it's a genuinely valid,
 * loadable file, not just bytes with the right magic header.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { exportGlb } from '../furniture/convert/toGlb'
import { buildExportRoot, noExportUserData } from './sceneGltf'
import { marshalSceneForWorker, reconstructSceneFromMarshal } from './sceneMarshal'

function furnitureMesh(name: string, x: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: '#8899aa' }),
  )
  mesh.name = name
  mesh.position.set(x, 0, 0)
  return mesh
}

function parseGlb(buffer: ArrayBuffer): Promise<{ scene: THREE.Group }> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf as { scene: THREE.Group }), reject)
  })
}

describe('worker export pipeline (no real Worker — simulated via structuredClone)', () => {
  it('produces a valid, loadable GLB that excludes noExport-tagged helpers', async () => {
    const scene = new THREE.Scene()
    scene.name = 'home'
    scene.add(furnitureMesh('sofa', 0), furnitureMesh('table', 1), furnitureMesh('chair', 2))

    const gizmo = new THREE.Group()
    gizmo.name = 'rotate-gizmo'
    gizmo.userData = noExportUserData()
    gizmo.add(furnitureMesh('gizmo-ring', 3))
    scene.add(gizmo)

    // 1. Prune (identical to both the small- and large-scene paths).
    const exportRoot = buildExportRoot(scene)

    // 2. Marshal on the "main thread".
    const { json } = marshalSceneForWorker(exportRoot)

    // 3. Simulate crossing to the Worker via postMessage's structured clone.
    const onTheWire = structuredClone(json)

    // 4. Reconstruct on the "worker thread" (exactly `exportWorker.worker.ts`).
    const reconstructed = await reconstructSceneFromMarshal(onTheWire)
    reconstructed.updateMatrixWorld(true)

    // 5. Export using the SAME function the small-scene path calls.
    const buffer = await exportGlb(reconstructed)
    const head = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)))
    expect(head).toBe('glTF')

    // 6. Prove it's a real, loadable GLB — not just bytes with the right header.
    const gltf = await parseGlb(buffer)
    const names = new Set<string>()
    let meshCount = 0
    gltf.scene.traverse((o) => {
      names.add(o.name)
      if ((o as THREE.Mesh).isMesh) meshCount++
    })
    expect(names.has('sofa')).toBe(true)
    expect(names.has('table')).toBe(true)
    expect(names.has('chair')).toBe(true)
    expect(names.has('rotate-gizmo')).toBe(false)
    expect(names.has('gizmo-ring')).toBe(false)
    expect(meshCount).toBe(3)
  })
})
