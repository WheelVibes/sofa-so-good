// @vitest-environment node
import { BoxGeometry, EqualDepth, LessEqualDepth, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { REVEAL_ORDER_BASE, revealRenderOrder } from './wallRevealMath'
import {
  applyRevealColourDepth,
  disposeRevealPrepass,
  isRevealPrepass,
  REVEAL_PREPASS_ORDER,
  syncRevealPrepass,
} from './wallRevealPrepass'

/**
 * WALL-REVEAL-DEPTH-PREPASS. The band this fixes is per-PIXEL, so the pixels are judged in the
 * verify scenario; what CAN be pinned here is the contract the mechanism rests on: the twin
 * shares the wall's geometry and depth bias exactly (or `EqualDepth` would speckle), it sorts
 * strictly ahead of every faded colour draw, it lives in the TRANSPARENT pass (so the room's
 * opaque interior has already drawn and cannot be occluded by it), and it costs nothing at all
 * for a wall that never fades.
 */
function wall(bias = 0): Mesh {
  const m = new MeshStandardMaterial()
  if (bias) {
    m.polygonOffset = true
    m.polygonOffsetFactor = 0
    m.polygonOffsetUnits = bias
  }
  return new Mesh(new BoxGeometry(1, 2, 0.2), m)
}

describe('syncRevealPrepass', () => {
  it('creates no twin for a wall that is not fading', () => {
    const mesh = wall()
    syncRevealPrepass(mesh, false)
    expect(mesh.children).toHaveLength(0)
  })

  it('adds ONE depth-only twin while fading, and reuses it', () => {
    const mesh = wall()
    syncRevealPrepass(mesh, true)
    syncRevealPrepass(mesh, true)
    expect(mesh.children).toHaveLength(1)
    const twin = mesh.children[0] as Mesh
    expect(isRevealPrepass(twin)).toBe(true)
    // Same geometry AND an identity local transform ⇒ a bit-exact matrixWorld ⇒ the depth the
    // colour pass's EqualDepth test compares against is the depth it will itself produce.
    expect(twin.geometry).toBe(mesh.geometry)
    expect(twin.matrix.equals(twin.matrix.clone().identity())).toBe(true)
    const mat = twin.material as MeshStandardMaterial
    expect(mat.colorWrite).toBe(false)
    expect(mat.depthWrite).toBe(true)
    expect(mat.depthTest).toBe(true)
    // TRANSPARENT, deliberately: the opaque pass (floors, furniture, the rooms seen THROUGH the
    // faded wall) is fully drawn before it, so the pre-pass cannot cull any of it.
    expect(mat.transparent).toBe(true)
    expect(twin.castShadow).toBe(false)
  })

  it('sorts strictly ahead of every faded colour draw', () => {
    expect(REVEAL_PREPASS_ORDER).toBe(REVEAL_ORDER_BASE - 1)
    expect(REVEAL_PREPASS_ORDER).toBeLessThan(revealRenderOrder(0))
    expect(REVEAL_PREPASS_ORDER).toBeLessThan(revealRenderOrder(999))
  })

  it('copies the wall body depth bias so the two passes rasterise identical depth', () => {
    const mesh = wall(7)
    syncRevealPrepass(mesh, true)
    const mat = (mesh.children[0] as Mesh).material as MeshStandardMaterial
    expect(mat.polygonOffset).toBe(true)
    expect(mat.polygonOffsetFactor).toBe(0)
    expect(mat.polygonOffsetUnits).toBe(7)
  })

  it('takes the first material of a grouped body (the room editor passes an array)', () => {
    const mesh = wall()
    const a = new MeshStandardMaterial()
    a.polygonOffset = true
    a.polygonOffsetUnits = 3
    mesh.material = [a, new MeshStandardMaterial()]
    syncRevealPrepass(mesh, true)
    expect(((mesh.children[0] as Mesh).material as MeshStandardMaterial).polygonOffsetUnits).toBe(3)
  })

  it('hides (never removes) the twin when the wall goes opaque again', () => {
    const mesh = wall()
    syncRevealPrepass(mesh, true)
    syncRevealPrepass(mesh, false)
    expect(mesh.children).toHaveLength(1)
    expect(mesh.children[0].visible).toBe(false)
  })
})

describe('applyRevealColourDepth', () => {
  it('hands depth to the pre-pass and tests for EQUAL depth while fading', () => {
    const m = new MeshStandardMaterial()
    applyRevealColourDepth(m, true)
    expect(m.depthWrite).toBe(false)
    expect(m.depthFunc).toBe(EqualDepth)
  })

  it('restores WALL-FADE-DEPTHWRITE state when opaque / flag off', () => {
    const m = new MeshStandardMaterial()
    applyRevealColourDepth(m, true)
    applyRevealColourDepth(m, false)
    expect(m.depthWrite).toBe(true)
    expect(m.depthFunc).toBe(LessEqualDepth)
  })
})

describe('disposeRevealPrepass', () => {
  it('detaches + disposes every twin and leaves the wall geometry alone', () => {
    const mesh = wall()
    syncRevealPrepass(mesh, true)
    const twinMat = (mesh.children[0] as Mesh).material as MeshStandardMaterial
    let disposed = false
    twinMat.addEventListener('dispose', () => {
      disposed = true
    })
    disposeRevealPrepass(mesh)
    expect(mesh.children).toHaveLength(0)
    expect(disposed).toBe(true)
    expect(mesh.geometry.attributes.position).toBeDefined()
  })

  it('is a no-op on null', () => {
    expect(() => disposeRevealPrepass(null)).not.toThrow()
  })
})
