import { describe, expect, it } from 'vitest'
import { mmToFov } from '../cameras/cameraLensSettings'
import { clampHqOptions, type HqRenderOptions, pbrStandInFor } from './hqRenderSession'

describe('clampHqOptions', () => {
  it('clamps dimensions and samples to GPU-safe bounds', () => {
    expect(clampHqOptions({ width: 99999, height: 0, maxSamples: 1e9 })).toEqual({
      width: 4096,
      height: 64,
      maxSamples: 4096,
    })
    expect(clampHqOptions({ width: 1920, height: 1080, maxSamples: 256 })).toEqual({
      width: 1920,
      height: 1080,
      maxSamples: 256,
    })
    expect(clampHqOptions({ width: Number.NaN, height: -5, maxSamples: 0 })).toEqual({
      width: 64,
      height: 64,
      maxSamples: 1,
    })
  })
})

describe('HqRenderOptions lens + DoF wiring (PC2-CAM-DOF-LENS)', () => {
  it('accepts the optional lens/focus fields alongside the f-stop', () => {
    // Type-level contract: the option bag carries the new lens controls. The
    // session maps `focalLengthMm` → a vertical FOV via the shared `mmToFov`
    // and uses `focusDistance` (when set) to override centre-screen auto-focus.
    const opts: HqRenderOptions = {
      width: 1920,
      height: 1080,
      maxSamples: 256,
      fStop: 2.8,
      focalLengthMm: 85,
      focusDistance: 4.5,
    }
    expect(opts.focalLengthMm).toBe(85)
    expect(opts.focusDistance).toBe(4.5)
    // The FOV the session feeds the PhysicalCamera for an 85 mm lens.
    expect(mmToFov(85)).toBeCloseTo((2 * Math.atan(12 / 85) * 180) / Math.PI, 4)
  })
})

describe('pbrStandInFor — legacy lit materials the tracer reads as mirrors (HQ-LAMBERT-CEILING)', () => {
  it('substitutes a matte MeshStandardMaterial for MeshLambertMaterial', async () => {
    const three = await import('three')
    const lambert = new three.MeshLambertMaterial({ color: 0xfafafa, side: three.FrontSide })
    const cache = new Map<unknown, unknown>()
    const sub = (await pbrStandInFor(lambert, cache)) as InstanceType<
      typeof three.MeshStandardMaterial
    >
    expect(sub).not.toBe(lambert)
    expect(sub.isMeshStandardMaterial).toBe(true)
    // The whole point: a real roughness, so the converter cannot read `undefined`
    // as 0 and render plaster as a mirror (v0.31.5.252 measured +33 % and saw the
    // window reflected in the ceiling).
    expect(sub.roughness).toBeGreaterThan(0.85)
    expect(sub.metalness).toBe(0)
    expect(sub.color.getHexString()).toBe('fafafa')
    expect(sub.side).toBe(three.FrontSide)
  })

  it('maps Phong shininess monotonically onto roughness', async () => {
    const three = await import('three')
    const cache = new Map<unknown, unknown>()
    const matte = (await pbrStandInFor(
      new three.MeshPhongMaterial({ shininess: 1 }),
      cache,
    )) as InstanceType<typeof three.MeshStandardMaterial>
    const shiny = (await pbrStandInFor(
      new three.MeshPhongMaterial({ shininess: 900 }),
      cache,
    )) as InstanceType<typeof three.MeshStandardMaterial>
    expect(matte.roughness).toBeGreaterThan(shiny.roughness)
    expect(shiny.roughness).toBeGreaterThanOrEqual(0.15)
    expect(matte.roughness).toBeLessThanOrEqual(0.95)
  })

  it('caches one substitute per source material, and passes PBR materials through', async () => {
    const three = await import('three')
    const cache = new Map<unknown, unknown>()
    const lambert = new three.MeshLambertMaterial()
    expect(await pbrStandInFor(lambert, cache)).toBe(await pbrStandInFor(lambert, cache))
    expect(cache.size).toBe(1)
    // Standard/Physical/Basic are returned untouched — Basic is unlit by intent
    // (window panes, screens, sky), so a PBR response would change what it is.
    const std = new three.MeshStandardMaterial()
    const basic = new three.MeshBasicMaterial()
    expect(await pbrStandInFor(std, cache)).toBe(std)
    expect(await pbrStandInFor(basic, cache)).toBe(basic)
    expect(cache.size).toBe(1)
  })
})
