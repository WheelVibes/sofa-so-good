// @vitest-environment happy-dom
/**
 * Structural + geometry coverage for the CAT-B furniture round (research-ranked
 * gaps for modern SG homes): extendable dining table leaf, altar/prayer cabinet,
 * banquette, hydraulic-lift storage bed, wall-mounted water heater, fluted glass
 * partition. Mirrors the whole-catalog `structuralSoundness.test.tsx` harness but
 * sweeps these pieces' NON-first-structural-enum variants (material/base/style)
 * that the global harness doesn't reach, plus the pure leaf-footprint maths.
 */
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Box3, Matrix4 } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { diningLeafExtension } from '../defs/diningSeatDims'
import type { ParamProps, PrimitiveKind } from '../types'
import { PRIMITIVE_COMPONENTS } from './index'
import { type AABB, analyzeStructure } from './structuralSoundness'

const EPS = 0.008
const FLOOR_TOL = 0.012

function makeImageData(w: number, h: number) {
  return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }
}
function fakeCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} }
  const base: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    font: '',
    createImageData: (w: number | { width: number; height: number }, h?: number) =>
      typeof w === 'number' ? makeImageData(w, h ?? w) : makeImageData(w.width, w.height),
    getImageData: (_x: number, _y: number, w: number, h: number) => makeImageData(w, h),
    putImageData: () => {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => gradient,
  }
  return new Proxy(base, {
    get: (t, p: string) => (p in t ? t[p] : () => {}),
    set: (t, p: string, v) => {
      t[p] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

interface MeshLike {
  isMesh?: boolean
  isInstancedMesh?: boolean
  count?: number
  geometry?: { boundingBox?: Box3 | null; computeBoundingBox: () => void }
  matrixWorld: Matrix4
  getMatrixAt?: (i: number, m: Matrix4) => void
}
interface ObjLike {
  traverse: (cb: (o: ObjLike) => void) => void
  updateMatrixWorld: (force: boolean) => void
}

function collectWorldBoxes(root: ObjLike): AABB[] {
  const boxes: AABB[] = []
  root.updateMatrixWorld(true)
  const tmp = new Box3()
  const m = new Matrix4()
  root.traverse((node) => {
    const mesh = node as unknown as MeshLike
    if (!mesh.isMesh || !mesh.geometry) return
    const geom = mesh.geometry
    if (!geom.boundingBox) geom.computeBoundingBox()
    const bb = geom.boundingBox
    if (!bb) return
    if (mesh.isInstancedMesh && mesh.getMatrixAt) {
      const count = mesh.count ?? 0
      for (let i = 0; i < count; i++) {
        mesh.getMatrixAt(i, m)
        m.premultiply(mesh.matrixWorld)
        tmp.copy(bb).applyMatrix4(m)
        boxes.push({
          min: [tmp.min.x, tmp.min.y, tmp.min.z],
          max: [tmp.max.x, tmp.max.y, tmp.max.z],
        })
      }
    } else {
      tmp.copy(bb).applyMatrix4(mesh.matrixWorld)
      boxes.push({ min: [tmp.min.x, tmp.min.y, tmp.min.z], max: [tmp.max.x, tmp.max.y, tmp.max.z] })
    }
  })
  return boxes
}

async function boxesFor(primitive: PrimitiveKind, props: ParamProps): Promise<AABB[]> {
  const Comp = PRIMITIVE_COMPONENTS[primitive]
  const renderer = await ReactThreeTestRenderer.create(<Comp props={props} />)
  const scene = (renderer.scene as unknown as { instance: ObjLike }).instance
  const boxes = collectWorldBoxes(scene)
  await renderer.unmount()
  return boxes
}

useStore.setState({ qualityTier: 'performance' })
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeCtx() as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
})

/** One connected grounded assembly (+ optional floor contact). */
async function expectGrounded(
  primitive: PrimitiveKind,
  props: ParamProps,
  { anchored = true }: { anchored?: boolean } = {},
): Promise<void> {
  const boxes = await boxesFor(primitive, props)
  expect(boxes.length, 'rendered no geometry').toBeGreaterThan(0)
  const report = analyzeStructure(boxes, EPS)
  expect(
    report.componentCount,
    `expected 1 connected component (gap ${(report.largestGap * 1000).toFixed(1)} mm)`,
  ).toBe(1)
  if (anchored) {
    expect(
      report.minY,
      `does not reach the floor (min-Y ${(report.minY * 1000).toFixed(1)} mm)`,
    ).toBeLessThanOrEqual(FLOOR_TOL)
  }
}

describe('CAT-B: extendable dining table leaf', () => {
  it('leaf extension is 0 by default and DINING_LEAF_WIDTH only when rect + extended', () => {
    expect(diningLeafExtension({})).toBe(0)
    expect(diningLeafExtension({ shape: 'rect', leaf: 'none' })).toBe(0)
    expect(diningLeafExtension({ shape: 'rect', leaf: 'extended' })).toBeGreaterThan(0)
    // Round / oval tops never extend (keeps render + footprint in lock-step).
    expect(diningLeafExtension({ shape: 'round', leaf: 'extended' })).toBe(0)
    expect(diningLeafExtension({ shape: 'oval', leaf: 'extended' })).toBe(0)
  })

  it('extended table widens its rendered top vs the standard top', async () => {
    const spanX = (boxes: AABB[]) =>
      Math.max(...boxes.map((b) => b.max[0])) - Math.min(...boxes.map((b) => b.min[0]))
    const std = await boxesFor('DiningTable', { seats: '4', shape: 'rect', leaf: 'none' })
    const ext = await boxesFor('DiningTable', { seats: '4', shape: 'rect', leaf: 'extended' })
    expect(ext.length).toBeGreaterThan(std.length) // seams add geometry
    expect(spanX(ext)).toBeGreaterThan(spanX(std) + 0.3)
  })

  it('both states are one grounded assembly', async () => {
    await expectGrounded('DiningTable', { seats: '4', shape: 'rect', leaf: 'none' })
    await expectGrounded('DiningTable', { seats: '4', shape: 'rect', leaf: 'extended' })
  })
})

describe('CAT-B: altar cabinet', () => {
  for (const style of ['cabinet', 'drawers']) {
    it(`style=${style} is one grounded assembly`, async () => {
      await expectGrounded('AltarCabinet', { width: 0.9, style })
    })
  }
})

describe('CAT-B: banquette', () => {
  for (const material of ['fabric', 'leather', 'velvet', 'boucle']) {
    it(`material=${material} is one grounded assembly`, async () => {
      await expectGrounded('Banquette', { width: 1.6, depth: 0.55, material })
    })
  }
  it('wide banquette stays grounded + connected', async () => {
    await expectGrounded('Banquette', { width: 2.4, depth: 0.65, material: 'fabric' })
  })
})

describe('CAT-B: hydraulic-lift storage bed', () => {
  for (const baseStyle of ['standard', 'platform', 'storage', 'hydraulic']) {
    it(`baseStyle=${baseStyle} is one grounded assembly`, async () => {
      await expectGrounded('Bed', { width: 1.52, length: 1.9, baseStyle })
    })
  }
})

describe('CAT-B: wall-mounted water heater', () => {
  // Mounted (renders offset up the wall) → connectivity only, no floor assert.
  it('is one connected assembly (mounted)', async () => {
    await expectGrounded('WaterHeater', { width: 0.5, mountHeight: 1.95 }, { anchored: false })
  })
})

describe('CAT-B: fluted glass partition', () => {
  it('default is one grounded assembly', async () => {
    await expectGrounded('FlutedPartition', { width: 1.2, height: 2.1 })
  })
  it('wide/tall variant stays grounded + connected', async () => {
    await expectGrounded('FlutedPartition', { width: 3.0, height: 2.4 })
  })
})
