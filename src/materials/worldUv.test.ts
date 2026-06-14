import type { BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { applyUvTransform, worldUvShapeGeometry } from './worldUv'

const square: [number, number][] = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
]

function uvExtent(geo: BufferGeometry) {
  const uv = geo.attributes.uv
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < uv.count; i++) {
    min = Math.min(min, uv.getX(i))
    max = Math.max(max, uv.getX(i))
  }
  return max - min
}

describe('applyUvTransform / worldUvShapeGeometry', () => {
  it('is identity (UVs unchanged) with no transform', () => {
    const geo = worldUvShapeGeometry(square)
    expect(uvExtent(geo)).toBeCloseTo(2, 6) // world-metre UVs span the 2 m square
  })

  it('scaling tile size by 2 halves the UV extent (fewer repeats → bigger tiles)', () => {
    const geo = worldUvShapeGeometry(square, { scale: 2 })
    expect(uvExtent(geo)).toBeCloseTo(1, 6)
  })

  it('a 90° rotation preserves the extent (rotation about the UV centre)', () => {
    const geo = worldUvShapeGeometry(square, { angle: Math.PI / 2 })
    expect(uvExtent(geo)).toBeCloseTo(2, 6)
  })

  it('applyUvTransform is a no-op for the identity transform', () => {
    const a = worldUvShapeGeometry(square)
    const before = uvExtent(a)
    applyUvTransform(a, { scale: 1, angle: 0 })
    expect(uvExtent(a)).toBeCloseTo(before, 6)
  })
})
