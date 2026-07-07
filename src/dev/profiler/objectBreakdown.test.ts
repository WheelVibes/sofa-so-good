import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { buildObjectBreakdown } from './objectBreakdown'

/** A furniture item root (userData.itemId) with `meshCount` boxes under it. */
function itemGroup(id: string, meshCount: number, sharedMat = true): Group {
  const g = new Group()
  g.userData.itemId = id
  const mat = new MeshBasicMaterial()
  for (let i = 0; i < meshCount; i++) {
    // Box = 12 triangles (index-less BoxGeometry has 36 position verts → 12 tris).
    g.add(new Mesh(new BoxGeometry(1, 1, 1), sharedMat ? mat : new MeshBasicMaterial()))
  }
  return g
}

describe('buildObjectBreakdown', () => {
  it('groups meshes by ancestor itemId and sums triangles + mesh count', () => {
    const root = new Object3D()
    root.add(itemGroup('a', 2)) // 24 tris, 2 meshes
    root.add(itemGroup('b', 1)) // 12 tris, 1 mesh
    const out = buildObjectBreakdown(root, (id) => `name-${id}`)
    expect(out.map((o) => o.itemId)).toEqual(['a', 'b']) // sorted desc by triangles
    expect(out[0]).toMatchObject({ itemId: 'a', name: 'name-a', triangles: 24, meshes: 2 })
    expect(out[1]).toMatchObject({ itemId: 'b', triangles: 12, meshes: 1 })
  })

  it('counts distinct materials per item (shared material counts once)', () => {
    const root = new Object3D()
    root.add(itemGroup('shared', 3, true))
    root.add(itemGroup('distinct', 3, false))
    const byId = Object.fromEntries(
      buildObjectBreakdown(root, (id) => id).map((o) => [o.itemId, o]),
    )
    expect(byId.shared.materials).toBe(1)
    expect(byId.distinct.materials).toBe(3)
  })

  it('ignores meshes with no itemId ancestor', () => {
    const root = new Object3D()
    root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial())) // orphan, no itemId
    root.add(itemGroup('a', 1))
    const out = buildObjectBreakdown(root, (id) => id)
    expect(out).toHaveLength(1)
    expect(out[0].itemId).toBe('a')
  })
})
