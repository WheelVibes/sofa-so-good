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
  addDecal,
  type CombineGroup,
  combineGroups,
  createEmptySpec,
  type Decal,
  newCombineGroupId,
  newPartGroupId,
  newPartId,
  type PartGroup,
  partGroups,
  type ShapePart,
} from './editSpec'
import { applyFinishPreset } from './finishPresets'
import { tuftDecals } from './tufting'

/** Where a saved template is placed by default — a hint the designer applies to
 *  the Save panel's placement select when the template is inserted (the floating
 *  shelf is wall-mounted; everything else stands on the floor). */
type TemplatePlacement = 'floor' | 'wall'

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
  /** Tuft button decals to attach (Stage 7c) — the bench's upholstered top ships
   *  tufted by default. Ids are minted on insert. Each references a `parts[]` id. */
  decals?: Omit<Decal, 'id'>[]
  /** Built-in combine groups (Stage 7c) — the bathroom vanity ships with a basin
   *  cutout (countertop solid − basin hole). Each references `parts[]` ids that
   *  share the wrapping transform group's home. */
  combineGroups?: CombineGroup[]
}

export interface TemplateDef {
  id: string
  name: string
  /** Suggested catalog category + save-name seed for the piece. */
  category: 'tables' | 'storage' | 'beds' | 'seating'
  /** Default placement hint (Stage 7c) — the floating shelf is `wall`; absent →
   *  `floor`. The designer applies it to the Save panel's placement select. */
  placement?: TemplatePlacement
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
const STONE: Look = { color: '#dcdcd6', roughness: 0.35, metalness: 0.05 }
const STEEL: Look = { color: '#c4c8ce', roughness: 0.3, metalness: 0.9 }

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

// --- Shared carcass scaffolding (cabinet / wardrobe / TV console) --------------

/** The two side panels + top + bottom + back of a box carcass, seated with its
 *  underside at `bottom` and rising to `h`. Sides are full-depth; the top/bottom/
 *  back fit between them (inner width). The single source of the carcass geometry
 *  the cabinet, wardrobe and TV-console templates all share (was triplicated).
 *  Pure. */
function buildCarcass(w: number, h: number, d: number, bottom: number): ShapePart[] {
  const carcassH = h - bottom
  const innerW = w - PANEL_T * 2
  const parts: ShapePart[] = []
  for (const sx of [-1, 1]) {
    parts.push(
      box([PANEL_T, carcassH, d], [sx * (w / 2 - PANEL_T / 2), bottom + carcassH / 2, 0], WOOD),
    )
  }
  parts.push(box([innerW, PANEL_T, d], [0, h - PANEL_T / 2, 0], WOOD))
  parts.push(box([innerW, PANEL_T, d], [0, bottom + PANEL_T / 2, 0], WOOD))
  parts.push(box([innerW, carcassH, BACK_T], [0, bottom + carcassH / 2, -d / 2 + BACK_T / 2], WOOD))
  return parts
}

/** A row of `n` door leaves across the carcass front (+Z) with a bar pull near
 *  each leaf's inner edge (hinge on the outer edge). `pullLength` derives the
 *  handle length from the leaf width, `pullInset` sets how far in from the leaf's
 *  inner edge the pull sits — the only bits that differ between the cabinet and
 *  wardrobe. Pure. */
function buildDoorRow(
  n: number,
  innerW: number,
  doorH: number,
  doorY: number,
  frontZ: number,
  pullLength: (leafW: number) => number,
  pullInset: number,
): ShapePart[] {
  const parts: ShapePart[] = []
  const leafW = (innerW - REVEAL * (n - 1)) / n
  for (let i = 0; i < n; i++) {
    const lx = -innerW / 2 + leafW / 2 + i * (leafW + REVEAL)
    parts.push(box([leafW - REVEAL, doorH, DOOR_T], [lx, doorY, frontZ + DOOR_T / 2], PANEL))
    const hinge = i < n / 2 ? 1 : -1
    parts.push(
      ...fitting('handle-bar-pull', { length: pullLength(leafW), standoff: 0.03 }, [
        lx + hinge * (leafW / 2 - pullInset),
        doorY,
        frontZ + DOOR_T,
      ]),
    )
  }
  return parts
}

/** A recessed plinth base slab (inset `inset` on all four sides), height
 *  `plinthH`, seated on the floor. Used by the wardrobe (the cabinet raises on
 *  puck feet + the TV console on tapered legs instead). Pure. */
function buildPlinth(w: number, d: number, plinthH: number, inset: number): ShapePart {
  return box([w - 2 * inset, plinthH, d - 2 * inset], [0, plinthH / 2, 0], DARK_WOOD)
}

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
  parts.push(...buildCarcass(w, h, d, bottom))
  // Doors across the front + a bar pull on each.
  const doorH = carcassH - 2 * REVEAL
  const doorY = bottom + REVEAL + doorH / 2
  parts.push(
    ...buildDoorRow(n, innerW, doorH, doorY, d / 2, (leafW) => Math.min(0.12, leafW * 0.5), 0.06),
  )
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
// Dining chair — seat board + reclined back (posts + rail) + 4 legs + apron
// ============================================================================

function buildChair(seatH: number, seatW: number, seatD: number, backH: number): TemplateResult {
  const parts: ShapePart[] = []
  const seatT = 0.04
  const legW = 0.04
  const legInset = 0.045
  const apronH = 0.06
  const apronT = 0.02
  const postW = 0.04
  const postT = 0.035
  const reclineDeg = 8 // slight backward lean (5–10°) for lumbar comfort
  const boardT = 0.03
  const underside = seatH - seatT
  const halfW = seatW / 2 - legInset
  const halfD = seatD / 2 - legInset
  // Four square legs, floor → seat underside.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        ...fitting('leg-straight-square', { height: Math.max(0.06, underside), width: legW }, [
          sx * halfW,
          underside,
          sz * halfD,
        ]),
      )
    }
  }
  // Seat board.
  parts.push(box([seatW, seatT, seatD], [0, seatH - seatT / 2, 0], WOOD, { bevel: 0.008 }))
  // Apron rails just under the seat, tying the legs together (front/back along X,
  // sides along Z).
  const apronY = underside - apronH / 2
  for (const sz of [-1, 1]) {
    parts.push(box([2 * halfW, apronH, apronT], [0, apronY, sz * halfD], WOOD))
  }
  for (const sx of [-1, 1]) {
    parts.push(box([apronT, apronH, 2 * halfD], [sx * halfW, apronY, 0], WOOD))
  }
  // Two rear posts rising from the seat to the back height, reclined slightly.
  const postH = backH - seatH
  const postY = (backH + seatH) / 2
  const postZ = -halfD
  const recline: [number, number, number] = [-reclineDeg, 0, 0]
  for (const sx of [-1, 1]) {
    parts.push(
      box([postW, postH, postT], [sx * halfW, postY, postZ], DARK_WOOD, { rotation: recline }),
    )
  }
  // Lumbar/top back board spanning the posts, in the upper part of the back.
  const boardH = Math.min(0.16, postH * 0.5)
  const boardY = backH - boardH / 2 - 0.03
  parts.push(
    box([2 * halfW + postW, boardH, boardT], [0, boardY, postZ], DARK_WOOD, {
      rotation: recline,
      bevel: 0.01,
    }),
  )
  return wrap(parts, 'Dining chair')
}

// ============================================================================
// Wardrobe — plinth + tall carcass + N doors (bar pulls) + interior rail
// ============================================================================

function buildWardrobe(w: number, h: number, d: number, doors: number): TemplateResult {
  const parts: ShapePart[] = []
  const n = clamp(Math.round(doors), 2, 3)
  const plinthH = 0.08
  parts.push(buildPlinth(w, d, plinthH, 0.03))
  const bottom = plinthH
  const carcassH = h - bottom
  const innerW = w - PANEL_T * 2
  parts.push(...buildCarcass(w, h, d, bottom))
  // Interior hanging rail (a steel cylinder spanning the inner width near the top).
  parts.push({
    id: newPartId(),
    kind: 'cylinder',
    size: [0.025, innerW, 0.025],
    position: [0, h - 0.16, -0.02],
    rotation: [0, 0, 90],
    color: '#c4c8ce',
    roughness: 0.3,
    metalness: 0.9,
  })
  // Doors + a bar pull each (hinge on the outer edge, pull on the inner).
  const doorH = carcassH - 2 * REVEAL
  const doorY = bottom + REVEAL + doorH / 2
  parts.push(...buildDoorRow(n, innerW, doorH, doorY, d / 2, () => 0.12, 0.05))
  return wrap(parts, 'Wardrobe')
}

// ============================================================================
// Desk — top + one drawer pedestal (stacked fronts + pulls) + 2 legs opposite
// ============================================================================

function buildDesk(w: number, d: number, h: number, drawers: number): TemplateResult {
  const parts: ShapePart[] = []
  const n = clamp(Math.round(drawers), 2, 3)
  const topT = 0.03
  parts.push(box([w, topT, d], [0, h - topT / 2, 0], WOOD, { bevel: 0.008 }))
  const underside = h - topT
  // Pedestal carcass on the +X side.
  const pedW = Math.min(0.42, w * 0.32)
  const pedX = w / 2 - pedW / 2
  parts.push(box([pedW, underside, d], [pedX, underside / 2, 0], PANEL))
  // Stacked drawer fronts + a bar pull each on the pedestal front (+Z).
  const area = underside - 2 * REVEAL
  const drawerH = (area - REVEAL * (n - 1)) / n
  const frontZ = d / 2
  for (let i = 0; i < n; i++) {
    const y = REVEAL + drawerH / 2 + i * (drawerH + REVEAL)
    parts.push(
      box([pedW - 2 * REVEAL, drawerH - REVEAL, DOOR_T], [pedX, y, frontZ + DOOR_T / 2], PANEL),
    )
    parts.push(
      ...fitting('handle-bar-pull', { length: Math.min(0.16, pedW * 0.5), standoff: 0.028 }, [
        pedX,
        y,
        frontZ + DOOR_T,
      ]),
    )
  }
  // Two square legs on the −X side, floor → top underside.
  const legInset = 0.05
  for (const sz of [-1, 1]) {
    parts.push(
      ...fitting('leg-straight-square', { height: Math.max(0.06, underside), width: 0.05 }, [
        -(w / 2 - legInset),
        underside,
        sz * (d / 2 - legInset),
      ]),
    )
  }
  return wrap(parts, 'Desk')
}

// ============================================================================
// TV console — low open carcass + one shelf + short tapered legs
// ============================================================================

function buildTvConsole(w: number, d: number, h: number): TemplateResult {
  const parts: ShapePart[] = []
  const legH = 0.12 // the tapered-leg component's minimum height
  const legInset = 0.06
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        ...fitting('leg-tapered-round', { height: legH, diameter: 0.05 }, [
          sx * (w / 2 - legInset),
          legH,
          sz * (d / 2 - legInset),
        ]),
      )
    }
  }
  const bottom = legH
  const carcassH = h - bottom
  const innerW = w - PANEL_T * 2
  parts.push(...buildCarcass(w, h, d, bottom))
  // One open middle shelf → two open display bays (a media unit, not a cabinet).
  parts.push(box([innerW, PANEL_T, d - BACK_T], [0, bottom + carcassH / 2, BACK_T / 2], WOOD))
  return wrap(parts, 'TV console')
}

// ============================================================================
// Bench — upholstered tufted top (the Stage-7c showcase) + base rails + 4 legs
// ============================================================================

function buildBench(w: number, d: number, seatH: number): TemplateResult {
  const parts: ShapePart[] = []
  const cushionThk = 0.12
  const seatTop = seatH
  const legInset = 0.09
  const legW = 0.05
  const railH = 0.06
  const railT = 0.03
  const railTop = seatTop - cushionThk
  const railBottom = railTop - railH
  const legH = Math.max(0.06, railBottom)
  // Four square legs, floor → base-rail underside.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        ...fitting('leg-straight-square', { height: legH, width: legW }, [
          sx * (w / 2 - legInset),
          legH,
          sz * (d / 2 - legInset),
        ]),
      )
    }
  }
  // Front + back rails tying the legs, just under the cushion.
  for (const sz of [-1, 1]) {
    parts.push(
      box(
        [w - legInset, railH, railT],
        [0, railBottom + railH / 2, sz * (d / 2 - legInset)],
        DARK_WOOD,
      ),
    )
  }
  // The upholstered top: plumped (soft), wrinkles default-on (no mat finish so
  // they show), tufted by default — the frame this stage exists for. Cols scale
  // with the bench length; two rows front-to-back.
  const cushion = box([w, cushionThk, d], [0, seatTop - cushionThk / 2, 0], FABRIC, {
    name: 'Seat cushion',
    plump: 0.7,
    tuft: { rows: 2, cols: clamp(Math.round(w / 0.42), 2, 5), depth: 0.55 },
  })
  parts.push(cushion)
  const result = wrap(parts, 'Bench')
  result.decals = tuftDecals(cushion)
  return result
}

// ============================================================================
// Bar stool — round lathe seat + tall tapered legs + a swept foot ring
// ============================================================================

/** Lathe profile (x = radius fraction, y = height fraction) for a round stool
 *  seat: a disc with softly chamfered top + bottom edges. */
const STOOL_SEAT_PROFILE: [number, number][] = [
  [0, 0],
  [0.82, 0],
  [1, 0.28],
  [1, 0.72],
  [0.82, 1],
  [0, 1],
]

function buildBarStool(seatH: number, seatDia: number): TemplateResult {
  const parts: ShapePart[] = []
  const seatThk = 0.06
  const seatBottom = seatH - seatThk
  const underside = seatBottom
  // Round lathe seat.
  parts.push({
    id: newPartId(),
    kind: 'lathe',
    size: [seatDia, seatThk, seatDia],
    position: [0, seatBottom + seatThk / 2, 0],
    profile: STOOL_SEAT_PROFILE.map((p) => [...p] as [number, number]),
    segments: 40,
    ...DARK_WOOD,
  })
  // Four tall tapered legs on an inscribed circle, floor → seat underside.
  const legR = Math.max(0.08, seatDia / 2 - 0.05)
  const legOff = legR * Math.SQRT1_2
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        ...fitting('leg-tapered-round', { height: underside, diameter: 0.045 }, [
          sx * legOff,
          underside,
          sz * legOff,
        ]),
      )
    }
  }
  // Swept foot ring (a circle profile on a ring path) tying the legs low down.
  const ringY = Math.min(0.24, underside * 0.4)
  parts.push({
    id: newPartId(),
    kind: 'sweep',
    size: [2 * legR, 0.02, 2 * legR],
    position: [0, ringY, 0],
    sweepProfile: 'circle',
    sweepPath: 'ring',
    ...STEEL,
  })
  return wrap(parts, 'Bar stool')
}

// ============================================================================
// Floating shelf — a wall-mounted board + a hidden back cleat (no legs)
// ============================================================================

function buildFloatingShelf(w: number, d: number, thickness: number): TemplateResult {
  const parts: ShapePart[] = []
  // The shelf board — back face at z = −d/2 sits against the wall; underside at
  // y = 0 (the asset's local origin; a wall-mounted piece hangs at any height).
  parts.push(
    box([w, thickness, d], [0, thickness / 2, 0], WOOD, {
      bevel: Math.min(0.01, thickness / 2),
    }),
  )
  // Two concealed cleats along the board underside near the ends (the hidden
  // bracket cue), tucked against the wall face and sitting within the board's own
  // height so the piece reads as a solid floating slab.
  const cleatT = 0.02
  const cleatH = thickness
  for (const sx of [-1, 1]) {
    parts.push(
      box(
        [w * 0.18, cleatH, cleatT],
        [sx * (w / 2 - w * 0.12), cleatH / 2, -d / 2 + cleatT / 2],
        DARK_WOOD,
      ),
    )
  }
  return wrap(parts, 'Floating shelf')
}

// ============================================================================
// Bathroom vanity — carcass + basin cutout (a built-in subtract combine) + doors
// ============================================================================

function buildVanity(w: number, h: number, d: number, doors: number): TemplateResult {
  const parts: ShapePart[] = []
  const n = clamp(Math.round(doors), 1, 3)
  const plinthH = 0.06
  parts.push(buildPlinth(w, d, plinthH, 0.03))
  const counterT = 0.04
  const carcassTop = h - counterT
  const bottom = plinthH
  const carcassH = carcassTop - bottom
  const innerW = w - PANEL_T * 2
  // Carcass up to the underside of the counter.
  parts.push(...buildCarcass(w, carcassTop, d, bottom))
  // Countertop slab (solid) minus a basin bowl (hole) → the built-in combine.
  const counter = box([w, counterT, d], [0, carcassTop + counterT / 2, 0], STONE)
  const basinDia = Math.min(0.42, Math.min(w, d) * 0.6)
  const basin: ShapePart = {
    id: newPartId(),
    kind: 'cylinder',
    // Taller than the counter so the subtract cuts a clean through-hole (no
    // coplanar faces to fight the CSG evaluator).
    size: [basinDia, counterT * 2.5, basinDia],
    position: [0, carcassTop + counterT / 2, 0],
    role: 'hole',
    ...STONE,
  }
  parts.push(counter, basin)
  // Doors across the front.
  const doorH = carcassH - 2 * REVEAL
  const doorY = bottom + REVEAL + doorH / 2
  parts.push(
    ...buildDoorRow(n, innerW, doorH, doorY, d / 2, (leafW) => Math.min(0.12, leafW * 0.5), 0.06),
  )
  const result = wrap(parts, 'Bathroom vanity')
  // The countertop + basin are both members of the wrapping transform group
  // (`wrap` grouped every part), so the combine has a well-defined home.
  result.combineGroups = [
    {
      id: newCombineGroupId(),
      name: 'Basin cutout',
      partIds: [counter.id, basin.id],
      op: 'subtract',
    },
  ]
  return result
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
  {
    id: 'dining-chair',
    name: 'Dining chair',
    category: 'seating',
    params: [
      {
        key: 'seatHeight',
        label: 'Seat height',
        unit: 'm',
        min: 0.42,
        max: 0.48,
        step: 0.01,
        default: 0.45,
        hint: 'Dining seat height 0.42–0.48 m (pairs a 0.75 m table)',
      },
      {
        key: 'seatWidth',
        label: 'Seat width',
        unit: 'm',
        min: 0.4,
        max: 0.5,
        step: 0.01,
        default: 0.44,
        hint: 'Seat width 0.40–0.50 m fits an adult',
      },
      {
        key: 'seatDepth',
        label: 'Seat depth',
        unit: 'm',
        min: 0.38,
        max: 0.45,
        step: 0.01,
        default: 0.42,
        hint: 'Seat depth 0.38–0.45 m supports the thighs',
      },
      {
        key: 'backHeight',
        label: 'Back height',
        unit: 'm',
        min: 0.8,
        max: 1.0,
        step: 0.01,
        default: 0.9,
        hint: 'Backrest top 0.80–1.00 m from the floor',
      },
    ],
    build: (p) => buildChair(p.seatHeight, p.seatWidth, p.seatDepth, p.backHeight),
  },
  {
    id: 'wardrobe',
    name: 'Wardrobe',
    category: 'storage',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 0.6,
        max: 1.8,
        step: 0.05,
        default: 0.9,
        hint: 'Each door leaf stays under 0.6 m',
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'm',
        min: 1.8,
        max: 2.4,
        step: 0.05,
        default: 2.0,
        hint: 'Wardrobes stand 1.8–2.4 m; leave a ceiling reach',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.5,
        max: 0.65,
        step: 0.01,
        default: 0.58,
        hint: '0.55–0.60 m clears a hanger on the rail',
      },
      {
        key: 'doors',
        label: 'Doors',
        unit: 'doors',
        min: 2,
        max: 3,
        step: 1,
        default: 2,
        hint: 'Two or three hinged leaves',
      },
    ],
    build: (p) => buildWardrobe(p.width, p.height, p.depth, p.doors),
  },
  {
    id: 'desk',
    name: 'Desk',
    category: 'tables',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 1.0,
        max: 1.8,
        step: 0.05,
        default: 1.4,
        hint: 'Desks run 1.2–1.6 m wide',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.6,
        max: 0.8,
        step: 0.02,
        default: 0.7,
        hint: '0.6–0.8 m deep clears a monitor arm',
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'm',
        min: 0.72,
        max: 0.76,
        step: 0.01,
        default: 0.74,
        hint: 'Standard desk height 0.72–0.76 m',
      },
      {
        key: 'drawers',
        label: 'Drawers',
        unit: 'drawers',
        min: 2,
        max: 3,
        step: 1,
        default: 3,
        hint: 'Pedestal holds two or three drawers',
      },
    ],
    build: (p) => buildDesk(p.width, p.depth, p.height, p.drawers),
  },
  {
    id: 'tv-console',
    name: 'TV console',
    category: 'storage',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 1.0,
        max: 1.8,
        step: 0.05,
        default: 1.4,
        hint: 'Wider than the TV stand base (1.2–1.8 m)',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.35,
        max: 0.5,
        step: 0.01,
        default: 0.4,
        hint: '0.35–0.50 m deep holds media boxes',
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'm',
        min: 0.4,
        max: 0.6,
        step: 0.01,
        default: 0.5,
        hint: 'Screen centre near seated eye level (0.4–0.6 m)',
      },
    ],
    build: (p) => buildTvConsole(p.width, p.depth, p.height),
  },
  {
    id: 'bench',
    name: 'Bench',
    category: 'seating',
    params: [
      {
        key: 'width',
        label: 'Length',
        unit: 'm',
        min: 0.9,
        max: 1.8,
        step: 0.05,
        default: 1.2,
        hint: 'Benches run 1.0–1.6 m for two to three seats',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.32,
        max: 0.5,
        step: 0.02,
        default: 0.4,
        hint: 'Seat depth 0.35–0.45 m',
      },
      {
        key: 'seatHeight',
        label: 'Seat height',
        unit: 'm',
        min: 0.42,
        max: 0.48,
        step: 0.01,
        default: 0.45,
        hint: 'Bench seat height ~0.45 m',
      },
    ],
    build: (p) => buildBench(p.width, p.depth, p.seatHeight),
  },
  {
    id: 'bar-stool',
    name: 'Bar stool',
    category: 'seating',
    params: [
      {
        key: 'seatHeight',
        label: 'Seat height',
        unit: 'm',
        min: 0.65,
        max: 0.78,
        step: 0.01,
        default: 0.7,
        hint: 'Counter stool 0.65 m, bar stool up to 0.78 m',
      },
      {
        key: 'seatDiameter',
        label: 'Seat ⌀',
        unit: 'm',
        min: 0.28,
        max: 0.4,
        step: 0.01,
        default: 0.34,
        hint: 'Round seat 0.30–0.38 m across',
      },
    ],
    build: (p) => buildBarStool(p.seatHeight, p.seatDiameter),
  },
  {
    id: 'floating-shelf',
    name: 'Floating shelf',
    category: 'storage',
    placement: 'wall',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 0.4,
        max: 1.6,
        step: 0.05,
        default: 0.8,
        hint: 'Spans over 1.2 m want a mid bracket',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.15,
        max: 0.35,
        step: 0.01,
        default: 0.22,
        hint: 'Shelf depth 0.18–0.30 m holds books/decor',
      },
      {
        key: 'thickness',
        label: 'Thickness',
        unit: 'm',
        min: 0.03,
        max: 0.08,
        step: 0.005,
        default: 0.04,
        hint: 'Board 30–60 mm reads as a solid floating shelf',
      },
    ],
    build: (p) => buildFloatingShelf(p.width, p.depth, p.thickness),
  },
  {
    id: 'bathroom-vanity',
    name: 'Bathroom vanity',
    category: 'storage',
    params: [
      {
        key: 'width',
        label: 'Width',
        unit: 'm',
        min: 0.6,
        max: 1.4,
        step: 0.05,
        default: 0.9,
        hint: 'Single-basin vanities run 0.6–1.2 m',
      },
      {
        key: 'height',
        label: 'Height',
        unit: 'm',
        min: 0.8,
        max: 0.9,
        step: 0.01,
        default: 0.85,
        hint: 'Vanity counter height 0.80–0.90 m',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'm',
        min: 0.45,
        max: 0.6,
        step: 0.01,
        default: 0.5,
        hint: '0.45–0.55 m deep clears a basin',
      },
      {
        key: 'doors',
        label: 'Doors',
        unit: 'doors',
        min: 1,
        max: 3,
        step: 1,
        default: 2,
        hint: 'One to three cupboard leaves under the basin',
      },
    ],
    build: (p) => buildVanity(p.width, p.height, p.depth, p.doors),
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
    const isInt =
      !!p.presetLabels || p.unit === 'shelves' || p.unit === 'doors' || p.unit === 'drawers'
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
    const base: AssetEditSpec = {
      ...createEmptySpec(),
      parts: result.parts,
      partGroups: result.groups,
    }
    return {
      spec: attachTemplateExtras(base, result),
      groupId: result.groups[0]?.id ?? null,
    }
  }
  const maxX = specMaxWorldX(spec) ?? 0
  const offsetX = maxX + INSERT_GAP_M + resultHalfWidth(result)
  const shifted = result.groups.map((g) => {
    const p = g.position ?? [0, 0, 0]
    return { ...g, position: [p[0] + offsetX, p[1], p[2]] as [number, number, number] }
  })
  const base: AssetEditSpec = {
    ...spec,
    parts: [...spec.parts, ...result.parts],
    partGroups: [...partGroups(spec), ...shifted],
  }
  return { spec: attachTemplateExtras(base, result), groupId: shifted[0]?.id ?? null }
}

/** Attach a template's built-in combine groups + tuft decals onto a spec that
 *  already carries its parts/groups (Stage 7c). Combine groups reference part ids
 *  minted in `build()`, unaffected by the alongside +X offset (which only shifts
 *  group positions); tuft decals are appended with fresh ids. Pure. */
function attachTemplateExtras(spec: AssetEditSpec, result: TemplateResult): AssetEditSpec {
  let next = spec
  if (result.combineGroups?.length) {
    next = { ...next, combineGroups: [...combineGroups(next), ...result.combineGroups] }
  }
  if (result.decals?.length) {
    for (const dec of result.decals) next = addDecal(next, dec).spec
  }
  return next
}
