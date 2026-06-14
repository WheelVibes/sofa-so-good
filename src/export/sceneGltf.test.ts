import { Group, Mesh, PerspectiveCamera, PointLight } from 'three'
import { describe, expect, it } from 'vitest'
import {
  buildExportRoot,
  markNoExport,
  noExportUserData,
  shouldExcludeFromExport,
} from './sceneGltf'

/** Faked Object3D-shaped node for the pure ancestor-walk predicate. */
interface FakeNode {
  type: string
  userData: Record<string, unknown>
  parent: FakeNode | null
}
function node(
  type: string,
  userData: Record<string, unknown> = {},
  parent: FakeNode | null = null,
): FakeNode {
  return { type, userData, parent }
}

describe('shouldExcludeFromExport', () => {
  it('keeps plain geometry (untagged mesh)', () => {
    expect(shouldExcludeFromExport(node('Mesh'))).toBe(false)
    expect(shouldExcludeFromExport(node('Group', { itemId: 'sofa-1' }))).toBe(false)
  })

  it('drops an object carrying the noExport tag', () => {
    expect(shouldExcludeFromExport(node('Group', noExportUserData()))).toBe(true)
  })

  it('drops a child whose ancestor is tagged noExport (subtree exclusion)', () => {
    const gizmo = node('Group', noExportUserData())
    const ring = node('Mesh', {}, gizmo)
    expect(shouldExcludeFromExport(ring)).toBe(true)
  })

  it('drops known helper types and any camera even when untagged', () => {
    expect(shouldExcludeFromExport(node('GridHelper'))).toBe(true)
    expect(shouldExcludeFromExport(node('Sprite'))).toBe(true)
    expect(shouldExcludeFromExport(node('PerspectiveCamera'))).toBe(true)
    expect(shouldExcludeFromExport(node('OrthographicCamera'))).toBe(true)
  })

  it('handles null/undefined safely', () => {
    expect(shouldExcludeFromExport(null)).toBe(false)
    expect(shouldExcludeFromExport(undefined)).toBe(false)
  })
})

describe('markNoExport', () => {
  it('tags an object so shouldExcludeFromExport reports it', () => {
    const o = node('Group')
    markNoExport(o as never)
    expect(shouldExcludeFromExport(o)).toBe(true)
  })
})

describe('buildExportRoot', () => {
  it('keeps home geometry + lights and drops helpers, returning a detached clone', () => {
    const scene = new Group()
    scene.name = 'scene'

    const wall = new Mesh()
    wall.name = 'wall'
    const furniture = new Group()
    furniture.name = 'sofa'
    furniture.userData.itemId = 'sofa-1'
    const light = new PointLight()
    light.name = 'lamp'

    const gizmo = new Group()
    gizmo.name = 'gizmo'
    gizmo.userData = noExportUserData()
    const gizmoRing = new Mesh() // child of an excluded subtree
    gizmo.add(gizmoRing)

    const grid = new Group()
    // simulate an untagged helper via type
    Object.defineProperty(grid, 'type', { value: 'GridHelper' })

    const cam = new PerspectiveCamera()

    scene.add(wall, furniture, light, gizmo, grid, cam)

    const root = buildExportRoot(scene)
    const names = new Set<string>()
    const types = new Set<string>()
    root.traverse((o) => {
      names.add(o.name)
      types.add(o.type)
    })

    expect(names.has('wall')).toBe(true)
    expect(names.has('sofa')).toBe(true)
    expect(names.has('lamp')).toBe(true)
    expect(names.has('gizmo')).toBe(false)
    expect(types.has('GridHelper')).toBe(false)
    expect(types.has('PerspectiveCamera')).toBe(false)

    // The original scene is untouched (export works on a clone).
    expect(scene.children.length).toBe(6)
  })
})
