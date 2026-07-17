// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import { MeshStandardMaterial } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * MAT-004b — the 8 steel-bodied appliances route their carcass through the
 * shared `applianceBodyMaterial(color, finish)` resolver, which returns ONE
 * `Material` instance for EVERY finish (steel → shared brushed metal; matte/gloss
 * → shared painted `getSolidMaterial`) set on the body mesh's `material=` prop.
 * This single-representation rule is what fixes the swap-reconciliation bug: the
 * old split (steel on the mesh PROP, non-steel as a `<meshStandardMaterial>`
 * CHILD) left a stale white body when the user swapped steel↔matte, because R3F
 * could not reconcile between the two forms. Routing both through the prop makes
 * a swap a plain material-instance change on one mesh.
 *
 * happy-dom has no real 2D context, so we stub a minimal `createImageData`/
 * `putImageData` (as the material tests do) so the brushed-metal map bake runs
 * when pbrSurfaces is on.
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

describe('applianceBodyMaterial (MAT-004b single-representation resolver)', () => {
  it('steel finish → a shared brushed-metal MeshStandardMaterial', async () => {
    const { applianceBodyMaterial } = await load(true)
    const m = applianceBodyMaterial('#d8dade', 'steel')
    expect(m).toBeInstanceOf(MeshStandardMaterial)
  })

  it('reuses one cached material across calls (shared per appliance + per part)', async () => {
    const { applianceBodyMaterial } = await load(true)
    expect(applianceBodyMaterial('#d8dade', 'steel')).toBe(
      applianceBodyMaterial('#d8dade', 'steel'),
    )
    expect(applianceBodyMaterial('#eef0f2', 'matte')).toBe(
      applianceBodyMaterial('#eef0f2', 'matte'),
    )
  })

  it('non-steel finishes (matte / gloss) → a painted material with the EXACT finish params', async () => {
    const { applianceBodyMaterial } = await load(true)
    const { applianceFinish } = await import('../../materials/furnitureMaterials')
    for (const finish of ['matte', 'gloss'] as const) {
      const m = applianceBodyMaterial('#eef0f2', finish)
      expect(m).toBeInstanceOf(MeshStandardMaterial)
      // Byte-identical to the old `<meshStandardMaterial {...applianceFinish}>` child.
      const preset = applianceFinish(finish)
      expect(m.roughness).toBe(preset.roughness)
      expect(m.metalness).toBe(preset.metalness)
      // A painted body carries no brushed-metal maps (only the steel path does).
      expect(m.normalMap).toBeNull()
    }
  })

  it('swap steel→matte returns a DIFFERENT material instance (the reconciliation fix)', async () => {
    // The bug: swapping finishes crossed the prop-material ↔ child-material
    // boundary and left a stale body. Now both finishes are `material=` props, so
    // a swap is a plain instance change on one mesh — R3F reconciles it cleanly.
    const { applianceBodyMaterial } = await load(true)
    const steel = applianceBodyMaterial('#d8dade', 'steel')
    const matte = applianceBodyMaterial('#d8dade', 'matte')
    expect(steel).not.toBe(matte)
    // Both are real Material instances (never `undefined` → never a child node).
    expect(steel).toBeInstanceOf(MeshStandardMaterial)
    expect(matte).toBeInstanceOf(MeshStandardMaterial)
  })

  it('steel body works on the flat tier too (plain metal material, no maps)', async () => {
    const { applianceBodyMaterial } = await load(false)
    const m = applianceBodyMaterial('#d8dade', 'steel')
    expect(m).toBeInstanceOf(MeshStandardMaterial)
    expect(m.normalMap).toBeNull()
  })
})

/** Walk a React element tree, returning every `material` prop that is a real
 *  `Material` instance. Used to assert the single-representation invariant on the
 *  actual primitives (the body material is always on the mesh `material=` prop,
 *  never a child element). */
function collectMeshMaterials(
  node: ReactNode,
  out: MeshStandardMaterial[] = [],
): MeshStandardMaterial[] {
  if (!isValidElement(node)) return out
  // biome-ignore lint/suspicious/noExplicitAny: element props are untyped here.
  const props = node.props as any
  if (props?.material instanceof MeshStandardMaterial) out.push(props.material)
  if (props?.children) {
    for (const child of Array.isArray(props.children) ? props.children : [props.children]) {
      collectMeshMaterials(child, out)
    }
  }
  return out
}

describe('appliance primitives — single representation + swap regression', () => {
  it('body material sits on the mesh prop and changes instance on steel→matte swap', {
    timeout: 20_000,
  }, async () => {
    await load(true)
    const { Refrigerator } = await import('./Refrigerator')
    const steelTree = Refrigerator({ props: { finish: 'steel' } })
    const matteTree = Refrigerator({ props: { finish: 'matte' } })
    const steelMats = collectMeshMaterials(steelTree)
    const matteMats = collectMeshMaterials(matteTree)
    // The carcass material is present on a mesh `material=` prop in BOTH finishes…
    expect(steelMats.length).toBeGreaterThan(0)
    expect(matteMats.length).toBeGreaterThan(0)
    // …and swapping the finish yields a different material instance (so R3F sees a
    // prop change on the same mesh and re-binds it — no stale body).
    expect(steelMats[0]).not.toBe(matteMats[0])
  })

  it('all 8 steel-bodied appliances return an element (smoke)', { timeout: 20_000 }, async () => {
    // Render-call the primitive functions directly (no R3F canvas needed — they
    // return a React element tree). Exercises the `applianceBodyMaterial` wiring.
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

describe('applianceBodyMaterial — @testing-library swap harness', () => {
  it('a mesh material prop actually changes when the finish is swapped steel→matte', async () => {
    const { applianceBodyMaterial } = await load(true)
    // A stub "mesh" that records whatever `material` it is handed each render —
    // mirrors the real body mesh, which always receives the material via the prop.
    const captured: (MeshStandardMaterial | undefined)[] = []
    function CaptureMesh({ material }: { material?: MeshStandardMaterial }) {
      captured.push(material)
      return null
    }
    function Harness({ finish }: { finish: string }) {
      return <CaptureMesh material={applianceBodyMaterial('#d8dade', finish)} />
    }
    const { rerender } = render(<Harness finish="steel" />)
    rerender(<Harness finish="matte" />)
    expect(captured.length).toBeGreaterThanOrEqual(2)
    const steelMat = captured[0]
    const matteMat = captured.at(-1)
    expect(steelMat).toBeInstanceOf(MeshStandardMaterial)
    expect(matteMat).toBeInstanceOf(MeshStandardMaterial)
    expect(steelMat).not.toBe(matteMat)
  })
})
