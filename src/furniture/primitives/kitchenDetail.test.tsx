// @vitest-environment happy-dom
/**
 * KITCHEN-DETAIL (`kitchenDetail` flag) — the default flat's kitchen backsplash
 * becomes real glazed ceramic tile (procedural `subway`/`tile` painter, sized
 * from the run's WORLD width) and the sink's three stacked cylinders become a
 * single-lever mixer with a swan-neck `TubeGeometry` spout, an aerator ring, a
 * side lever and a basket strainer.
 *
 * Both flag states are asserted (CLAUDE.md "test BOTH modes"): with the flag OFF
 * the primitive must render byte-identically to pre-v0.33 — a plain `#e4e7e3`
 * slab and the bent-rod tap.
 */
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeAll, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import type { ParamProps } from '../types'
import { KitchenCounter } from './KitchenCounter'

function makeImageData(w: number, h: number) {
  return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }
}
/** happy-dom has no 2D context; the procedural tile bake needs one to run. */
function fakeCtx(): CanvasRenderingContext2D {
  const base: Record<string, unknown> = {
    createImageData: (w: number, h: number) => makeImageData(w, h ?? w),
    getImageData: (_x: number, _y: number, w: number, h: number) => makeImageData(w, h),
    putImageData: () => {},
  }
  return new Proxy(base, {
    get: (t, p: string) => (p in t ? t[p] : () => {}),
    set: (t, p: string, v) => {
      t[p] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

interface MatLike {
  color: { getHexString: () => string }
  roughness: number
  metalness: number
  map?: { uuid: string; repeat: { x: number; y: number }; rotation: number } | null
  normalMap?: unknown
  roughnessMap?: unknown
}
interface MeshLike {
  isMesh?: boolean
  geometry?: { type?: string }
  material?: MatLike
  position: { x: number; y: number; z: number }
}
interface ObjLike {
  traverse: (cb: (o: ObjLike) => void) => void
}

/** A snapshot of one rendered mesh. Taken BEFORE `unmount()` — the test
 *  renderer's teardown re-points each mesh at a bare `BufferGeometry`, so a
 *  geometry read afterwards loses the primitive's real type. */
interface MeshSnapshot {
  geometry: string
  position: [number, number, number]
  material?: MatLike
}

async function meshes(props: ParamProps): Promise<MeshSnapshot[]> {
  const renderer = await ReactThreeTestRenderer.create(<KitchenCounter props={props} />)
  const scene = (renderer.scene as unknown as { instance: ObjLike }).instance
  const out: MeshSnapshot[] = []
  scene.traverse((o) => {
    const m = o as unknown as MeshLike
    if (!m.isMesh) return
    out.push({
      geometry: m.geometry?.type ?? '?',
      position: [m.position.x, m.position.y, m.position.z],
      material: m.material,
    })
  })
  await renderer.unmount()
  return out
}

/** The backsplash is the one box whose Y sits a quarter-metre above the worktop
 *  (0.9 + 0.24) — identified by position so the test doesn't depend on order. */
function backsplashMat(all: MeshSnapshot[]): MatLike {
  const hit = all.find((m) => Math.abs(m.position[1] - 1.14) < 1e-6 && m.position[0] === 0)
  if (!hit?.material) throw new Error('no backsplash mesh found')
  return hit.material
}

const SINK: ParamProps = { length: 2.6, hasSink: 'yes' }

beforeAll(() => {
  useStore.setState({ qualityTier: 'performance' })
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeCtx()) as unknown as HTMLCanvasElement['getContext']
})

function setFlag(on: boolean) {
  useStore.getState().setFeatureFlag('kitchenDetail', on)
  expect(useStore.getState().featureFlags.kitchenDetail, 'flag override took effect').toBe(on)
}

describe('KITCHEN-DETAIL — backsplash tile', () => {
  it('flag ON → the backsplash carries the procedural tile maps, world-sized', async () => {
    setFlag(true)
    const m = backsplashMat(await meshes(SINK))
    expect(m.map, 'albedo map from the subway painter').toBeTruthy()
    expect(m.normalMap, 'grout/bevel relief normal map').toBeTruthy()
    expect(m.roughnessMap, 'glaze↔grout roughness map').toBeTruthy()
    // The tint is baked into the albedo, so the material colour stays white.
    expect(m.color.getHexString()).toBe('ffffff')
    // A PHYSICAL period: `furnitureBoxUv` gives the part metre UVs, so one
    // texture period per BACKSPLASH_TILE_METRES (0.6 m) is repeat 1/0.6 = 1.667,
    // quantised by `sizedRepeat` to 1.65 → 151.5 × 75.8 mm subway tile. It must
    // be ISOTROPIC and independent of the run's length — tile is a product size,
    // not a grain scale.
    expect(m.map?.repeat.x).toBeCloseTo(1.65, 2)
    expect(m.map?.repeat.y).toBeCloseTo(1.65, 2)
    // Never quarter-turned: a running bond stood on end is a different product.
    expect(m.map?.rotation).toBe(0)
  })

  it('the tile period does NOT track the run length (a product size, not grain)', async () => {
    setFlag(true)
    const short = backsplashMat(await meshes({ ...SINK, length: 1.4 }))
    const long = backsplashMat(await meshes({ ...SINK, length: 3.6 }))
    expect(short.map?.repeat.x).toBeCloseTo(1.65, 2)
    expect(long.map?.repeat.x).toBeCloseTo(1.65, 2)
    // Same physical tile → the same cached material instance, one bake.
    expect(short.map?.uuid).toBe(long.map?.uuid)
  })

  it('flag OFF → the plain #e4e7e3 slab, exactly as before v0.33', async () => {
    setFlag(false)
    const m = backsplashMat(await meshes(SINK))
    expect(m.color.getHexString()).toBe('e4e7e3')
    expect(m.roughness).toBe(0.3)
    expect(m.metalness).toBe(0.05)
    expect(m.map, 'no texture on the legacy slab').toBeFalsy()
    expect(m.normalMap).toBeFalsy()
  })

  it("backsplashFinish 'solid' keeps the plain slab even with the flag ON", async () => {
    setFlag(true)
    const m = backsplashMat(await meshes({ ...SINK, backsplashFinish: 'solid' }))
    expect(m.color.getHexString()).toBe('e4e7e3')
    expect(m.map).toBeFalsy()
  })

  it("backsplashFinish 'tile' paints a DIFFERENT (square) tile than 'subway'", async () => {
    setFlag(true)
    const subway = backsplashMat(await meshes({ ...SINK, backsplashFinish: 'subway' }))
    const square = backsplashMat(await meshes({ ...SINK, backsplashFinish: 'tile' }))
    expect(square.map).toBeTruthy()
    expect(square.map?.uuid).not.toBe(subway.map?.uuid)
  })
})

describe('KITCHEN-DETAIL — mixer tap + strainer', () => {
  it('flag ON adds the mixer + strainer (a swan-neck tube spout, 4 more meshes)', async () => {
    setFlag(true)
    const on = await meshes(SINK)
    setFlag(false)
    const off = await meshes(SINK)
    // 3 legacy cylinders → 6 mixer meshes + 1 strainer.
    expect(on.length - off.length).toBe(4)
    expect(
      on.some((m) => m.geometry === 'TubeGeometry'),
      'the swan-neck spout is a TubeGeometry over a CatmullRomCurve3',
    ).toBe(true)
    expect(off.some((m) => m.geometry === 'TubeGeometry')).toBe(false)
  })

  it('no sink → no tap or strainer in either flag state', async () => {
    setFlag(true)
    const on = await meshes({ length: 2.6, hasSink: 'no' })
    setFlag(false)
    const off = await meshes({ length: 2.6, hasSink: 'no' })
    expect(on.length).toBe(off.length)
    expect(on.some((m) => m.geometry === 'TubeGeometry')).toBe(false)
  })
})
