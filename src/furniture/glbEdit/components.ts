/**
 * GLB Asset Designer — Stage 3b fittings/component library. A curated set of
 * parametric furniture FITTINGS (legs, handles/pulls, feet, hinges), each a PURE
 * builder that emits an ordinary `ShapePart[]` in COMPONENT-LOCAL space. A placed
 * component is wrapped in a `PartGroup` named after it (`componentPlace.ts`), so
 * once it lands it is just editable parts + a transform group — no new part kind,
 * no bespoke render path. Everything here is three-light (a little `three` math
 * for angled rods) and unit-testable on the CPU.
 *
 * ## Local frame + mount convention (read `componentPlace.ts` for the transform)
 * A component declares a `mount` that fixes which local axis is aligned to the
 * clicked face normal at placement time:
 *   - **`floor`** (legs, feet) — the component hangs DOWN from its attach point:
 *     built with its TOP at local `y = 0` and its body extending into `−Y`. The
 *     local mount axis is `(0, −1, 0)`, so on a table UNDERSIDE (normal `(0,−1,0)`)
 *     it drops straight down and its top sits flush on the underside plane; on the
 *     FLOOR (normal `(0,1,0)`) it flips to stand up.
 *   - **`wall`** (handles, pulls, knobs, hinges) — the component protrudes OUT of
 *     a vertical face: built protruding along local `+Z`, long axis along `X`,
 *     centred on the surface plane at `z = 0`. The local mount axis is `(0,0,1)`,
 *     so on a drawer front (normal `(0,0,1)`) the bar stays horizontal.
 *
 * Sizes are real metres. Finishes use the plain `ShapePart` colour/roughness/
 * metalness fields (no `mat:<id>` catalog textures — a fitting is small hardware,
 * not a photoreal surface).
 */

import { Euler, Quaternion, Vector3 } from 'three'
import { newPartId, type ShapePart } from './editSpec'
import { LATHE_PRESETS } from './shapeProfiles'

/** Which local axis a component aligns to the clicked face normal (see header). */
export type ComponentMount = 'floor' | 'wall'

/** Palette-grouping for the Components UI. */
export type ComponentCategory = 'Legs' | 'Handles' | 'Feet' | 'Hinges'

/** One exposed numeric parameter (metres), clamped to `[min, max]`. */
interface ComponentParam {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

export interface ComponentDef {
  id: string
  name: string
  category: ComponentCategory
  mount: ComponentMount
  params: ComponentParam[]
  /** Pure builder — receives fully-resolved (clamped, defaulted) params and emits
   *  component-local `ShapePart`s with fresh ids. */
  build: (p: Record<string, number>) => ShapePart[]
}

// --- Finish presets (plain ShapePart material fields) ----------------------
type Look = Pick<ShapePart, 'color' | 'roughness' | 'metalness'>
const WOOD: Look = { color: '#7a5636', roughness: 0.55, metalness: 0.05 }
const STEEL: Look = { color: '#c4c8ce', roughness: 0.3, metalness: 0.9 }
const BLACK_STEEL: Look = { color: '#26282c', roughness: 0.45, metalness: 0.8 }
const RUBBER: Look = { color: '#2a2a2d', roughness: 0.85, metalness: 0.05 }

/** Make one component-local part with a fresh id. */
function mk(
  kind: ShapePart['kind'],
  size: [number, number, number],
  position: [number, number, number],
  look: Look,
  extra?: Partial<ShapePart>,
): ShapePart {
  return { id: newPartId(), kind, size, position, ...look, ...extra }
}

/** A cylinder rod spanning `a → b` (metres), radius `r`. Rotation is derived so
 *  the cylinder's +Y axis points along `b − a` — used by the hairpin/angled legs
 *  and arc pull where a member isn't axis-aligned. */
function rod(
  a: [number, number, number],
  b: [number, number, number],
  r: number,
  look: Look,
): ShapePart {
  const va = new Vector3(a[0], a[1], a[2])
  const vb = new Vector3(b[0], b[1], b[2])
  const dir = new Vector3().subVectors(vb, va)
  const len = Math.max(0.001, dir.length())
  const mid = new Vector3().addVectors(va, vb).multiplyScalar(0.5)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize())
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  const deg = [e.x, e.y, e.z].map((rad) => {
    const d = Number(((rad * 180) / Math.PI).toFixed(3))
    return d === 0 ? 0 : d
  }) as [number, number, number]
  return mk('cylinder', [r * 2, len, r * 2], [mid.x, mid.y, mid.z], look, {
    rotation: deg.every((v) => v === 0) ? undefined : deg,
  })
}

/** Dome/bun foot revolve profile (x = radius fraction, y = height fraction,
 *  bottom → top) — widest at the top (attach) curving to a rounded floor contact. */
const DOME_PROFILE: [number, number][] = [
  [0, 0],
  [0.5, 0.12],
  [0.82, 0.34],
  [0.97, 0.66],
  [1, 1],
]

// ---------------------------------------------------------------------------
// The curated library (13 fittings). Ordered by category for the palette.
// ---------------------------------------------------------------------------
export const COMPONENT_LIBRARY: ComponentDef[] = [
  // ---- Legs (floor mount) -------------------------------------------------
  {
    id: 'leg-tapered-round',
    name: 'Tapered leg',
    category: 'Legs',
    mount: 'floor',
    params: [
      { key: 'height', label: 'Height (m)', min: 0.12, max: 0.75, step: 0.01, default: 0.42 },
      { key: 'diameter', label: 'Top ⌀ (m)', min: 0.03, max: 0.1, step: 0.005, default: 0.055 },
    ],
    build: ({ height, diameter }) => [
      mk('lathe', [diameter, height, diameter], [0, -height / 2, 0], WOOD, {
        profile: LATHE_PRESETS['tapered-leg'].map((p) => [...p] as [number, number]),
        segments: 24,
      }),
    ],
  },
  {
    id: 'leg-straight-round',
    name: 'Round leg',
    category: 'Legs',
    mount: 'floor',
    params: [
      { key: 'height', label: 'Height (m)', min: 0.12, max: 0.75, step: 0.01, default: 0.4 },
      { key: 'diameter', label: '⌀ (m)', min: 0.025, max: 0.09, step: 0.005, default: 0.05 },
    ],
    build: ({ height, diameter }) => [
      mk('cylinder', [diameter, height, diameter], [0, -height / 2, 0], WOOD),
    ],
  },
  {
    id: 'leg-straight-square',
    name: 'Square leg',
    category: 'Legs',
    mount: 'floor',
    params: [
      { key: 'height', label: 'Height (m)', min: 0.12, max: 0.75, step: 0.01, default: 0.4 },
      { key: 'width', label: 'Width (m)', min: 0.025, max: 0.09, step: 0.005, default: 0.05 },
    ],
    build: ({ height, width }) => [
      mk('box', [width, height, width], [0, -height / 2, 0], WOOD, {
        bevel: Math.min(0.004, width / 4),
      }),
    ],
  },
  {
    id: 'leg-hairpin',
    name: 'Hairpin leg',
    category: 'Legs',
    mount: 'floor',
    params: [
      { key: 'height', label: 'Height (m)', min: 0.1, max: 0.75, step: 0.01, default: 0.4 },
      { key: 'diameter', label: 'Rod ⌀ (m)', min: 0.006, max: 0.016, step: 0.001, default: 0.01 },
    ],
    build: ({ height, diameter }) => {
      const r = diameter / 2
      const splay = Math.max(0.04, height * 0.16)
      const parts: ShapePart[] = [
        // Small mounting plate at the top.
        mk('box', [0.05, 0.004, 0.05], [0, -0.002, 0], STEEL),
      ]
      // Three rods splaying from just under the plate down to floor points.
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2
        parts.push(
          rod([0, -0.004, 0], [splay * Math.cos(ang), -height, splay * Math.sin(ang)], r, STEEL),
        )
      }
      return parts
    },
  },
  {
    id: 'leg-angled-mid-century',
    name: 'Angled leg',
    category: 'Legs',
    mount: 'floor',
    params: [
      { key: 'height', label: 'Height (m)', min: 0.12, max: 0.6, step: 0.01, default: 0.36 },
      { key: 'diameter', label: '⌀ (m)', min: 0.02, max: 0.06, step: 0.005, default: 0.035 },
    ],
    build: ({ height, diameter }) => {
      // Splay ~9° outward toward +X (mirrored to each corner by "Repeat").
      const a = (9 * Math.PI) / 180
      return [rod([0, 0, 0], [Math.sin(a) * height, -Math.cos(a) * height, 0], diameter / 2, WOOD)]
    },
  },

  // ---- Handles / pulls (wall mount) --------------------------------------
  {
    id: 'handle-bar-pull',
    name: 'Bar pull',
    category: 'Handles',
    mount: 'wall',
    params: [
      { key: 'length', label: 'Length (m)', min: 0.06, max: 0.4, step: 0.005, default: 0.16 },
      {
        key: 'standoff',
        label: 'Standoff (m)',
        min: 0.018,
        max: 0.05,
        step: 0.002,
        default: 0.032,
      },
    ],
    build: ({ length, standoff }) => {
      const barR = 0.006
      const postR = 0.005
      const bx = length / 2 - Math.min(0.02, length * 0.12)
      return [
        // Bar along X, standing off the surface.
        mk('cylinder', [barR * 2, length, barR * 2], [0, 0, standoff], STEEL, {
          rotation: [0, 0, 90],
        }),
        mk('cylinder', [postR * 2, standoff, postR * 2], [-bx, 0, standoff / 2], STEEL, {
          rotation: [90, 0, 0],
        }),
        mk('cylinder', [postR * 2, standoff, postR * 2], [bx, 0, standoff / 2], STEEL, {
          rotation: [90, 0, 0],
        }),
      ]
    },
  },
  {
    id: 'handle-arc-pull',
    name: 'Arc pull',
    category: 'Handles',
    mount: 'wall',
    params: [
      { key: 'length', label: 'Length (m)', min: 0.08, max: 0.4, step: 0.005, default: 0.18 },
    ],
    build: ({ length }) => {
      const s = 0.03
      const barR = 0.006
      const half = length / 2
      const barHalf = Math.max(0.02, half - 0.02)
      return [
        mk('cylinder', [barR * 2, barHalf * 2, barR * 2], [0, 0, s], STEEL, {
          rotation: [0, 0, 90],
        }),
        // Angled posts from surface up to the raised bar ends → a bowed arc.
        rod([-half, 0, 0.002], [-barHalf, 0, s], 0.005, STEEL),
        rod([half, 0, 0.002], [barHalf, 0, s], 0.005, STEEL),
      ]
    },
  },
  {
    id: 'knob-round',
    name: 'Round knob',
    category: 'Handles',
    mount: 'wall',
    params: [
      { key: 'diameter', label: '⌀ (m)', min: 0.018, max: 0.05, step: 0.002, default: 0.03 },
    ],
    build: ({ diameter }) => {
      const stem = 0.012
      return [
        mk('cylinder', [0.008, stem, 0.008], [0, 0, stem / 2], STEEL, { rotation: [90, 0, 0] }),
        mk('sphere', [diameter, diameter, diameter], [0, 0, stem + diameter * 0.4], STEEL),
      ]
    },
  },
  {
    id: 'pull-recessed-groove',
    name: 'Recessed pull',
    category: 'Handles',
    mount: 'wall',
    params: [
      { key: 'length', label: 'Length (m)', min: 0.06, max: 0.3, step: 0.005, default: 0.12 },
    ],
    // Approximation of a milled finger groove — a slim, low-profile rounded lip
    // sitting nearly flush to the surface (no CSG cut needed on placement).
    build: ({ length }) => [
      mk('box', [length, 0.022, 0.01], [0, 0, 0.004], STEEL, { bevel: 0.004 }),
    ],
  },

  // ---- Feet (floor mount) -------------------------------------------------
  {
    id: 'foot-dome',
    name: 'Dome foot',
    category: 'Feet',
    mount: 'floor',
    params: [
      { key: 'diameter', label: '⌀ (m)', min: 0.025, max: 0.08, step: 0.005, default: 0.05 },
    ],
    build: ({ diameter }) => {
      const h = diameter * 0.55
      return [
        mk('lathe', [diameter, h, diameter], [0, -h / 2, 0], RUBBER, {
          profile: DOME_PROFILE.map((p) => [...p] as [number, number]),
          segments: 24,
        }),
      ]
    },
  },
  {
    id: 'foot-cylinder-puck',
    name: 'Puck foot',
    category: 'Feet',
    mount: 'floor',
    params: [
      { key: 'diameter', label: '⌀ (m)', min: 0.025, max: 0.08, step: 0.005, default: 0.05 },
      { key: 'height', label: 'Height (m)', min: 0.008, max: 0.05, step: 0.002, default: 0.02 },
    ],
    build: ({ diameter, height }) => [
      mk('cylinder', [diameter, height, diameter], [0, -height / 2, 0], BLACK_STEEL),
    ],
  },
  {
    id: 'foot-castor',
    name: 'Castor',
    category: 'Feet',
    mount: 'floor',
    params: [
      { key: 'diameter', label: 'Wheel ⌀ (m)', min: 0.03, max: 0.07, step: 0.005, default: 0.045 },
      { key: 'stemHeight', label: 'Stem (m)', min: 0.02, max: 0.08, step: 0.005, default: 0.04 },
    ],
    build: ({ diameter, stemHeight }) => [
      mk('cylinder', [0.018, stemHeight, 0.018], [0, -stemHeight / 2, 0], STEEL),
      mk('sphere', [diameter, diameter, diameter], [0, -stemHeight - diameter * 0.35, 0], RUBBER),
    ],
  },

  // ---- Hinges (wall mount) ------------------------------------------------
  {
    id: 'hinge-butt',
    name: 'Butt hinge',
    category: 'Hinges',
    mount: 'wall',
    params: [
      { key: 'length', label: 'Length (m)', min: 0.04, max: 0.14, step: 0.005, default: 0.075 },
    ],
    build: ({ length }) => {
      const pinR = 0.005
      const leafW = 0.03
      const leafT = 0.004
      const off = leafW / 2 + pinR * 0.6
      return [
        // Knuckle pin (vertical, along the seam) + the two leaves either side.
        mk('cylinder', [pinR * 2, length, pinR * 2], [0, 0, leafT / 2 + pinR], STEEL),
        mk('box', [leafW, length, leafT], [-off, 0, leafT / 2], STEEL),
        mk('box', [leafW, length, leafT], [off, 0, leafT / 2], STEEL),
      ]
    },
  },
]

/** Category display order for the palette. */
export const COMPONENT_CATEGORIES: ComponentCategory[] = ['Legs', 'Handles', 'Feet', 'Hinges']

/** Look up a component definition by id (null when unknown). */
export function componentById(id: string): ComponentDef | null {
  return COMPONENT_LIBRARY.find((c) => c.id === id) ?? null
}

/** Resolve overrides into a full, clamped param map (missing/garbage → default). */
export function resolveComponentParams(
  def: ComponentDef,
  overrides: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of def.params) {
    const raw = overrides[p.key]
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.default
    out[p.key] = Math.min(p.max, Math.max(p.min, v))
  }
  return out
}

/** Build a component's `ShapePart[]` from (optionally partial) overrides — the
 *  single entry point the UI + placement use. Params are always clamped first. */
export function buildComponentParts(
  def: ComponentDef,
  overrides: Record<string, number> = {},
): ShapePart[] {
  return def.build(resolveComponentParams(def, overrides))
}
