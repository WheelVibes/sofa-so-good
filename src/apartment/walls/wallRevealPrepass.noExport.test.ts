// @vitest-environment happy-dom
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { shouldExcludeFromExport } from '../../export/sceneGltf'
import { syncRevealPrepass } from './wallRevealPrepass'

/**
 * BAKE-TWIN-COLLISION. The depth-prepass twin SHARES its wall's `BufferGeometry`, so both hash to
 * the same lightmap key — and `bake_material.py` names each output file by that key. With the twin
 * in the exported GLB the bake writes the file twice and the twin, whose `colorWrite: false`
 * material has nothing to contribute, bakes an ALL-ZERO map over the wall's real one. Measured on a
 * full bake of the default flat: **24 of 161 output files** were written twice and every one ended
 * up zeroed, all of them walls.
 *
 * So `noExport` on the twin is correctness, not tidiness, and it needs a test — the symptom of
 * losing it is 24 dark walls and nothing failing.
 */
describe('wall-reveal depth-prepass twin', () => {
  const makeWall = () => {
    const wall = new Mesh(new BoxGeometry(1, 2.6, 0.1), new MeshStandardMaterial())
    syncRevealPrepass(wall, true)
    return wall
  }

  it('creates a twin that shares the wall geometry', () => {
    const wall = makeWall()
    const twin = wall.children.find((c) => c.name === 'wall-reveal-depth-prepass') as Mesh
    expect(twin).toBeDefined()
    // Shared geometry is exactly why the keys collide — pin it so the hazard stays visible.
    expect(twin.geometry).toBe(wall.geometry)
  })

  it('tags the twin noExport, so it can never reach the bake', () => {
    const wall = makeWall()
    const twin = wall.children.find((c) => c.name === 'wall-reveal-depth-prepass')
    expect(twin?.userData.noExport).toBe(true)
    expect(shouldExcludeFromExport(twin as never)).toBe(true)
  })

  it('keeps its own marker alongside the export tag', () => {
    const wall = makeWall()
    const twin = wall.children.find((c) => c.name === 'wall-reveal-depth-prepass')
    expect(twin?.userData.wallRevealPrepass).toBe(true)
  })

  it('does NOT exclude the wall itself', () => {
    const wall = makeWall()
    expect(shouldExcludeFromExport(wall as never)).toBe(false)
  })
})
