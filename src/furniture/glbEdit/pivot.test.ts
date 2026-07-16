import { Euler, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  groupRotatePivotPosition,
  pivotOffset,
  rotatePivotPosition,
  scalePivotPosition,
} from './pivot'

const DEG = Math.PI / 180

/** World position of a local offset given a centre + Euler-deg rotation. */
function worldOf(
  center: readonly [number, number, number],
  offset: readonly [number, number, number],
  rotDeg: readonly [number, number, number] = [0, 0, 0],
): Vector3 {
  return new Vector3(offset[0], offset[1], offset[2])
    .applyEuler(new Euler(rotDeg[0] * DEG, rotDeg[1] * DEG, rotDeg[2] * DEG, 'XYZ'))
    .add(new Vector3(center[0], center[1], center[2]))
}

describe('pivotOffset', () => {
  it('centre is the origin', () => {
    expect(pivotOffset('center', [1, 2, 3])).toEqual([0, 0, 0])
  })
  it('base is the bottom-face centre (−Y half)', () => {
    expect(pivotOffset('base', [1, 2, 3])).toEqual([0, -1, 0])
  })
  it('corner is the −X −Y −Z corner', () => {
    expect(pivotOffset('corner', [1, 2, 3])).toEqual([-0.5, -1, -1.5])
  })
})

describe('rotatePivotPosition', () => {
  it('centre pivot is the identity (byte-identical to today)', () => {
    const pos: [number, number, number] = [0.3, 0.5, -0.2]
    expect(rotatePivotPosition(pos, [1, 1, 1], undefined, [0, 45, 0], 'center')).toEqual(pos)
    expect(rotatePivotPosition(pos, [1, 1, 1], [0, 10, 0], [0, 45, 0], 'center')).toEqual(pos)
  })

  it('rotate about base keeps the bottom-face centre fixed in world space', () => {
    // Box sitting on the floor: size 0.2×1×0.2, centre y = 0.5 → minY 0.
    const size: [number, number, number] = [0.2, 1, 0.2]
    const pos: [number, number, number] = [0, 0.5, 0]
    const before = worldOf(pos, pivotOffset('base', size)) // the base point
    const newPos = rotatePivotPosition(pos, size, undefined, [0, 0, 90], 'base')
    const after = worldOf(newPos, pivotOffset('base', size), [0, 0, 90])
    expect(after.x).toBeCloseTo(before.x, 5)
    expect(after.y).toBeCloseTo(before.y, 5)
    expect(after.z).toBeCloseTo(before.z, 5)
  })

  it('rotate about base by a Y-yaw keeps minY unchanged (part stays on the floor)', () => {
    const size: [number, number, number] = [0.6, 0.4, 0.6]
    const pos: [number, number, number] = [0, 0.2, 0] // minY = 0
    const newPos = rotatePivotPosition(pos, size, undefined, [0, 45, 0], 'base')
    // A Y rotation is invariant along the Y pivot axis → position (hence minY) is
    // unchanged.
    expect(newPos[1]).toBeCloseTo(0.2, 6)
    expect(newPos[1] - size[1] / 2).toBeCloseTo(0, 6)
  })

  it('base pivot moves the centre for a horizontal-axis rotation (unlike centre)', () => {
    const size: [number, number, number] = [0.2, 1, 0.2]
    const pos: [number, number, number] = [0, 0.5, 0]
    const base = rotatePivotPosition(pos, size, undefined, [0, 0, 90], 'base')
    const centre = rotatePivotPosition(pos, size, undefined, [0, 0, 90], 'center')
    expect(base).not.toEqual(centre)
  })
})

describe('scalePivotPosition', () => {
  it('centre pivot is the identity', () => {
    const pos: [number, number, number] = [0.2, 0.5, 0]
    expect(scalePivotPosition(pos, [1, 1, 1], [1, 2, 1], undefined, 'center')).toEqual(pos)
  })

  it('scale from base keeps minY fixed (grows upward)', () => {
    const pos: [number, number, number] = [0, 0.5, 0] // size 1 → minY 0
    const newSize: [number, number, number] = [1, 2, 1]
    const newPos = scalePivotPosition(pos, [1, 1, 1], newSize, undefined, 'base')
    const newMinY = newPos[1] - newSize[1] / 2
    expect(newMinY).toBeCloseTo(0, 6) // minY unchanged
    expect(newPos[1]).toBeCloseTo(1, 6) // centre rose to h/2 = 1
  })

  it('scale from the min corner keeps all three min faces fixed', () => {
    const pos: [number, number, number] = [0.5, 0.5, 0.5] // size 1 → min corner (0,0,0)
    const newSize: [number, number, number] = [2, 3, 4]
    const newPos = scalePivotPosition(pos, [1, 1, 1], newSize, undefined, 'corner')
    expect(newPos[0] - newSize[0] / 2).toBeCloseTo(0, 6)
    expect(newPos[1] - newSize[1] / 2).toBeCloseTo(0, 6)
    expect(newPos[2] - newSize[2] / 2).toBeCloseTo(0, 6)
  })
})

describe('groupRotatePivotPosition', () => {
  it('centre pivot returns the group origin unchanged (today)', () => {
    const gp: [number, number, number] = [0.1, 0.2, 0.3]
    expect(
      groupRotatePivotPosition(gp, [0, 0.5, 0], [-0.5, 0, -0.5], undefined, [0, 90, 0], 'center'),
    ).toEqual(gp)
  })

  it('base pivot keeps the members-union base point fixed under rotation', () => {
    const gp: [number, number, number] = [0, 0, 0]
    const unionCenter: [number, number, number] = [0, 0.5, 0]
    const unionMin: [number, number, number] = [-0.5, 0, -0.5]
    const basePoint = new Vector3(unionCenter[0], unionMin[1], unionCenter[2])
    const before = basePoint.clone().add(new Vector3(...gp))
    const newGp = groupRotatePivotPosition(gp, unionCenter, unionMin, undefined, [0, 0, 90], 'base')
    const after = basePoint
      .clone()
      .applyEuler(new Euler(0, 0, 90 * DEG, 'XYZ'))
      .add(new Vector3(...newGp))
    expect(after.x).toBeCloseTo(before.x, 5)
    expect(after.y).toBeCloseTo(before.y, 5)
    expect(after.z).toBeCloseTo(before.z, 5)
  })
})
