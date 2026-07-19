// @vitest-environment happy-dom
import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { getDraperyMaterial } from './furnitureMaterials'

/**
 * `getDraperyMaterial`'s three weaves (cotton/linen/velvet) must read visibly
 * distinct at typical camera distance — not just a hairline roughness delta —
 * and the sheer opacity path (used by e.g. the zebra blind's translucent band)
 * must actually render as see-through cloth, not opaque grey plastic.
 */
beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as any
})

describe('getDraperyMaterial weave distinctness', () => {
  it('cotton vs linen: linen is rougher AND carries a stronger weave-relief normal', () => {
    const cotton = getDraperyMaterial('cotton', '#d8d2c4')
    const linen = getDraperyMaterial('linen', '#d8d2c4')
    expect(linen.roughness).toBeGreaterThan(cotton.roughness)
    expect(linen.normalScale.x).toBeGreaterThan(cotton.normalScale.x)
  })

  it('velvet is a distinct richer-sheen physical material, not the plain weave fabric', () => {
    const cotton = getDraperyMaterial('cotton', '#5b3a3a')
    const velvet = getDraperyMaterial('velvet', '#5b3a3a')
    expect(velvet).toBeInstanceOf(MeshPhysicalMaterial)
    expect((velvet as MeshPhysicalMaterial).sheen).toBeGreaterThan(
      (cotton as MeshPhysicalMaterial).sheen ?? 0,
    )
    expect(velvet.roughness).not.toBe(cotton.roughness)
  })

  it('a sheer (opacity < 1) band renders as real translucent cloth, not opaque plastic', () => {
    const opaque = getDraperyMaterial('cotton', '#f2efe6', 'plain', false, 1)
    const sheer = getDraperyMaterial('cotton', '#f2efe6', 'plain', false, 0.4)
    expect(opaque.transparent).toBe(false)
    expect(sheer.transparent).toBe(true)
    expect(sheer.opacity).toBeCloseTo(0.4, 5)
    // Still real cloth — keeps the weave normal map, not a flat unlit plane.
    expect(sheer.normalMap).not.toBeNull()
  })

  it('returns a plain MeshStandardMaterial-compatible instance usable as a `material=` prop', () => {
    const m = getDraperyMaterial('cotton', '#cccccc')
    expect(m).toBeInstanceOf(MeshStandardMaterial)
  })
})
