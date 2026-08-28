import { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { buildExportRoot, noExportUserData, shouldExcludeFromExport } from './sceneGltf'

/**
 * EXPORT-HELPERS — `buildExportRoot` prunes by TAG and TYPE, never by appearance.
 *
 * That is the whole reason render-only helpers must tag themselves: `colorWrite: false`
 * is a WebGL renderer state with NO glTF equivalent, so an invisible mesh exports as
 * solid geometry. The virtual ceiling (`CeilingOccluder`) and the fake grounding blobs
 * (`ContactShadow`) were both shipping into exports until they were tagged — 10 and 51
 * meshes respectively on the default flat.
 */
function invisibleHelper(tagged: boolean): Mesh {
  const m = new Mesh(
    new PlaneGeometry(1, 1),
    // The occluder's exact signature: invisible to the camera, still a real mesh.
    new MeshBasicMaterial({ colorWrite: false, opacity: 0, transparent: true }),
  )
  if (tagged) m.userData = noExportUserData()
  return m
}

describe('export helper pruning (EXPORT-HELPERS)', () => {
  it('does NOT prune an invisible mesh on appearance alone', () => {
    // The trap: colorWrite/opacity say "never show me", and the exporter cannot hear it.
    expect(shouldExcludeFromExport(invisibleHelper(false))).toBe(false)
  })

  it('prunes it once tagged', () => {
    expect(shouldExcludeFromExport(invisibleHelper(true))).toBe(true)
  })

  it('drops a tagged helper from a built export root but keeps real geometry', () => {
    const root = new Object3D()
    const home = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial())
    root.add(home, invisibleHelper(true))
    const out = buildExportRoot(root)
    const meshes: Mesh[] = []
    out.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh)
    })
    expect(meshes).toHaveLength(1)
    expect(meshes[0].material).not.toHaveProperty('colorWrite', false)
  })

  it('a tag on a parent group takes the whole subtree', () => {
    // CeilingOccluder tags its <group>, not each plane.
    const group = new Object3D()
    group.userData = noExportUserData()
    const child = invisibleHelper(false)
    group.add(child)
    expect(shouldExcludeFromExport(child)).toBe(true)
  })
})
