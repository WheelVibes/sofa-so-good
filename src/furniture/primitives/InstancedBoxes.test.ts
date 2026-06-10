import { Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { type BoxInstance, bakeInstanceMatrix } from './InstancedBoxes'

describe('bakeInstanceMatrix', () => {
  it('bakes the instance centre into the matrix translation', () => {
    const scratch = new Object3D()
    const inst: BoxInstance = { position: [0.3, 1.2, -0.5], size: [0.1, 0.2, 0.3] }
    const m = bakeInstanceMatrix(inst, scratch)
    const pos = new Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBeCloseTo(0.3, 12)
    expect(pos.y).toBeCloseTo(1.2, 12)
    expect(pos.z).toBeCloseTo(-0.5, 12)
  })

  it('bakes the instance size into the matrix scale of the unit box', () => {
    const scratch = new Object3D()
    const inst: BoxInstance = { position: [0, 0, 0], size: [0.035, 1.9, 0.042] }
    const m = bakeInstanceMatrix(inst, scratch)
    const scale = new Vector3().setFromMatrixScale(m)
    expect(scale.x).toBeCloseTo(0.035, 12)
    expect(scale.y).toBeCloseTo(1.9, 12)
    expect(scale.z).toBeCloseTo(0.042, 12)
  })

  it('produces no rotation (axis-aligned boxes only)', () => {
    const scratch = new Object3D()
    // Pre-dirty the scratch rotation; an axis-aligned bake must not rotate.
    scratch.rotation.set(0.4, 0.5, 0.6)
    const m = bakeInstanceMatrix({ position: [1, 2, 3], size: [1, 1, 1] }, scratch)
    // For a uniform unit box with no rotation the basis columns stay axis-aligned.
    const e = m.elements
    expect(e[1]).toBeCloseTo(0, 12) // X column has no Y/Z
    expect(e[2]).toBeCloseTo(0, 12)
    expect(e[4]).toBeCloseTo(0, 12) // Y column has no X/Z
    expect(e[6]).toBeCloseTo(0, 12)
    expect(e[8]).toBeCloseTo(0, 12) // Z column has no X/Y
    expect(e[9]).toBeCloseTo(0, 12)
  })

  it('reuses the scratch Object3D across instances (matrix reflects the latest)', () => {
    const scratch = new Object3D()
    bakeInstanceMatrix({ position: [1, 1, 1], size: [2, 2, 2] }, scratch)
    const m = bakeInstanceMatrix({ position: [-1, 0, 0], size: [0.5, 0.5, 0.5] }, scratch)
    const pos = new Vector3().setFromMatrixPosition(m)
    const scale = new Vector3().setFromMatrixScale(m)
    expect(pos.x).toBeCloseTo(-1, 12)
    expect(scale.x).toBeCloseTo(0.5, 12)
  })
})
