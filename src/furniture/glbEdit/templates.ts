/**
 * GLB Asset Designer — Stage 3c template-first flows. A curated set of ARCHETYPE
 * STARTERS (dining/coffee table, bookshelf, cabinet, bed frame, sofa frame), each
 * a PURE builder that emits an ordinary `ShapePart[]` plus one wrapping
 * `PartGroup` in the app's asset frame (footprint-centred on X/Z, floor-anchored
 * at y=0, front toward +Z). Everything here is three-light (a little math + reuse
 * of `components.ts` / `parametric/buildParts.ts` / `finishPresets.ts`) and
 * unit-testable on the CPU.
 *
 * ## The parametric→designer bridge ruling (recorded in docs/asset-studio-plan.md)
 * A template FLATTENS to plain parts at insertion (option b) — it is NOT a live
 * parametric recipe embedded in the spec. Templates seed an editable starting
 * point (Tylko "start from a working piece"), then the user owns the parts. The
 * approachability win is kept by making the *dialog* parametric: the user tunes
 * ergonomic sliders (clamped to real furniture standards) with a live preview
 * BEFORE inserting, and the insert flattens the previewed geometry. No new spec
 * field, no persistence bump — a template is just parts + a group, exactly like a
 * placed component (already covered by the v4 `partGroups` envelope).
 *
 * ## Ergonomic clamps
 * Every param is clamped to an ergonomic range (from docs/interior-design-guidelines.md
 * + standard furniture dimensions) so proportions are right by construction; the
 * default is the sweet spot. Each param carries a `hint` naming the standard,
 * shown under its slider.
 */

import { buildParametric, type ParametricPart } from '../parametric/buildParts'
import { defaultSpec } from '../parametric/spec'
import { buildComponentParts, componentById } from './components'
import {
  type AssetEditSpec,
  createEmptySpec,
  newPartGroupId,
  newPartId,
  type PartGroup,
  partGroups,
  type ShapePart,
} from './editSpec'
import { applyFinishPreset } from './finishPresets'

/** One exposed slider param. Metres unless `unit` says otherwise; clamped to
 *  `[min, max]`. `presetLabels`, when set, makes the slider step through named
 *  presets (index param, e.g. mattress size) — the readout shows the label. */
export interface TemplateParam {
  key: string
  label: string
  /** Readout unit suffix ('m', 'shelves', 'doors', '' for an index param). */
  unit: string
  min: number
  max: number
  step: number
  default: number
  /** Ergonomic standard named for the slider's hint line, e.g.
   *  "Standard dining height 0.75 m". */
  hint: string
  /** Discrete preset labels (index param) — the slider steps 0…n-1 through them. */
  presetLabels?: string[]
}

/** A template's flattened output: parts + one wrapping transform group holding
 *  all of them (so the inserted piece has a single move handle, and can be
 *  ungrouped to edit members). */
export interface TemplateResult {
  parts: ShapePart[]
  groups: PartGroup[]
}

export interface TemplateDef {
  id: string
  name: string
  /** Suggested catalog category + save-name seed for the piece. */
  category: 'tables' | 'storage' | 'beds' | 'seating'
  params: TemplateParam[]
  /** Pure builder — receives fully-resolved (clamped) params and emits the
   *  flattened parts + wrapping group. */
  build: (p: Record<string, number>) => TemplateResult
}

// --- Surface looks (plain ShapePart material fields; no mat:<id> textures so a
// --- starter renders immediately without a catalog material build) ------------
type Look = Pick<ShapePart, 'color' | 'roughness' | 'metalness'>
const WOOD: Look = { color: '#9a7b50', roughness: 0.5, metalness: 0.05 }
const DARK_WOOD: Look = { color: '#6e5337', roughness: 0.5, metalness: 0.05 }
const PANEL: Look = { color: '#e8e4dc', roughness: 0.55, metalness: 0.03 }
const FABRIC: Look = { color: '#8a8f98', roughness: 0.7, metalness: 0.02 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Make one part with a fresh id (box unless overridden). */
function box(
  size: [number, number, number],
  position: [number, number, number],
  look: Look,
  extra?: Partial<ShapePart>,
): ShapePart {
  return { id: newPartId(), kind: 'box', size, position, ...look, ...extra }
}

/** Translate a list of parts by `[dx, dy, dz]` (used to seat a component's
 *  local-frame parts at a mount point). Keeps their fresh ids. */
function translateParts(parts: ShapePart[], d: [number, number, number]): ShapePart[] {
  return parts.map((p) => ({
    ...p,
    position: [p.position[0] + d[0], p.position[1] + d[1], p.position[2] + d[2]],
  }))
}

/** Build + seat a `components.ts` fitting at a world mount point. A `floor`
 *  fitting (leg/foot) hangs from its local `y=0`, so seat its top at `at[1]`; a
 *  `wall` fitting (handle) protrudes local `+Z`, so seat it on the face plane. */
function fitting(
  componentId: string,
  overrides: Record<string, number>,
  at: [number, number, number],
): ShapePart[] {
  const def = componentById(componentId)
  if (!def) return []
  return translateParts(buildComponentParts(def, overrides), at)
}

/** Wrap parts in one named transform group (identity transform — the insert
 *  offset is applied later by `insertTemplate`). */
function wrap(parts: ShapePart[], name: string): TemplateResult {
  const group: PartGroup = { id: newPartGroupId(), name, partIds: parts.map((p) => p.id) }
  return { parts, groups: [group] }
}

// ============================================================================
// Shared table builder (dining + coffee differ only in defaults/ranges)
// ============================================================================

function buildTable(w: number, d: number, h: number, topT: number, name: string): TemplateResult {
  const parts: ShapePart[] = []
  // Tabletop.
  parts.push(box([w, topT, d], [0, h - topT / 2, 0], WOOD, { bevel: Math.min(0.01, topT / 2) }))
  // Four tapered legs (reuse the components.ts fitting), floor → underside.
  const underside = h - topT
  const inset = 0.1
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        ...fitting('leg-tapered-round', { height: underside, diameter: 0.06 }, [
          sx * (w / 2 - inset),
          underside,
          sz * (d / 2 - inset),
        ]),
      )
    }
  }
  return wrap(parts, name)
}

// ============================================================================
// Cabinet / sideboard — carcass + N doors (bar pulls) + puck feet
// ============================================================================

const PANEL_T = 0.018
const BACK_T = 0.012
const DOOR_T = 0.018
const REVEAL = 0.004
const FOOT_H = 0.05

function buildCabinet(w: number, h: number, d: number, doors: number): TemplateResult {
  const parts: ShapePart[] = []
  const n = clamp(Math.round(doors), 2, 4)
  // Puck feet at the four corners raise the carcass off the floor.
  const footInset = 0.06
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        ...fitting('foot-cylinder-puck', { diameter: 0.05, height: FOOT_H }, [
          sx * (w / 2 - footInset),
          FOOT_H,
          sz * (d / 2 - footInset),
        ]),
      )
    }
  }
  const bottom = FOOT_H
  const carcassH = h - bottom
  const innerW = w - PANEL_T * 2
  // Sides (floor-side carcass), top, bottom, back.
  for (const sx of [-1, 1]) {
    parts.push(
      box([PANEL_T, carcassH, d], [sx * (w / 2 - PANEL_T / 2), bottom + carcassH / 2, 0], WOOD),
    )
  }
  parts.push(box([innerW, PANEL_T, d], [0, h - PANEL_T / 2, 0], WOOD))
  parts.push(box([innerW, PANEL_T, d], [0, bottom + PANEL_T / 2, 0], WOOD))
  parts.push(box([innerW, carcassH, BACK_T], [0, bottom + carcassH / 2, -d / 2 + BACK_T / 2], WOOD))
  // Doors across the front + a bar pull on each.
  const doorH = carcassH - 2 * REVEAL
  const doorY = bottom + REVEAL + doorH / 2
  const leafW = (innerW - REVEAL * (n - 1)) / n
  const frontZ = d / 2
  for (let i = 0; i < n; i++) {
    const lx = -innerW / 2 + leafW / 2 + i * (leafW + REVEAL)
    parts.push(box([leafW - REVEAL, doorH, DOOR_T], [lx, doorY, frontZ + DOOR_T / 2], PANEL))
    // Bar pull near the door's inner edge (hinge on the outer edge).
    const hinge = i < n / 2 ? 1 : -1
    parts.push(
      ...fitting('handle-bar-pull', { length: Math.min(0.12, leafW * 0.5), standoff: 0.03 }, [
        lx + hinge * (leafW / 2 - 0.06),
        doorY,
        frontZ + DOOR_T,
      ]),
    )
  }
  return wrap(parts, 'Cabinet')
}

// ============================================================================
// Bed frame — platform + headboard + 4 legs (by SG mattress preset)
// ============================================================================

/** SG mattress footprints (metres): [width, length]. Index-matched to the bed
 *  template's `size` preset labels. */
const MATTRESS_SIZES: [number, number][] = [
  [0.91, 1.9], // Single
  [1.07, 1.9], // Super single
  [1.52, 1.9], // Queen
  [1.82, 1.9], // King
]

function buildBed(sizeIndex: number, frameH: number): TemplateResult {
  const [mw, ml] = MATTRESS_SIZES[clamp(Math.round(sizeIndex), 0, MATTRESS_SIZES.length - 1)]
  const parts: ShapePart[] = []
  const overhang = 0.04
  const platformT = 0.08
  const w = mw + overhang * 2
  const l = ml + overhang * 2
  const platformTop = frameH
  // Platform slab (the mattress sits on top of it).
  parts.push(box([w, platformT, l], [0, platformTop - platformT / 2, 0], WOOD))
  // Four square legs (reuse the fitting), floor → platform underside.
  const legTop = platformTop - platformT
  const legInset = 0.09
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        ...fitting('leg-straight-square', { height: Math.max(0.06, legTop), width: 0.06 }, [
          sx * (w / 2 - legInset),
          legTop,
          sz * (l / 2 - legInset),
        ]),
      )
    }
  }
  // Headboard rising from the platform at the head end (-Z, flush).
  const hbH = 0.45
  const hbT = 0.05
  parts.push(
    box([w, hbH, hbT], [0, platformTop + hbH / 2, -l / 2 + hbT / 2], DARK_WOOD, { bevel: 0.01 }),
  )
  return wrap(parts, 'Bed frame')
}

// ============================================================================
// Sofa frame — base + back + 2 arms + 4 legs + seat/back cushions (velvet)
// ============================================================================

function buildSofa(w: number, d: number, seatH: number): TemplateResult {
  const parts: ShapePart[] = []
  const cushionThk = 0.14
  const baseT = 0.12
  const baseTop = seatH - cushionThk // cushions rest on the base up to seatH
  const baseBottom = baseTop - baseT
  const legH = Math.max(0.08, baseBottom)
  const armW = 0.16
  const armTop = seatH + 0.12
  const backT = 0.14
  const backTop = seatH + 0.34
  // Four tapered legs, floor → base underside.
  const legInset = 0.1
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        ...fitting('leg-tapered-round', { height: legH, diameter: 0.055 }, [
          sx * (w / 2 - legInset),
          legH,
          sz * (d / 2 - legInset),
        ]),
      )
    }
  }
  // Seat base frame (spans between the arms).
  const innerW = w - armW * 2
  parts.push(box([innerW, baseT, d], [0, baseBottom + baseT / 2, 0], DARK_WOOD))
  // Backrest along the rear.
  parts.push(
    box(
      [w, backTop - baseBottom, backT],
      [0, (backTop + baseBottom) / 2, -d / 2 + backT / 2],
      FABRIC,
    ),
  )
  // Two arms.
  for (const sx of [-1, 1]) {
    parts.push(
      box(
        [armW, armTop - baseBottom, d],
        [sx * (w / 2 - armW / 2), (armTop + baseBottom) / 2, 0],
        FABRIC,
      ),
    )
  }
  // Seat + back cushions, velvet finish (finishPresets bundle).
  const velvet = applyFinishPreset('velvet')
  const nCush = clamp(Math.round(innerW / 0.65), 1, 4)
  const cushW = (innerW - REVEAL * (nCush + 1)) / nCush
  const cushD = d - backT - 0.1
  for (let i = 0; i < nCush; i++) {
    const cx = -innerW / 2 + REVEAL * (i + 1) + cushW * (i + 0.5)
    // Seat cushion (top at seatH).
    parts.push(
      box(
        [cushW, cushionThk, cushD],
        [cx, seatH - cushionThk / 2, (d - backT) / 2 - cushD / 2 - 0.02],
        FABRIC,
        velvet,
      ),
    )
    // Back cushion, leaning against the backrest.
    const backCushH = backTop - seatH - 0.02
    parts.push(
      box(
        [cushW, backCushH, 0.12],
        [cx, seatH + backCushH / 2, -d / 2 + backT + 0.06],
        FABRIC,
        velvet,
      ),
    )
  }
  return wrap(parts, 'Sofa frame')
}

// ============================================================================
// The library
// ============================================================================

/** Shared param specs reused across the two tables. */
const DEPTH_HINT = '0.45–0.6 m keeps it within reach'

export const TEMPLATE_LIBRARY: TemplateDef[] = [
  {
    id: 'dining-table',
    name: 'Dining table',
    category: 'tables',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 0.9,
        max: 2.4,
        step: 0.05,
        default: 1.4,
        hint: 'Seats 4–8; tops run 1.2–2.0 m wide',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.75,
        max: 1.1,
        step: 0.05,
        default: 0.9,
        hint: '0.8–1.0 m lets diners face across',
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'm',
        min: 0.72,
        max: 0.78,
        step: 0.01,
        default: 0.75,
        hint: 'Standard dining height 0.75 m',
      },
      {
        key: 'topThickness',
        label: 'Top thickness',
        unit: 'm',
        min: 0.02,
        max: 0.05,
        step: 0.005,
        default: 0.03,
        hint: 'Tabletops are 25–40 mm thick',
      },
    ],
    build: (p) => buildTable(p.width, p.depth, p.height, p.topThickness, 'Dining table'),
  },
  {
    id: 'coffee-table',
    name: 'Coffee table',
    category: 'tables',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 0.6,
        max: 1.4,
        step: 0.05,
        default: 1.1,
        hint: "About two-thirds of the sofa's width",
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.4,
        max: 0.8,
        step: 0.05,
        default: 0.55,
        hint: DEPTH_HINT,
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'm',
        min: 0.35,
        max: 0.5,
        step: 0.01,
        default: 0.42,
        hint: 'Level with the sofa seat (0.40–0.45 m)',
      },
      {
        key: 'topThickness',
        label: 'Top thickness',
        unit: 'm',
        min: 0.02,
        max: 0.04,
        step: 0.005,
        default: 0.03,
        hint: 'Tabletops are 20–40 mm thick',
      },
    ],
    build: (p) => buildTable(p.width, p.depth, p.height, p.topThickness, 'Coffee table'),
  },
  {
    id: 'bookshelf',
    name: 'Bookshelf',
    category: 'storage',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 0.4,
        max: 1.2,
        step: 0.05,
        default: 0.8,
        hint: 'Bays over 1.2 m get a divider automatically',
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'm',
        min: 0.6,
        max: 2.4,
        step: 0.05,
        default: 1.8,
        hint: 'Up to 2.4 m; leave a reach to the ceiling',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.25,
        max: 0.4,
        step: 0.01,
        default: 0.3,
        hint: 'Shelf depth 0.25–0.40 m holds most books',
      },
      {
        key: 'shelves',
        label: 'Shelves',
        unit: 'shelves',
        min: 1,
        max: 8,
        step: 1,
        default: 4,
        hint: 'Shelves space ~0.35 m apart',
      },
    ],
    build: (p) => buildBookshelf(p.width, p.height, p.depth, p.shelves),
  },
  {
    id: 'cabinet',
    name: 'Cabinet',
    category: 'storage',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 0.8,
        max: 2.4,
        step: 0.05,
        default: 1.4,
        hint: 'TV consoles run 1.2–1.8 m',
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'm',
        min: 0.7,
        max: 0.95,
        step: 0.01,
        default: 0.8,
        hint: 'Sideboards stand 0.75–0.90 m',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.35,
        max: 0.55,
        step: 0.01,
        default: 0.45,
        hint: '0.4–0.5 m deep clears media boxes',
      },
      {
        key: 'doors',
        label: 'Doors',
        unit: 'doors',
        min: 2,
        max: 4,
        step: 1,
        default: 2,
        hint: 'Each door leaf stays under 0.6 m',
      },
    ],
    build: (p) => buildCabinet(p.width, p.height, p.depth, p.doors),
  },
  {
    id: 'bed-frame',
    name: 'Bed frame',
    category: 'beds',
    params: [
      {
        key: 'size',
        label: 'Mattress size',
        unit: '',
        min: 0,
        max: 3,
        step: 1,
        default: 2,
        presetLabels: ['Single', 'Super single', 'Queen', 'King'],
        hint: 'SG sizes: Single 0.91, S.single 1.07, Queen 1.52, King 1.82 m',
      },
      {
        key: 'height',
        label: 'Frame height',
        unit: 'm',
        min: 0.25,
        max: 0.45,
        step: 0.01,
        default: 0.3,
        hint: 'Mattress base 0.25–0.35 m (add the mattress for sit height)',
      },
    ],
    build: (p) => buildBed(p.size, p.height),
  },
  {
    id: 'sofa-frame',
    name: 'Sofa frame',
    category: 'seating',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 1.4,
        max: 2.6,
        step: 0.05,
        default: 1.95,
        hint: '2-seater ~1.6 m, 3-seater ~2.1 m',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.8,
        max: 1.0,
        step: 0.02,
        default: 0.9,
        hint: 'Sofa depth 0.85–0.95 m',
      },
      {
        key: 'seatHeight',
        label: 'Seat height',
        unit: 'm',
        min: 0.4,
        max: 0.48,
        step: 0.01,
        default: 0.43,
        hint: 'Seat height 0.40–0.45 m',
      },
    ],
    build: (p) => buildSofa(p.width, p.depth, p.seatHeight),
  },
]

/** A `ParametricPart` (box role) → designer `ShapePart` adapter — the bookshelf
 *  template REUSES `parametric/buildParts.ts` rather than re-deriving carcass
 *  geometry (the parts map cleanly: both are footprint-centred, floor-anchored
 *  boxes). */
function parametricPartToShape(pp: ParametricPart): ShapePart {
  return box([...pp.size], [...pp.position], WOOD)
}

function buildBookshelf(w: number, h: number, d: number, shelves: number): TemplateResult {
  const model = buildParametric({
    ...defaultSpec('bookshelf'),
    width: w,
    height: h,
    depth: d,
    shelves: clamp(Math.round(shelves), 1, 8),
  })
  return wrap(model.parts.map(parametricPartToShape), 'Bookshelf')
}

/** Look up a template by id (null when unknown). */
export function templateById(id: string): TemplateDef | null {
  return TEMPLATE_LIBRARY.find((t) => t.id === id) ?? null
}

/** Resolve (optionally partial) overrides into a full, clamped param map —
 *  missing/garbage → the param default; every value clamped to `[min, max]` and
 *  rounded for integer/preset params. */
export function resolveTemplateParams(
  def: TemplateDef,
  overrides: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of def.params) {
    const raw = overrides[p.key]
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.default
    const clamped = clamp(v, p.min, p.max)
    // Integer / preset params snap to whole steps.
    const isInt = !!p.presetLabels || p.unit === 'shelves' || p.unit === 'doors'
    out[p.key] = isInt ? Math.round(clamped) : clamped
  }
  return out
}

/** Build a template's flattened parts + wrapping group from (optionally partial)
 *  overrides — the single entry point the UI + insertion use. Params are always
 *  clamped first. */
export function buildTemplate(
  def: TemplateDef,
  overrides: Record<string, number> = {},
): TemplateResult {
  return def.build(resolveTemplateParams(def, overrides))
}

/** Gap (m) between existing content and an inserted-alongside template. */
const INSERT_GAP_M = 0.3

/** The greatest world-X extent of the spec's existing parts (accounting for any
 *  transform-group offset), or `null` when the spec has no parts. */
function specMaxWorldX(spec: AssetEditSpec): number | null {
  if (spec.parts.length === 0) return null
  const groupX = new Map<string, number>()
  for (const g of partGroups(spec)) {
    const gx = g.position?.[0] ?? 0
    for (const id of g.partIds) groupX.set(id, gx)
  }
  let max = -Infinity
  for (const p of spec.parts) {
    const gx = groupX.get(p.id) ?? 0
    max = Math.max(max, p.position[0] + gx + p.size[0] / 2)
  }
  return max
}

/** A template's half-width in its local frame (max |x| + size/2 over parts). */
function resultHalfWidth(result: TemplateResult): number {
  let half = 0
  for (const p of result.parts) half = Math.max(half, Math.abs(p.position[0]) + p.size[0] / 2)
  return half
}

/**
 * Insert a built template into the CURRENT spec. An EMPTY spec (no parts, no
 * source GLB) is REPLACED by the template. A non-empty spec keeps its content and
 * inserts the template ALONGSIDE, offset on +X by a small gap so it never
 * overlaps (the least-surprising behaviour — no destructive confirm). The insert
 * is one commit (one undo step). Returns `{ spec, groupId }` (groupId = the
 * inserted wrapping group, or null for an empty result). Pure.
 */
export function insertTemplate(
  spec: AssetEditSpec,
  result: TemplateResult,
): { spec: AssetEditSpec; groupId: string | null } {
  if (result.parts.length === 0) return { spec, groupId: null }
  const isEmpty = spec.parts.length === 0 && !spec.sourceAssetId
  if (isEmpty) {
    const next: AssetEditSpec = {
      ...createEmptySpec(),
      parts: result.parts,
      partGroups: result.groups,
    }
    return { spec: next, groupId: result.groups[0]?.id ?? null }
  }
  const maxX = specMaxWorldX(spec) ?? 0
  const offsetX = maxX + INSERT_GAP_M + resultHalfWidth(result)
  const shifted = result.groups.map((g) => {
    const p = g.position ?? [0, 0, 0]
    return { ...g, position: [p[0] + offsetX, p[1], p[2]] as [number, number, number] }
  })
  const next: AssetEditSpec = {
    ...spec,
    parts: [...spec.parts, ...result.parts],
    partGroups: [...partGroups(spec), ...shifted],
  }
  return { spec: next, groupId: shifted[0]?.id ?? null }
}
