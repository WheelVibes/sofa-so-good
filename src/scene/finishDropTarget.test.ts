import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import {
  classifyFinishDropObject,
  findFinishDropTarget,
  finishSurfaceUserData,
} from './finishDropTarget'

/** Build a parent→child chain, returning the deepest node. */
function chain(...nodes: Object3D[]): Object3D {
  for (let i = 1; i < nodes.length; i++) nodes[i - 1].add(nodes[i])
  return nodes[nodes.length - 1]
}

function tagged(userData: Record<string, unknown>): Object3D {
  const o = new Object3D()
  o.userData = userData
  return o
}

describe('classifyFinishDropObject', () => {
  it('classifies a mesh inside a furniture item group via the itemId tag', () => {
    const leaf = chain(tagged({ itemId: 'sofa-1' }), new Object3D(), new Object3D())
    expect(classifyFinishDropObject(leaf)).toEqual({ kind: 'item', itemId: 'sofa-1' })
  })

  it('classifies floor and wall meshes via the finishTarget tag', () => {
    expect(classifyFinishDropObject(tagged(finishSurfaceUserData('floor', 'living')))).toEqual({
      kind: 'floor',
      roomId: 'living',
    })
    const wallLeaf = chain(tagged(finishSurfaceUserData('wall', 'bedroom2')), new Object3D())
    expect(classifyFinishDropObject(wallLeaf)).toEqual({ kind: 'wall', roomId: 'bedroom2' })
  })

  it('prefers the nearest tagged ancestor (item inside a tagged room subtree)', () => {
    const leaf = chain(
      tagged(finishSurfaceUserData('floor', 'living')),
      tagged({ itemId: 'lamp-9' }),
      new Object3D(),
    )
    expect(classifyFinishDropObject(leaf)).toEqual({ kind: 'item', itemId: 'lamp-9' })
  })

  it('returns null for untagged hierarchies and malformed tags', () => {
    expect(classifyFinishDropObject(chain(new Object3D(), new Object3D()))).toBeNull()
    expect(classifyFinishDropObject(null)).toBeNull()
    expect(classifyFinishDropObject(tagged({ itemId: 42 }))).toBeNull()
    expect(classifyFinishDropObject(tagged({ itemId: '' }))).toBeNull()
    expect(
      classifyFinishDropObject(tagged({ finishTarget: { kind: 'roof', roomId: 'x' } })),
    ).toBeNull()
    expect(
      classifyFinishDropObject(tagged({ finishTarget: { kind: 'floor', roomId: '' } })),
    ).toBeNull()
    expect(classifyFinishDropObject(tagged({ finishTarget: 'floor' }))).toBeNull()
  })
})

describe('findFinishDropTarget', () => {
  it('returns the first classifiable hit, skipping untagged hits (grid/ghost/ground)', () => {
    const grid = new Object3D()
    const floor = tagged(finishSurfaceUserData('floor', 'kitchen'))
    expect(findFinishDropTarget([{ object: grid }, { object: floor }])).toEqual({
      kind: 'floor',
      roomId: 'kitchen',
    })
  })

  it('skips invisible hits (camera-facing wall reveal) and their subtrees', () => {
    const hiddenWall = tagged(finishSurfaceUserData('wall', 'living'))
    hiddenWall.visible = false
    const hiddenChild = chain(hiddenWall, new Object3D())
    const floor = tagged(finishSurfaceUserData('floor', 'living'))
    expect(
      findFinishDropTarget([{ object: hiddenWall }, { object: hiddenChild }, { object: floor }]),
    ).toEqual({ kind: 'floor', roomId: 'living' })
  })

  it('returns null when nothing under the cursor is finishable (empty sky)', () => {
    expect(findFinishDropTarget([])).toBeNull()
    expect(findFinishDropTarget([{ object: new Object3D() }])).toBeNull()
  })

  it('classifies a furniture hit ahead of the floor behind it', () => {
    const item = chain(tagged({ itemId: 'bed-3' }), new Object3D())
    const floor = tagged(finishSurfaceUserData('floor', 'mainBedroom'))
    expect(findFinishDropTarget([{ object: item }, { object: floor }])).toEqual({
      kind: 'item',
      itemId: 'bed-3',
    })
  })
})
