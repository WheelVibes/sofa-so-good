// @vitest-environment happy-dom
/**
 * Structural-soundness harness (furniture-realism rubric point 2, the
 * 2026-07-17 "attachment is verified, not assumed" directive).
 *
 * For EVERY parametric def in the builtin catalog — with default props AND each
 * visually-distinct option of its first *structural* enum — this renders the
 * primitive headless with @react-three/test-renderer, extracts every rendered
 * mesh's WORLD-space AABB (InstancedMesh decomposed per instance), and asserts:
 *
 *   1. CONNECTIVITY — with each AABB inflated by ε (8 mm), the "boxes touch"
 *      adjacency graph is ONE connected component (union-find in the pure
 *      `structuralSoundness.ts` helper). A second component = a dangling /
 *      floating part.
 *   2. SUPPORT — for a floor-anchored def (not mounted/windowBound/doorBound/
 *      noClip) the union of all boxes reaches the floor (min-Y ≤ 12 mm).
 *      Mounted/window/door-bound defs render at placement-driven heights the
 *      test doesn't supply, so they only get the connectivity assert.
 *
 * ε = 8 mm: two abutting parts modelled with a sub-mm reveal (or exact
 * face-to-face contact) still read as connected, while every genuinely floating
 * part found in the audit (gaps of 19–75 mm) fails. 8 mm sits comfortably below
 * the smallest real defect and above modelling noise; the audit fixes that made
 * this green are logged in docs/furniture-realism-plan.md.
 *
 * The two escape-hatch maps below are the ONLY sanctioned exceptions; each MUST
 * carry a written reason (asserted by a meta-test). A real dangling-part bug is
 * FIXED in the primitive, never suppressed here.
 */
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Box3, Matrix4 } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { BUILTIN_CATALOG } from '../builtinCatalog'
import type { ParametricDef, ParamProps } from '../types'
import { defaultParamProps } from '../types'
import { PRIMITIVE_COMPONENTS } from './index'
import {
  type AABB,
  analyzeStructure,
  componentCentroid,
  connectedComponents,
} from './structuralSoundness'

/** AABB inflation for the adjacency graph. */
const EPS = 0.008
/** Floor-contact tolerance for floor-anchored defs (metres). */
const FLOOR_TOL = 0.012
/** Enum modes tested per def: the default plus up to this many other options. */
const MAX_EXTRA_MODES = 3

/**
 * Connectivity exceptions — a def (or a def in a specific structural-enum mode)
 * that is legitimately NOT one connected AABB component. Key is `defId` (all
 * modes) or `defId::<mode>`. Every entry carries a written reason.
 *
 * These are genuinely-multi-piece objects the AABB model can't unify. (The five
 * 2026-07-17 deferred findings — shower, freestanding bathtub, drying-rack,
 * bird-cage, L-shape staircase — have since been FIXED in their primitives, so
 * they are asserted like everything else and no longer listed here.)
 */
const KNOWN_DISCONNECTED: Record<string, string> = {
  curtains:
    'drapery: two independent gathering fabric panels hang from a separate rod/track — a curtain is multi-piece soft goods, not a rigid assembly.',
  'roller-blind::venetian':
    'venetian mode renders individually-tilting louvre slats (one instance each) suspended on cords — intentionally separate slats, not a solid body (the default roller mode IS one connected sheet and is asserted).',
  'cat-wall-steps':
    'a run of individually wall-mounted cat steps at staggered heights — each step is its own wall fixture (a set of separate shelves), not one connected object.',
}

/**
 * Floor-contact exceptions — defs that legitimately render ABOVE the floor
 * because they are placed ON another surface (counter/desk/table) or a wall.
 * They are still asserted CONNECTED. Key is `defId` (all modes) or
 * `defId::<mode>`. Every entry carries a written reason.
 */
const FLOOR_EXEMPT: Record<string, string> = {
  microwave: 'counter-top appliance — renders at typical worktop height, placed on a counter.',
  monitor: 'desk-top monitor — renders at desk height, placed on a desk.',
  'table-lamp': 'table-top lamp — renders at table height, placed on a table/nightstand.',
  'tabletop-decor': 'table-top decor object — renders at table height, placed on a surface.',
  'fireplace::wall':
    'wall-mounted electric fireplace (default style) renders at wall height; the floor "console" style IS floor-asserted.',
  'bathroom-sink::wall-hung':
    'wall-hung basin renders at its mount height; the pedestal/vanity styles ARE floor-asserted.',
  'flatscreen-tv::wall':
    'wall-mounted TV renders at its mount height; the stand style IS floor-asserted.',
}

const STRUCTURAL_ENUM_KEYS = new Set([
  'style',
  'shape',
  'base',
  'mount',
  'kind',
  'type',
  'variant',
  'layout',
  'orientation',
  'config',
  'doorStyle',
  'endStyle',
  'mattressLevel',
  'headboard',
  'legStyle',
  'form',
  'backStyle',
  'armStyle',
  'mode',
  'top',
])

interface HarnessCase {
  id: string
  def: ParametricDef
  mode: string | null
  props: ParamProps
  anchored: boolean
}

function buildCases(): HarnessCase[] {
  const cases: HarnessCase[] = []
  for (const def of Object.values(BUILTIN_CATALOG)) {
    if (def.kind !== 'parametric') continue
    const anchored = !def.mounted && !def.windowBound && !def.doorBound && !def.noClip
    const structEnum = def.paramSchema.find(
      (f) => f.kind === 'enum' && STRUCTURAL_ENUM_KEYS.has(f.key),
    )
    const base = defaultParamProps(def)
    const defaultMode = structEnum && structEnum.kind === 'enum' ? structEnum.default : null
    cases.push({
      id: defaultMode ? `${def.id} [${structEnum?.key}=${defaultMode}]` : def.id,
      def,
      mode: defaultMode,
      props: base,
      anchored,
    })
    if (structEnum && structEnum.kind === 'enum') {
      const extras = structEnum.options
        .map((o) => o.value)
        .filter((v) => v !== defaultMode)
        .slice(0, MAX_EXTRA_MODES)
      for (const v of extras) {
        cases.push({
          id: `${def.id} [${structEnum.key}=${v}]`,
          def,
          mode: v,
          props: { ...base, [structEnum.key]: v },
          anchored,
        })
      }
    }
  }
  return cases
}

// ---- headless render → world AABBs -----------------------------------------

function makeImageData(w: number, h: number) {
  return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }
}
/** happy-dom has no 2D canvas context; the procedural texture generators call
 *  createImageData/gradients/etc. A permissive stub lets them run (texture
 *  content is irrelevant to geometry — we only need the calls not to throw). */
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
    // Duck-typed (not `instanceof Mesh`): @react-three/test-renderer resolves a
    // separate three module instance, so `instanceof` fails across the boundary.
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
      boxes.push({
        min: [tmp.min.x, tmp.min.y, tmp.min.z],
        max: [tmp.max.x, tmp.max.y, tmp.max.z],
      })
    }
  })
  return boxes
}

async function renderWorldBoxes(def: ParametricDef, props: ParamProps): Promise<AABB[]> {
  const Comp = PRIMITIVE_COMPONENTS[def.primitive]
  const renderer = await ReactThreeTestRenderer.create(<Comp props={props} />)
  const scene = (renderer.scene as unknown as { instance: ObjLike }).instance
  const boxes = collectWorldBoxes(scene)
  await renderer.unmount()
  return boxes
}

function exempt(map: Record<string, string>, defId: string, mode: string | null): boolean {
  return map[defId] != null || (mode != null && map[`${defId}::${mode}`] != null)
}

// ---- tests ------------------------------------------------------------------

// Performance tier → the cheap non-GL material fallbacks (e.g. MirrorMaterial's
// fake-shiny pane instead of the planar reflector, which would need real GL).
// showCeilingFixtures → CeilingLight renders its body (it returns null when the
// fixtures are hidden, which is the store default).
useStore.setState({ qualityTier: 'performance', showCeilingFixtures: true })
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeCtx() as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  )
})

const CASES = buildCases()

describe('structural soundness — every parametric primitive is one grounded assembly', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const boxes = await renderWorldBoxes(c.def, c.props)
    expect(boxes.length, `${c.id}: rendered no geometry`).toBeGreaterThan(0)

    const report = analyzeStructure(boxes, EPS)

    if (!exempt(KNOWN_DISCONNECTED, c.def.id, c.mode)) {
      if (report.componentCount !== 1) {
        const comps = connectedComponents(boxes, EPS)
        const detail = comps
          .map((comp, i) => {
            const cen = componentCentroid(boxes, comp)
            return `  comp${i} (${comp.length} box) @ [${cen.map((v) => v.toFixed(3)).join(', ')}]`
          })
          .join('\n')
        throw new Error(
          `${c.id}: expected 1 connected component, got ${report.componentCount} ` +
            `(nearest gap ${(report.largestGap * 1000).toFixed(1)} mm > ${EPS * 1000} mm). ` +
            `A part is dangling/floating:\n${detail}`,
        )
      }
    }

    if (c.anchored && !exempt(FLOOR_EXEMPT, c.def.id, c.mode)) {
      expect(
        report.minY,
        `${c.id}: floor-anchored def does not reach the floor (min-Y ${(report.minY * 1000).toFixed(1)} mm > ${FLOOR_TOL * 1000} mm)`,
      ).toBeLessThanOrEqual(FLOOR_TOL)
    }
  })
})

describe('escape-hatch hygiene', () => {
  const allIds = new Set(Object.keys(BUILTIN_CATALOG))
  const check = (map: Record<string, string>, label: string) => {
    for (const [key, reason] of Object.entries(map)) {
      it(`${label}[${key}] has a reason and refers to a real def`, () => {
        expect(reason.trim().length, `${key}: empty reason`).toBeGreaterThan(0)
        expect(allIds.has(key.split('::')[0]), `${key}: unknown def id`).toBe(true)
      })
    }
  }
  check(KNOWN_DISCONNECTED, 'KNOWN_DISCONNECTED')
  check(FLOOR_EXEMPT, 'FLOOR_EXEMPT')
})
