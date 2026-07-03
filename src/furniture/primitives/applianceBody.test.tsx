// @vitest-environment happy-dom
import { MeshStandardMaterial } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * MAT-004b — the 8 steel-bodied appliances route their carcass through the
 * shared brushed-metal material via `applianceBody`. This smoke-tests the wiring
 * decision (steel → a shared `getMetalMaterial` instance set on the mesh's
 * `material` prop; non-steel → plain props for `<meshStandardMaterial>`) without
 * an R3F/WebGL canvas. happy-dom has no real 2D context, so we stub a minimal
 * `createImageData`/`putImageData` (as the material tests do) so the brushed-metal
 * map bake runs when pbrSurfaces is on.
 */
beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal 2D-context stub for the test env.
  HTMLCanvasElement.prototype.getContext = (() => ctx) as any
})

async function load(pbrOn: boolean) {
  vi.resetModules()
  // Preserve the rest of the module (e.g. `resolveFlags`, which the store's
  // featureFlagsSlice imports transitively now that BeveledBox → useDetail pulls
  // in the store) and override only `isFeatureEnabled`.
  vi.doMock('../../features/featureFlags', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../features/featureFlags')>()
    return {
      ...actual,
      isFeatureEnabled: (flag: string) => (flag === 'pbrSurfaces' ? pbrOn : false),
    }
  })
  return import('./shared')
}

describe('applianceBody (MAT-004b steel-body wiring)', () => {
  it('steel finish → a shared brushed-metal material on the mesh prop, no spread props', async () => {
    const { applianceBody, applianceBodyMeshProps } = await load(true)
    const body = applianceBody('#d8dade', 'steel')
    expect(body.material).toBeInstanceOf(MeshStandardMaterial)
    expect(body.props).toBeUndefined()
    expect(applianceBodyMeshProps(body).material).toBe(body.material)
  })

  it('reuses one cached material across calls (shared per appliance + per part)', async () => {
    const { applianceBody } = await load(true)
    const a = applianceBody('#d8dade', 'steel')
    const b = applianceBody('#d8dade', 'steel')
    expect(a.material).toBe(b.material)
  })

  it('non-steel finishes (matte / gloss) keep plain props, no metal material', async () => {
    const { applianceBody, applianceBodyMeshProps } = await load(true)
    for (const finish of ['matte', 'gloss']) {
      const body = applianceBody('#eef0f2', finish)
      expect(body.material).toBeUndefined()
      expect(body.props).toMatchObject({ color: '#eef0f2' })
      expect(body.props?.roughness).toBeTypeOf('number')
      expect(body.props?.metalness).toBeTypeOf('number')
      // Nothing goes on the mesh prop → the material is the declarative child.
      expect(applianceBodyMeshProps(body).material).toBeUndefined()
    }
  })

  it('steel body works on the flat tier too (plain metal material, no maps)', async () => {
    const { applianceBody } = await load(false)
    const body = applianceBody('#d8dade', 'steel')
    expect(body.material).toBeInstanceOf(MeshStandardMaterial)
    expect(body.material?.normalMap).toBeNull()
  })
})

describe('appliance primitives render to a valid element tree', () => {
  // 20s: eight dynamic imports of three-heavy primitive modules — well under a
  // second alone, but the 5s default flakes under full-suite 12-thread load.
  it('all 8 steel-bodied appliances return an element (smoke)', { timeout: 20_000 }, async () => {
    // Render-call the primitive functions directly (no R3F canvas needed — they
    // return a React element tree). Exercises the `applianceBody` wiring + JSX.
    await load(true)
    const { Refrigerator } = await import('./Refrigerator')
    const { Oven } = await import('./Oven')
    const { Stove } = await import('./Stove')
    const { RangeHood } = await import('./RangeHood')
    const { Dishwasher } = await import('./Dishwasher')
    const { Microwave } = await import('./Microwave')
    const { WashingMachine } = await import('./WashingMachine')
    const { WineCooler } = await import('./WineCooler')
    const comps = [
      Refrigerator,
      Oven,
      Stove,
      RangeHood,
      Dishwasher,
      Microwave,
      WashingMachine,
      WineCooler,
    ]
    for (const Comp of comps) {
      const el = Comp({ props: { finish: 'steel' } })
      expect(el).toBeTruthy()
      expect(el.type).toBe('group')
    }
  })
})
