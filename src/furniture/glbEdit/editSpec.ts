/**
 * GLB Asset Designer — the pure, serialisable spec describing a custom asset the
 * user builds in the designer (`ui/glbEditor/`). An asset is an optional source
 * GLB (uploaded/bundled) plus a uniform scale, plus a list of primitive shapes
 * "kit-bashed" around it. `buildObject.ts` turns a spec (+ the loaded source
 * object) into a three.Object3D; `saveAsset.ts` exports that to a GLB and
 * persists it as a new catalog asset. Keeping the spec pure makes the geometry
 * decisions (bounds, validation, part maths) unit-testable without a GPU.
 */

import {
  EXTRUDE_PRESETS,
  LATHE_PRESETS,
  LOFT_PRESETS,
  type SweepPathKind,
  type SweepProfileKind,
} from './shapeProfiles'

export type PrimitiveShapeKind =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'torus'
  | 'capsule'
  | 'pyramid'
  | 'wedge'
  | 'lathe'
  | 'extrude'
  | 'sweep'
  | 'loft'

/** Kinds that accept a bevel / corner-radius (`ShapePart.bevel`). Box + wedge
 *  only — extrudes carry their own always-on bevel and the round kinds are
 *  already smooth. Source of truth for the inspector's "Corner radius" control. */
export const BEVELABLE_KINDS: PrimitiveShapeKind[] = ['box', 'wedge']

/** A part is either a parametric primitive or a baked `mesh` — the result of a
 *  CSG combine (`csgCombine.ts`), whose triangles live in `ShapePart.geometry`. */
export type ShapeKind = PrimitiveShapeKind | 'mesh'

/** TinkerCAD-style solid/hole role (CSG v2, Stage 1b). A `hole` part renders as
 *  a translucent ghost in the editor and, inside a Subtract combine group, is
 *  carved out of the group's solids. Absent → `solid` (the default), so every
 *  pre-Stage-1b spec keeps its parts solid. */
export type PartRole = 'solid' | 'hole'

/** A non-destructive boolean-combine operation recorded in the spec (CSG v2).
 *  The member parts (`partIds`, in selection order) STAY editable in
 *  `spec.parts`; the built object evaluates the boolean lazily from their live
 *  transforms/geometry (`glbEdit/csgEval.ts`). A part belongs to at most one
 *  group. Dropping the group (ungroup) leaves the members untouched — the whole
 *  point of "non-destructive". */
export interface CombineGroup {
  id: string
  /** Display name in the layers panel (e.g. "Combine 1"). */
  name: string
  /** Member part ids, in selection order. The first is the subtract base when
   *  no member is marked as a hole. ≥2 members. */
  partIds: string[]
  op: CombineOp
}

/** The boolean operator a combine group applies. Mirrors `csgCombine.CsgOp` but
 *  lives here so the spec type is self-contained (no import cycle). */
export type CombineOp = 'union' | 'subtract' | 'intersect'

/** A named TRANSFORM group (Asset Studio Stage 3a). **Distinct from a
 *  `CombineGroup`** — which fuses parts with a CSG boolean. A `PartGroup` keeps
 *  its members as separate meshes but moves/rotates them together as one unit via
 *  an optional group `position`/`rotation` applied ON TOP of each member's own
 *  transform at build time (grouped part world = group transform ∘ part
 *  transform). Ungrouping FLATTENS the group transform into each member so
 *  nothing jumps. **Flat only** — a PartGroup never nests inside another
 *  (deliberate Stage-3a scope: no `parentGroupId`). A part is in at most ONE
 *  PartGroup, and MAY also be in a CombineGroup independently. UI vocabulary is
 *  "Group" (the boolean feature stays "Combine"). */
export interface PartGroup {
  id: string
  /** Display name in the layers tree (e.g. "Group 1"). */
  name: string
  /** Member part ids, in add order. ≥1 member. */
  partIds: string[]
  /** Group origin offset in metres, applied on top of member positions. Absent →
   *  [0,0,0] (no offset). */
  position?: [number, number, number]
  /** Group rotation in DEGREES (Euler XYZ), applied on top of member rotations.
   *  Absent → no rotation. */
  rotation?: [number, number, number]
}

/** All primitive kinds, in palette order. Source of truth for the designer's
 *  "add shape" controls + the geometry switch in `buildObject.ts`. (`mesh` is
 *  deliberately absent — a mesh part is only ever produced by combining.) */
export const SHAPE_KINDS: PrimitiveShapeKind[] = [
  'box',
  'cylinder',
  'sphere',
  'cone',
  'pyramid',
  'capsule',
  'torus',
  'wedge',
  'lathe',
  'extrude',
  'sweep',
  'loft',
]

export const SHAPE_LABEL: Record<ShapeKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  cone: 'Cone',
  pyramid: 'Pyramid',
  capsule: 'Capsule',
  torus: 'Torus',
  wedge: 'Wedge',
  lathe: 'Lathe',
  extrude: 'Extrude',
  sweep: 'Sweep',
  loft: 'Loft',
  mesh: 'Combined',
}

/** Optional `MeshPhysicalMaterial` finishing fields (Stage 2 — materials). Every
 *  field is absent by default, so a part/group with none set is byte-identical to
 *  the pre-Stage-2 plain `MeshStandardMaterial` output. `buildSurfaceMaterial`
 *  upgrades to a `MeshPhysicalMaterial` ONLY when one of the four primary axes
 *  (`sheen`/`clearcoat`/`transmission`/`anisotropy`) is > 0 — the secondary
 *  fields (`sheenColor`/`sheenRoughness`/`ior`/`thickness`/`anisotropyRotation`)
 *  only refine their primary. All numeric axes are 0…1 except `ior` (≈1.0–2.333,
 *  glass ≈1.5), `thickness` (metres, glass volume) and `anisotropyRotation`
 *  (radians). Every field round-trips losslessly through the GLB export (verified
 *  — KHR_materials_sheen / clearcoat / transmission / ior / volume / anisotropy). */
export interface PhysicalSurfaceFields {
  /** Fabric/velvet retroreflective sheen halo (KHR_materials_sheen). */
  sheen?: number
  /** Sheen lobe colour (hex). Absent → white lobe (reads as pile). */
  sheenColor?: string
  /** Sheen lobe roughness 0…1. Absent → three's default (1). */
  sheenRoughness?: number
  /** Lacquer/gloss film over the base (KHR_materials_clearcoat). */
  clearcoat?: number
  /** Clearcoat film roughness 0…1. Absent → three's default. */
  clearcoatRoughness?: number
  /** Refractive glass transmission (KHR_materials_transmission). NOTE: the
   *  transmission render pass needs a real GPU — headless previews read flat. */
  transmission?: number
  /** Index of refraction (KHR_materials_ior). Glass ≈ 1.5. */
  ior?: number
  /** Glass volume thickness in metres (KHR_materials_volume). */
  thickness?: number
  /** Brushed-metal directional highlight (KHR_materials_anisotropy). */
  anisotropy?: number
  /** Anisotropy sweep rotation in radians. Absent → 0 (U axis). */
  anisotropyRotation?: number
}

/** Per-part vertex-colour gradient (Stage 2). Baked into the part geometry as a
 *  `COLOR_0` attribute (lerped `from`→`to` along the chosen local bbox axis) and
 *  rendered with `vertexColors` on; survives GLB export as COLOR_0. Only offered
 *  for solid-colour parts (no textured `finish`) — the multiply of a texture map
 *  by the gradient reads muddy, so the inspector disables it when a finish is
 *  set. */
export interface PartGradient {
  axis: 'x' | 'y' | 'z'
  /** Colour at the axis minimum (hex). */
  from: string
  /** Colour at the axis maximum (hex). */
  to: string
}

/** A single per-face finish override (Asset Studio Stage 6c). Both fields
 *  optional: sets the zone's flat `color` and/or textured `finish` (a
 *  `mat:<id>`) OVER the part's base look; an absent field inherits the base.
 *  An override with neither field is dropped (the zone falls back to base). */
export interface FaceFinish {
  color?: string
  finish?: string
}

/** The three face zones of a `FaceFinishes` (Stage 6c). */
export type FaceFinishZone = 'top' | 'bottom' | 'sides'

/** One-tap TUFTING on a plumped box cushion (Asset Studio Stage 7c). A regular
 *  `rows × cols` grid (the diamond/Chesterfield pattern is deliberately OUT of
 *  scope) of button pull-points on the cushion's top face. Setting it does TWO
 *  things (see `tufting.ts`): (a) subtracts smooth gaussian dimples at the button
 *  positions from the plump crown (the geometry pull-down) and (b) regenerates a
 *  matching grid of tagged `button` decals (the visible buttons). `rows`/`cols`
 *  are 1–6; `depth` 0…1 scales how deep the dimples pull (0 = buttons only, no
 *  dimple). Absent → no tufting (byte-identical). Applies to a plumped box only. */
export interface TuftGrid {
  rows: number
  cols: number
  depth: number
}

/** Per-face finishes on a SHARP box (Asset Studio Stage 6c) — the
 *  board-construction / **edge-banding** realism cue from the Polyboard/SWOOD
 *  research. THREE zones, not six faces: `top`/`bottom` are the veneer faces
 *  (+Y / −Y) and `sides` is the shared edge band (±X, ±Z) — exactly the
 *  veneer + edge-band split of a laminated board. A `BoxGeometry`'s six face
 *  groups are remapped to these three materials at build time (sides share one).
 *  **Sharp boxes only:** a bevelled box uses `RoundedBoxGeometry`, which has no
 *  face groups, and a hollow/plumped box is not a flat board — so `faceFinishes`
 *  applies only when `bevel`/`shell`/`plump` are all 0 (`boxFaceFinishesActive`);
 *  the inspector hides the section otherwise. **Combine limit:** inside a CSG
 *  combine an operand keeps its BASE look only (the fold assigns one material per
 *  operand), so per-face finishes do not survive a bake. */
export interface FaceFinishes {
  top?: FaceFinish
  bottom?: FaceFinish
  sides?: FaceFinish
}

/** A projected surface detail (Asset Studio Stage 5 — realism detail layer).
 *  Built with three's `DecalGeometry` against a target part's mesh and rendered
 *  as a thin offset overlay that follows its part (it's a child of the part mesh,
 *  so a grouped/moved part carries its decals; a deleted part prunes them). Real
 *  geometry → it EXPORTS into the GLB. `position`/`normal` are in the target
 *  part's LOCAL frame (the raycast hit converted via `worldToLocal` + the
 *  geometry-local face normal), so the projection is stable under any part/group
 *  transform. */
export interface Decal {
  id: string
  /** The part this decal is projected onto (its local frame owns the transform). */
  partId: string
  /** Projector centre in the target part's LOCAL frame (metres). */
  position: [number, number, number]
  /** Surface normal in the target part's LOCAL frame (the projector's +Z aim). */
  normal: [number, number, number]
  /** In-plane footprint size (metres) — the decal's larger extent. */
  size: number
  kind: DecalKind
  /** Tint (hex). Absent → the kind's default thread/button colour. */
  color?: string
  /** In-plane roll about the normal (degrees) — orients the line kinds
   *  (stitch/seam). Absent → 0. */
  rotation?: number
  /** True when this decal was generated by the tufting grid (Stage 7c). Tagged so
   *  regenerating the grid (edit rows/cols/depth) REPLACES only the tuft buttons
   *  and never touches user-placed decals. Absent → a normal user decal. */
  tuft?: boolean
}

/** The curated detail kinds (Stage 5). A small set drawn as simple procedural
 *  canvas patterns (no bespoke texture art): a tufted `button`, a dashed `stitch`
 *  line, a crossed `seam`, a round `patch`, and a soft `wear` spot. */
export type DecalKind = 'button' | 'stitch' | 'seam' | 'patch' | 'wear'
export const DECAL_KINDS: DecalKind[] = ['button', 'stitch', 'seam', 'patch', 'wear']
export const DECAL_LABEL: Record<DecalKind, string> = {
  button: 'Button',
  stitch: 'Stitch line',
  seam: 'Seam',
  patch: 'Round patch',
  wear: 'Wear spot',
}
/** Default in-plane size (m) per kind — buttons/patches small, lines longer. */
export const DECAL_DEFAULT_SIZE: Record<DecalKind, number> = {
  button: 0.03,
  stitch: 0.12,
  seam: 0.12,
  patch: 0.05,
  wear: 0.06,
}

/** Per-group material configuration baked at CSG combine time. Mirrors the
 *  surface-look fields of `ShapePart` but without id/kind/transform — pure data
 *  so the spec stays serialisable. Absent fields fall back to the same defaults
 *  as `partMaterial` (roughness 0.6, metalness 0.05, opaque, no glow). Carries
 *  the Stage-2 `PhysicalSurfaceFields` too, so a combine bake preserves each
 *  operand's finish (velvet/glass/etc.). */
export interface GroupMaterialData extends PhysicalSurfaceFields {
  color: string
  finish?: string
  roughness?: number
  metalness?: number
  emissiveIntensity?: number
  opacity?: number
}

/** Baked triangle data for a `mesh` part (a CSG combine result), centred on the
 *  part's origin so `position`/`rotation` keep working like any primitive.
 *  Plain number arrays keep the spec pure/serialisable; treat them as immutable
 *  (duplicate/mirror share them by reference).
 *
 *  When `groups` and `materials` are present (GE3c tail), each group covers a
 *  range of triangles from one of the original source parts, and `materials[g.materialIndex]`
 *  carries that source part's surface look. A spec without these fields (pre-C273)
 *  keeps building unchanged — the single `finish`/`color` on the ShapePart is used. */
interface MeshGeometryData {
  positions: number[]
  normals: number[]
  index?: number[]
  /** Geometry draw groups, present when the CSG combine preserved per-part materials. */
  groups?: Array<{ start: number; count: number; materialIndex: number }>
  /** Per-group source material configs — index-matched to `groups[i].materialIndex`. */
  materials?: GroupMaterialData[]
}

export interface ShapePart extends PhysicalSurfaceFields {
  id: string
  /** Optional user-given display name (Stage 4). Absent → the layers panel falls
   *  back to the default `kind N` label (`partLabel`). Round-trips through the
   *  spec envelope (v6). */
  name?: string
  kind: ShapeKind
  /** Centre position in metres (asset-local, floor at y=0, +Z front). */
  position: [number, number, number]
  /** Box: full W/H/D. Cylinder: [diameter, height, diameter]. Sphere: [d,d,d]. */
  size: [number, number, number]
  /** Euler rotation in DEGREES (X,Y,Z), asset-local. Absent → no rotation.
   *  Lets a cone/capsule/torus/pyramid be laid on its side or angled. */
  rotation?: [number, number, number]
  color: string
  /** Optional textured finish applied instead of the flat colour — a furniture
   *  finish id, today always `mat:<materialId>` (a procedural or CC0 DLC catalog
   *  material, the same vocabulary placed furniture uses). Absent → the plain
   *  solid-colour material, so every pre-GE3c spec keeps building unchanged.
   *  While the material isn't built yet (or the id is unknown) the part falls
   *  back to its solid colour — never a crash. */
  finish?: string
  /** PBR surface roughness 0 (mirror-smooth) … 1 (fully matte). Absent → 0.6.
   *  Ignored while `finish` is set (the finish's own maps win). */
  roughness?: number
  /** PBR metalness 0 (dielectric: wood/plastic/fabric) … 1 (metal). Absent → 0.05. */
  metalness?: number
  /** Self-illumination strength (emissive in the part's own colour). 0/absent →
   *  no glow; >0 makes the part read as lit (neon, a lamp shade, a screen). */
  emissiveIntensity?: number
  /** Surface opacity 0…1. <1 makes the part translucent (glass, acrylic).
   *  Absent → 1 (opaque). */
  opacity?: number
  /** Baked triangles — present iff `kind === 'mesh'`. For a mesh part `size` is
   *  the result's bounding box (informational; the geometry is already sized). */
  geometry?: MeshGeometryData
  /** Corner radius / edge bevel in metres (Stage 1a). Box → rounded box; wedge →
   *  bevelled ramp edges; extrude → extrusion-edge bevel (ON by default). 0 /
   *  absent → today's sharp geometry (byte-identical). Clamped to the shape size
   *  by the geometry builder. */
  bevel?: number
  /** Lathe: revolve profile — normalized `[x, y]` points, x ∈ [0,1] fraction of
   *  radius (`size[0]/2`), y ∈ [0,1] fraction of height (`size[1]`). */
  profile?: [number, number][]
  /** Lathe: radial segments (revolution smoothness). Absent → 32. */
  segments?: number
  /** Extrude: outline — normalized `[x, y]` points, both ∈ [-0.5, 0.5] (centred),
   *  scaled to `size[0]×size[1]` and extruded by `size[2]`. */
  outline?: [number, number][]
  /** Sweep: cross-section profile preset (`circle`/`half-round`/`ogee`/`rectangle`). */
  sweepProfile?: SweepProfileKind
  /** Sweep: path preset (`straight`/`l-corner`/`u`/`ring`). */
  sweepPath?: SweepPathKind
  /** Sweep: explicit closed path points (metres, sweep-local, centred) that
   *  OVERRIDE the `sweepPath` preset (Stage 5). Used by the piping preset — a
   *  rounded-rect perimeter traced from a host part's footprint. Absent → the
   *  `sweepPath` preset. */
  sweepPoints?: [number, number, number][]
  /** Sweep: a free OPEN path drawn in the 2D editor (Stage 6b) — normalized
   *  `[x, z]` fractions of the path extent (`size[0]`), centred [-0.5, 0.5].
   *  Used only when `sweepPath === 'custom'`; absent → the preset/`sweepPoints`. */
  sweepPathPoints?: [number, number][]
  /** Shell/hollow wall thickness in metres (Stage 6b) — box + extrude only.
   *  > 0 carves an open-top (box: +Y) / open-end (extrude) hollow carcass of
   *  uniform wall thickness. 0 / absent → solid (byte-identical). Clamped to the
   *  footprint by the geometry builder. */
  shell?: number
  /** Loft: the BOTTOM horizontal cross-section — normalized centred `[x, z]`
   *  outline (both ∈ [-0.5, 0.5]), scaled to `size[0] × size[2]` at y = −h/2. */
  loftBottom?: [number, number][]
  /** Loft: the TOP horizontal cross-section — same convention as `loftBottom`,
   *  at y = +h/2. Resampled to match the bottom's point count at build. */
  loftTop?: [number, number][]
  /** Cushion "plump" 0…1 (Stage 5) — a sine-falloff vertex bulge on box/capsule
   *  kinds so upholstery reads soft/stuffed (normals recomputed). 0 / absent →
   *  today's flat geometry (byte-identical). */
  plump?: number
  /** Fabric wrinkle normal-map intensity 0…1 (Stage 6e) — a procedural, seeded
   *  normal map (soft creases gathering toward the pinned corners + fine fabric
   *  nap) overlaid on a PLUMPED box/capsule so the cushion reads as sewn
   *  upholstery instead of a smooth shell. Material-only (no geometry change).
   *  ABSENT defaults ON at a subtle level when `plump > 0` (the realism default);
   *  an explicit `0` disables it. Skipped when a textured `mat:<id>` finish is set
   *  (the finish's own normal map wins). See `wrinkleTexture.ts`. */
  wrinkles?: number
  /** One-tap tufting grid on a plumped box cushion (Stage 7c). See `TuftGrid`.
   *  Present → the plump crown gains gaussian dimples at the grid's button points
   *  AND a matching grid of tagged `button` decals is generated. Absent → no
   *  tufting (byte-identical). Applies to a plumped box only. */
  tuft?: TuftGrid
  /** TinkerCAD solid/hole role (CSG v2). Absent → `solid`. A `hole` renders as a
   *  translucent ghost and is carved out inside a Subtract combine group. */
  role?: PartRole
  /** Two-tone vertex-colour gradient baked into the geometry (Stage 2). Absent →
   *  no gradient (plain solid colour / finish). */
  gradient?: PartGradient
  /** Per-face finishes on a SHARP box (Stage 6c) — the edge-banding cue. See
   *  `FaceFinishes`. Applies only when `bevel`/`shell`/`plump` are all 0
   *  (`boxFaceFinishesActive`); ignored otherwise. Absent → the single base
   *  material on every face (byte-identical). */
  faceFinishes?: FaceFinishes
  /** Texture tile-size multiplier for a `mat:<id>` finish (Stage 6c), 0.25…4,
   *  default 1. Larger = coarser (bigger tiles / fewer repeats), mirroring the
   *  `compose:@<scale>` convention. Absent / 1 → the finish's natural tiling
   *  (byte-identical). Ignored without a textured `finish`. */
  finishScale?: number
  /** Grain / texture rotation for a `mat:<id>` finish (Stage 6c), in DEGREES
   *  (0 = grain along the default axis, 90 = a quarter turn — grain along the
   *  other axis). Also rotates `anisotropyRotation` where set. Absent / 0 → no
   *  rotation. Ignored without a textured `finish`. */
  finishRotation?: number
  /** Taper 0…1 (Stage 8b) — a pure vertex transform on box/extrude that shrinks
   *  the cross-section linearly along one axis: the face at the axis MAXIMUM
   *  becomes `1 − taper` of the face at the minimum (box → the +Y top shrinks in
   *  XZ; extrude → the +Z front shrinks in XY). Splayed carcass sides, tapered
   *  pedestals, A-frames. Composes with `bevel` (+ box `faceFinishes`); gated OFF
   *  for a hollow (`shell`) or plumped/tufted part (`taperable`). 0 / absent →
   *  today's straight geometry (byte-identical). See `taper.ts`. */
  taper?: number
}

/** True when a part accepts the Stage-8b `taper` deformer (box/extrude only).
 *  Box: any solid box (composes with bevel + per-face finishes); a hollow
 *  (`shell > 0`) or plumped (`plump > 0`, which also carries tuft) box is
 *  excluded — a uniform-wall carcass / stuffed-cushion displacement both assume
 *  a constant footprint the taper breaks. Extrude: any solid extrude; a hollow
 *  (`shell > 0`) extrude is excluded (same uniform-wall reason). Pure. */
export function taperable(part: ShapePart): boolean {
  if (part.kind === 'box') return (part.shell ?? 0) <= 0 && (part.plump ?? 0) <= 0
  if (part.kind === 'extrude') return (part.shell ?? 0) <= 0
  return false
}

/** True when a part is a SHARP box carrying at least one non-empty per-face
 *  finish override — the gate for the 3-material board build (Stage 6c). A
 *  bevelled/hollow/plumped box, or a box whose `faceFinishes` is all-empty,
 *  returns false → the single base material is used on every face. Pure. */
export function boxFaceFinishesActive(part: ShapePart): boolean {
  if (part.kind !== 'box') return false
  if ((part.bevel ?? 0) > 0 || (part.shell ?? 0) > 0 || (part.plump ?? 0) > 0) return false
  const f = part.faceFinishes
  return !!f && faceFinishHasOverride(f)
}

/** True when a `FaceFinishes` carries at least one zone with a colour or finish. */
export function faceFinishHasOverride(f: FaceFinishes): boolean {
  return (['top', 'bottom', 'sides'] as const).some(
    (z) => f[z]?.color !== undefined || f[z]?.finish !== undefined,
  )
}

/** Immutably set one zone's per-face override on a `FaceFinishes` (Stage 6c),
 *  merging `patch` over the zone's current value. A zone that ends up empty (no
 *  colour, no finish) is DROPPED; an all-empty result returns `undefined` so the
 *  part's `faceFinishes` field is cleared (spec stays clean). Pure + tested. */
export function setFaceFinish(
  ff: FaceFinishes | undefined,
  zone: FaceFinishZone,
  patch: FaceFinish,
): FaceFinishes | undefined {
  const cur = ff ?? {}
  const merged: FaceFinish = { ...cur[zone], ...patch }
  if (merged.color === undefined && merged.finish === undefined) {
    const { [zone]: _drop, ...rest } = cur
    return faceFinishHasOverride(rest) ? rest : undefined
  }
  const next = { ...cur, [zone]: merged }
  return next
}

/** Fallback PBR finish for a part that hasn't set its own (keeps old specs +
 *  the export/preview in lock-step). */
export const DEFAULT_PART_ROUGHNESS = 0.6
export const DEFAULT_PART_METALNESS = 0.05

/** Per-named-mesh edit applied to a source GLB's components (recolour / hide). */
export interface MeshOverride {
  /** Hex colour to repaint this mesh (absent = keep its original material). */
  color?: string
  /** Hide this mesh entirely. */
  hidden?: boolean
}

export interface AssetEditSpec {
  /** Optional source GLB asset id (a user/bundled def) to build around; absent =
   *  a fresh asset composed only of primitives. */
  sourceAssetId?: string
  /** Uniform scale applied to the source GLB (1 = unchanged). */
  sourceScale: number
  /** Primitive shapes kit-bashed into the asset. */
  parts: ShapePart[]
  /** Recolour/hide overrides keyed by the source GLB's mesh name. */
  meshOverrides: Record<string, MeshOverride>
  /** Non-destructive boolean-combine groups (CSG v2, Stage 1b). Absent/empty →
   *  no combines (every part renders on its own). Each group references ≥2
   *  member `parts` that stay editable; the built result is evaluated lazily. */
  combineGroups?: CombineGroup[]
  /** Named transform groups (Stage 3a). Absent/empty → no groups (every part
   *  builds at its own transform). A group's members build under a shared
   *  parent transform (`PartGroup.position`/`rotation`). Independent of
   *  `combineGroups` — a part can be in both. */
  partGroups?: PartGroup[]
  /** The id this design was last exported as a configurable product under
   *  (Stage 3d, finding 5). Stamped on first "Make configurable" and REUSED on
   *  every re-export so a re-export REPLACES the prior product instead of
   *  minting a duplicate. Round-trips through the spec envelope (v5). Absent →
   *  never exported. */
  exportedProductId?: string
  /** Projected surface details (Stage 5 — realism detail layer). Absent/empty →
   *  no decals. Each references a target `part` it's projected onto and follows;
   *  a deleted part prunes its decals (`pruneDecals`). */
  decals?: Decal[]
}

export function createEmptySpec(): AssetEditSpec {
  return { sourceScale: 1, parts: [], meshOverrides: {} }
}

/** Set (or clear) a per-mesh override immutably. An override that becomes empty
 *  (no colour, not hidden) is dropped so the mesh keeps its original look. */
export function setMeshOverride(
  spec: AssetEditSpec,
  meshName: string,
  patch: MeshOverride,
): AssetEditSpec {
  const next = { ...spec.meshOverrides[meshName], ...patch }
  if (next.color === undefined && !next.hidden) {
    const { [meshName]: _drop, ...rest } = spec.meshOverrides
    return { ...spec, meshOverrides: rest }
  }
  return { ...spec, meshOverrides: { ...spec.meshOverrides, [meshName]: next } }
}

let seq = 0
/** Fresh unique part id (also used by `csgCombine.ts` for the combined part). */
export function newPartId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  seq += 1
  return `shape-${Date.now().toString(36)}-${seq}`
}

/** Sensible starting dimensions per shape kind (metres). For `torus`, size is
 *  [outer diameter, tube diameter, _]; `capsule` is [diameter, total height, _]. */
const DEFAULT_SIZE: Record<PrimitiveShapeKind, [number, number, number]> = {
  box: [0.4, 0.4, 0.4],
  cylinder: [0.3, 0.5, 0.3],
  sphere: [0.3, 0.3, 0.3],
  cone: [0.4, 0.5, 0.4],
  pyramid: [0.5, 0.5, 0.5],
  capsule: [0.25, 0.6, 0.25],
  torus: [0.4, 0.12, 0.4],
  wedge: [0.5, 0.4, 0.5],
  lathe: [0.12, 0.5, 0.12], // [diameter, height, _] — a turned leg
  extrude: [0.4, 0.3, 0.12], // [width, height, depth]
  sweep: [0.5, 0.06, 0.5], // [pathExtent, tubeThickness, _] — a piping ring
  loft: [0.4, 0.5, 0.4], // [width, height, depth] — a tapered body
}

/** Per-kind extra parametric defaults (profiles/presets/bevel) applied by
 *  `defaultPart`. Kept out of `DEFAULT_SIZE` so `size` stays a clean tuple. */
function defaultShapeParams(kind: PrimitiveShapeKind): Partial<ShapePart> {
  switch (kind) {
    case 'lathe':
      return { profile: LATHE_PRESETS['turned-leg'].map((p) => [...p]), segments: 32 }
    case 'extrude':
      // Bevel ON by default for extrudes (Stage 1a realism default).
      return { outline: EXTRUDE_PRESETS['rounded-rect'].map((p) => [...p]), bevel: 0.02 }
    case 'sweep':
      return { sweepProfile: 'circle', sweepPath: 'ring' }
    case 'loft':
      return {
        loftBottom: LOFT_PRESETS['round-square'].bottom.map((p) => [...p] as [number, number]),
        loftTop: LOFT_PRESETS['round-square'].top.map((p) => [...p] as [number, number]),
      }
    default:
      return {}
  }
}

/** Sensible starting dimensions/colour + floor-resting Y per shape kind. */
export function defaultPart(kind: PrimitiveShapeKind): ShapePart {
  const size = [...DEFAULT_SIZE[kind]] as [number, number, number]
  // Rest the shape on the floor: a standing torus spans its outer radius in Y
  // (it lies in the XY plane); a sweep ring lies flat (thin in Y); everything
  // else spans half its height.
  const y = kind === 'torus' ? size[0] / 2 : kind === 'sweep' ? size[1] : size[1] / 2
  return {
    id: newPartId(),
    kind,
    position: [0, y, 0],
    size,
    color: '#b08d57',
    ...defaultShapeParams(kind),
  }
}

export function addPart(spec: AssetEditSpec, kind: PrimitiveShapeKind): AssetEditSpec {
  const part = defaultPart(kind)
  // Stagger each new shape to the right of the previous ones so they don't pile
  // up invisibly at the origin (the user then drags/positions from there).
  part.position = [spec.parts.length * 0.5, part.position[1], part.position[2]]
  return { ...spec, parts: [...spec.parts, part] }
}

export function removePart(spec: AssetEditSpec, id: string): AssetEditSpec {
  const parts = spec.parts.filter((p) => p.id !== id)
  // A part removed from under a combine group is pruned from its member list; a
  // group left with <2 members is dissolved (its survivor becomes a free part).
  // Transform groups are pruned too (an empty group is dropped). Any decal
  // projected onto the removed part is dropped (Stage 5).
  return prunePartGroups(pruneCombineGroups(pruneDecals({ ...spec, parts })))
}

let groupSeq = 0
/** Fresh unique combine-group id. Exported so a template builder (`templates.ts`)
 *  can mint a combine group's id (the vanity ships with a built-in basin-cutout
 *  combine); normal edits mint it via `addCombineGroup`. */
export function newCombineGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `grp-${crypto.randomUUID()}`
  }
  groupSeq += 1
  return `grp-${Date.now().toString(36)}-${groupSeq}`
}

/** The combine groups on a spec (never undefined). */
export function combineGroups(spec: AssetEditSpec): CombineGroup[] {
  return spec.combineGroups ?? []
}

/** The combine group that owns `partId`, or null when the part is free. */
export function groupForPart(spec: AssetEditSpec, partId: string): CombineGroup | null {
  return combineGroups(spec).find((g) => g.partIds.includes(partId)) ?? null
}

/** Ids of every part consumed by a combine group (rendered via the group result,
 *  not on their own). */
export function combinedPartIds(spec: AssetEditSpec): Set<string> {
  const set = new Set<string>()
  for (const g of combineGroups(spec)) for (const id of g.partIds) set.add(id)
  return set
}

/** Drop any member id that no longer names an existing part, and remove groups
 *  that fall below 2 members (a boolean needs ≥2 operands). Keeps the spec's
 *  `combineGroups` field absent when there are none, so old specs stay identical. */
export function pruneCombineGroups(spec: AssetEditSpec): AssetEditSpec {
  const groups = combineGroups(spec)
  if (groups.length === 0) return spec
  const live = new Set(spec.parts.map((p) => p.id))
  const next = groups
    .map((g) => ({ ...g, partIds: g.partIds.filter((id) => live.has(id)) }))
    .filter((g) => g.partIds.length >= 2)
  if (
    next.length === groups.length &&
    next.every((g, i) => g.partIds.length === groups[i].partIds.length)
  ) {
    return spec
  }
  return next.length > 0 ? { ...spec, combineGroups: next } : stripCombineGroups(spec)
}

/** Return a spec with no `combineGroups` field (keeps round-trips byte-identical
 *  to a fresh spec once the last group is gone). */
function stripCombineGroups(spec: AssetEditSpec): AssetEditSpec {
  if (spec.combineGroups === undefined) return spec
  const { combineGroups: _drop, ...rest } = spec
  return rest
}

/** Set (or clear) a part's solid/hole role immutably. `solid` (the default)
 *  clears the field so specs stay clean. No-op for an unknown id. */
export function setPartRole(spec: AssetEditSpec, id: string, role: PartRole): AssetEditSpec {
  return {
    ...spec,
    parts: spec.parts.map((p) =>
      p.id === id ? { ...p, role: role === 'solid' ? undefined : role } : p,
    ),
  }
}

/** True when a set of member ids do NOT all share the same transform-group home:
 *  they span two different `PartGroup`s, or mix a grouped member with an
 *  ungrouped one. A combine's baked result is placed under its members' shared
 *  transform-group container (so it moves with the group) — that only has a
 *  well-defined home when every member lives in the SAME group (or all are
 *  ungrouped, → the asset root). Pure. */
export function combineSpansPartGroups(spec: AssetEditSpec, partIds: string[]): boolean {
  const homes = new Set(partIds.map((id) => partGroupForPart(spec, id)?.id ?? null))
  return homes.size > 1
}

/** The single `PartGroup` every member of a combine group belongs to, or null
 *  when the members are all ungrouped (result lives at the asset root). Assumes
 *  the members don't span groups (guaranteed by `addCombineGroup`). Pure. */
export function combineHomeGroup(spec: AssetEditSpec, group: CombineGroup): PartGroup | null {
  const first = group.partIds[0]
  return first ? partGroupForPart(spec, first) : null
}

/**
 * Record a new combine group over `partIds` (selection order) with `op`.
 * Non-destructive: the members stay in `spec.parts`. Guards: ≥2 distinct
 * existing parts, none already consumed by another group (bake first to
 * re-combine a result), and every member sharing the SAME transform-group home
 * (all ungrouped OR all in one `PartGroup`) so the baked result has a
 * well-defined container to live in (finding 1 — combining ACROSS different
 * transform groups is blocked). Returns the spec unchanged (+ `groupId: null`)
 * if the inputs are invalid.
 */
export function addCombineGroup(
  spec: AssetEditSpec,
  partIds: string[],
  op: CombineOp,
): { spec: AssetEditSpec; groupId: string | null } {
  const distinct = [...new Set(partIds)]
  const live = new Set(spec.parts.map((p) => p.id))
  const alreadyGrouped = combinedPartIds(spec)
  if (distinct.length < 2 || distinct.some((id) => !live.has(id) || alreadyGrouped.has(id))) {
    return { spec, groupId: null }
  }
  // Members must share one transform-group home (see `combineSpansPartGroups`).
  if (combineSpansPartGroups(spec, distinct)) return { spec, groupId: null }
  const groups = combineGroups(spec)
  const id = newCombineGroupId()
  const group: CombineGroup = { id, name: `Combine ${groups.length + 1}`, partIds: distinct, op }
  // A combine member is consumed by the folded result — its per-part surface
  // details (decals + tufting) can't project onto that result reliably, so at
  // export they'd be silently dropped (`buildObject.ts` skips a consumed part's
  // mesh, and the decals live as children of that mesh). Prune them AS the part
  // joins the combine instead — one undo step, documented by the panel hint
  // ("Combines hide surface details — bake or ungroup first"). Ungrouping does
  // NOT resurrect them: once pruned they're gone from the spec (finding 2).
  const withGroup = pruneCombineMemberDetails(
    { ...spec, combineGroups: [...groups, group] },
    new Set(distinct),
  )
  return { spec: withGroup, groupId: id }
}

/** Drop the decals + clear the tuft field of every part in `memberSet` — the
 *  surface details a combine can't preserve on a consumed member (finding 2).
 *  Pure; a member with no details leaves the spec untouched for that part. */
function pruneCombineMemberDetails(
  spec: AssetEditSpec,
  memberSet: ReadonlySet<string>,
): AssetEditSpec {
  const parts = spec.parts.map((p) => {
    if (!memberSet.has(p.id) || p.tuft === undefined) return p
    const { tuft: _drop, ...rest } = p
    return rest
  })
  let next: AssetEditSpec = { ...spec, parts }
  const list = decals(next)
  const kept = list.filter((d) => !memberSet.has(d.partId))
  if (kept.length !== list.length) {
    next = kept.length > 0 ? { ...next, decals: kept } : stripDecals(next)
  }
  return next
}

/** Dissolve a combine group (ungroup) — its member parts become free again;
 *  nothing about the parts changes. No-op for an unknown group id. */
export function removeCombineGroup(spec: AssetEditSpec, groupId: string): AssetEditSpec {
  const groups = combineGroups(spec)
  const next = groups.filter((g) => g.id !== groupId)
  if (next.length === groups.length) return spec
  return next.length > 0 ? { ...spec, combineGroups: next } : stripCombineGroups(spec)
}

/**
 * "Bake to mesh": replace a combine group + its member parts with a single
 * frozen `mesh` part (the evaluated result, produced by the caller). The mesh
 * lands at the position of the group's first member so list order stays stable;
 * the group and its members are dropped. Pure — the caller owns the async
 * evaluation. No-op for an unknown group id.
 */
export function bakeCombineGroup(
  spec: AssetEditSpec,
  groupId: string,
  meshPart: ShapePart,
): AssetEditSpec {
  const group = combineGroups(spec).find((g) => g.id === groupId)
  if (!group) return spec
  const memberSet = new Set(group.partIds)
  // Emit the baked mesh in place of the FIRST member; drop the rest. Keeps the
  // surrounding (free) parts in their original order.
  const parts: ShapePart[] = []
  let emitted = false
  for (const p of spec.parts) {
    if (memberSet.has(p.id)) {
      if (!emitted) {
        parts.push(meshPart)
        emitted = true
      }
      continue
    }
    parts.push(p)
  }
  if (!emitted) parts.push(meshPart)
  // The member parts are gone (folded into the baked mesh); prune any decal that
  // was projected onto one of them so it doesn't orphan (Stage 5). Decals on the
  // surrounding free parts are untouched.
  return pruneDecals(removeCombineGroup({ ...spec, parts }, groupId))
}

// ---- Transform groups (Stage 3a) -----------------------------------------

let partGroupSeq = 0
/** Fresh unique transform-group id. Exported so template builders
 *  (`templates.ts`) can mint a wrapping group's id with the same `pg-` prefix. */
export function newPartGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pg-${crypto.randomUUID()}`
  }
  partGroupSeq += 1
  return `pg-${Date.now().toString(36)}-${partGroupSeq}`
}

/** The transform groups on a spec (never undefined). */
export function partGroups(spec: AssetEditSpec): PartGroup[] {
  return spec.partGroups ?? []
}

/** The transform group that owns `partId`, or null when the part is ungrouped. */
export function partGroupForPart(spec: AssetEditSpec, partId: string): PartGroup | null {
  return partGroups(spec).find((g) => g.partIds.includes(partId)) ?? null
}

/** Ids of every part that belongs to some transform group. */
export function partGroupMemberIds(spec: AssetEditSpec): Set<string> {
  const set = new Set<string>()
  for (const g of partGroups(spec)) for (const id of g.partIds) set.add(id)
  return set
}

/** Return a spec with no `partGroups` field (keeps round-trips byte-identical to
 *  a fresh spec once the last group is gone). */
function stripPartGroups(spec: AssetEditSpec): AssetEditSpec {
  if (spec.partGroups === undefined) return spec
  const { partGroups: _drop, ...rest } = spec
  return rest
}

/** Drop any member id that no longer names an existing part, and remove groups
 *  left with no members. Keeps the field absent when there are none. */
function prunePartGroups(spec: AssetEditSpec): AssetEditSpec {
  const groups = partGroups(spec)
  if (groups.length === 0) return spec
  const live = new Set(spec.parts.map((p) => p.id))
  const next = groups
    .map((g) => ({ ...g, partIds: g.partIds.filter((id) => live.has(id)) }))
    .filter((g) => g.partIds.length >= 1)
  if (
    next.length === groups.length &&
    next.every((g, i) => g.partIds.length === groups[i].partIds.length)
  ) {
    return spec
  }
  return next.length > 0 ? { ...spec, partGroups: next } : stripPartGroups(spec)
}

/**
 * Record a new transform group over `partIds` (add order). Guards: ≥1 distinct
 * existing part, none already in another transform group (a part is in at most
 * one PartGroup). The members keep their own transforms — the group starts with
 * an identity transform. Returns the spec unchanged (+ `groupId: null`) if the
 * inputs are invalid.
 */
export function addPartGroup(
  spec: AssetEditSpec,
  partIds: string[],
): { spec: AssetEditSpec; groupId: string | null } {
  const distinct = [...new Set(partIds)]
  const live = new Set(spec.parts.map((p) => p.id))
  const alreadyGrouped = partGroupMemberIds(spec)
  if (distinct.length < 1 || distinct.some((id) => !live.has(id) || alreadyGrouped.has(id))) {
    return { spec, groupId: null }
  }
  const groups = partGroups(spec)
  const id = newPartGroupId()
  const group: PartGroup = { id, name: `Group ${groups.length + 1}`, partIds: distinct }
  return { spec: { ...spec, partGroups: [...groups, group] }, groupId: id }
}

/** Rename a transform group immutably. No-op for an unknown id or a blank name. */
export function renamePartGroup(spec: AssetEditSpec, groupId: string, name: string): AssetEditSpec {
  const trimmed = name.trim()
  if (!trimmed) return spec
  const groups = partGroups(spec)
  if (!groups.some((g) => g.id === groupId)) return spec
  return {
    ...spec,
    partGroups: groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)),
  }
}

/** Set the group's transform immutably. An all-zero position/rotation clears the
 *  field so the spec stays clean (identity → absent). No-op for an unknown id. */
export function updatePartGroupTransform(
  spec: AssetEditSpec,
  groupId: string,
  patch: { position?: [number, number, number]; rotation?: [number, number, number] },
): AssetEditSpec {
  const groups = partGroups(spec)
  if (!groups.some((g) => g.id === groupId)) return spec
  const isZero = (t?: [number, number, number]) => !t || t.every((v) => v === 0)
  return {
    ...spec,
    partGroups: groups.map((g) => {
      if (g.id !== groupId) return g
      const next: PartGroup = { ...g }
      if (patch.position !== undefined) {
        if (isZero(patch.position)) delete next.position
        else next.position = patch.position
      }
      if (patch.rotation !== undefined) {
        if (isZero(patch.rotation)) delete next.rotation
        else next.rotation = patch.rotation
      }
      return next
    }),
  }
}

/** Remove a transform group's entity WITHOUT touching its members' transforms.
 *  Only correct on its own when the group transform is identity — the flattening
 *  ungroup (`groupTransform.ts:ungroupPartGroup`) uses this after baking the
 *  group transform into each member so nothing jumps. No-op for an unknown id. */
export function removePartGroupRaw(spec: AssetEditSpec, groupId: string): AssetEditSpec {
  const groups = partGroups(spec)
  const next = groups.filter((g) => g.id !== groupId)
  if (next.length === groups.length) return spec
  return next.length > 0 ? { ...spec, partGroups: next } : stripPartGroups(spec)
}

/** Deep-copy one part with a fresh id (shared by duplicate/mirror of parts +
 *  groups). `xform` remaps position/rotation for a mirror; identity for a plain
 *  copy. Arrays are deep-copied so the clone never shares a mutable tuple. */
function clonePart(
  src: ShapePart,
  xform: (p: ShapePart) => Pick<ShapePart, 'position' | 'rotation'>,
): ShapePart {
  const { position, rotation } = xform(src)
  return {
    ...src,
    id: newPartId(),
    position,
    size: [...src.size],
    rotation: rotation ? [...rotation] : undefined,
    profile: src.profile ? src.profile.map((p) => [...p]) : undefined,
    outline: src.outline ? src.outline.map((p) => [...p]) : undefined,
    loftBottom: src.loftBottom ? src.loftBottom.map((p) => [...p] as [number, number]) : undefined,
    loftTop: src.loftTop ? src.loftTop.map((p) => [...p] as [number, number]) : undefined,
    sweepPoints: src.sweepPoints
      ? src.sweepPoints.map((p) => [...p] as [number, number, number])
      : undefined,
    sweepPathPoints: src.sweepPathPoints
      ? src.sweepPathPoints.map((p) => [...p] as [number, number])
      : undefined,
    gradient: src.gradient ? { ...src.gradient } : undefined,
    // Stage 6c: per-face finishes deep-copied (nested zone objects); the scalar
    // finishScale/finishRotation ride the `...src` spread. Duplicate/mirror copy
    // grain direction VERBATIM — a reflection preserves the axis the grain runs
    // along (it only reverses an imperceptible direction on a tiling texture), so
    // there is no X↔Z flip to apply (the mirror keeps top/bottom/edge zones too).
    faceFinishes: src.faceFinishes ? cloneFaceFinishes(src.faceFinishes) : undefined,
    // Stage 7c: the tufting grid is a small mutable object — deep-copy so the
    // clone never shares it (like faceFinishes). Its generated button decals ride
    // through `appendClonedDecals` (they carry the `tuft` flag via `...d`).
    tuft: src.tuft ? { ...src.tuft } : undefined,
  }
}

/** Deep-copy a `FaceFinishes` (its nested zone objects) so a clone never shares a
 *  mutable zone with its source. */
function cloneFaceFinishes(f: FaceFinishes): FaceFinishes {
  const out: FaceFinishes = {}
  if (f.top) out.top = { ...f.top }
  if (f.bottom) out.bottom = { ...f.bottom }
  if (f.sides) out.sides = { ...f.sides }
  return out
}

/**
 * Duplicate a whole transform group: DEEP-COPY every member (fresh ids), append
 * the copies, and add a new group over them offset slightly (+X) from the
 * original's transform so it's visible. Returns `{ spec, groupId }` with the new
 * group id (or the spec unchanged + null for an unknown id).
 */
export function duplicatePartGroup(
  spec: AssetEditSpec,
  groupId: string,
): { spec: AssetEditSpec; groupId: string | null } {
  const group = partGroups(spec).find((g) => g.id === groupId)
  if (!group) return { spec, groupId: null }
  const copies: ShapePart[] = []
  const pairs: Array<{ srcId: string; newId: string }> = []
  for (const id of group.partIds) {
    const src = spec.parts.find((p) => p.id === id)
    if (!src) continue
    const copy = clonePart(src, (p) => ({ position: [...p.position], rotation: p.rotation }))
    copies.push(copy)
    pairs.push({ srcId: id, newId: copy.id })
  }
  if (copies.length === 0) return { spec, groupId: null }
  const gp = group.position ?? [0, 0, 0]
  const groups = partGroups(spec)
  const newId = newPartGroupId()
  const copyGroup: PartGroup = {
    id: newId,
    name: `Group ${groups.length + 1}`,
    partIds: copies.map((p) => p.id),
    position: [gp[0] + 0.3, gp[1], gp[2]],
    rotation: group.rotation ? [...group.rotation] : undefined,
  }
  const nextSpec = appendClonedDecals(
    { ...spec, parts: [...spec.parts, ...copies], partGroups: [...groups, copyGroup] },
    pairs,
  )
  return { spec: nextSpec, groupId: newId }
}

/**
 * Mirror a whole transform group across the asset's centre (the X=0 / YZ plane):
 * deep-copy every member mirrored (same convention as `mirrorPart` — X negated,
 * Y/Z rotations negated) and add a new group whose transform is likewise
 * mirrored, so a symmetric assembly (two arms, a leg cluster) is one click.
 * Returns `{ spec, groupId }`.
 */
export function mirrorPartGroup(
  spec: AssetEditSpec,
  groupId: string,
): { spec: AssetEditSpec; groupId: string | null } {
  const group = partGroups(spec).find((g) => g.id === groupId)
  if (!group) return { spec, groupId: null }
  const copies: ShapePart[] = []
  const pairs: Array<{ srcId: string; newId: string }> = []
  for (const id of group.partIds) {
    const src = spec.parts.find((p) => p.id === id)
    if (!src) continue
    const copy = clonePart(src, (p) => ({
      position: [-p.position[0], p.position[1], p.position[2]],
      rotation: p.rotation ? [p.rotation[0], -p.rotation[1], -p.rotation[2]] : undefined,
    }))
    copies.push(copy)
    pairs.push({ srcId: id, newId: copy.id })
  }
  if (copies.length === 0) return { spec, groupId: null }
  const gp = group.position ?? [0, 0, 0]
  const gr = group.rotation
  const groups = partGroups(spec)
  const newId = newPartGroupId()
  const mirroredPos: [number, number, number] = [-gp[0], gp[1], gp[2]]
  const mirrorGroup: PartGroup = {
    id: newId,
    name: `Group ${groups.length + 1}`,
    partIds: copies.map((p) => p.id),
    ...(mirroredPos.some((v) => v !== 0) ? { position: mirroredPos } : {}),
    ...(gr ? { rotation: [gr[0], -gr[1], -gr[2]] as [number, number, number] } : {}),
  }
  const nextSpec = appendClonedDecals(
    { ...spec, parts: [...spec.parts, ...copies], partGroups: [...groups, mirrorGroup] },
    pairs,
    { x: true },
  )
  return { spec: nextSpec, groupId: newId }
}

/**
 * Land a placed component (Stage 3b): append its `parts` and wrap them in a new
 * named `PartGroup` carrying the mount `position`/`rotation` (from
 * `componentPlace.ts`). Because a component is just parts + a transform group, it
 * is fully editable once placed (gizmo, inspector, ungroup) with no new part
 * kind. Guards: ≥1 part. An all-zero position/rotation is left absent so the spec
 * stays clean. Returns `{ spec, groupId }` (groupId null when `parts` is empty).
 */
export function addPlacedComponent(
  spec: AssetEditSpec,
  parts: ShapePart[],
  name: string,
  position?: [number, number, number],
  rotation?: [number, number, number],
): { spec: AssetEditSpec; groupId: string | null } {
  if (parts.length === 0) return { spec, groupId: null }
  const id = newPartGroupId()
  const group: PartGroup = { id, name, partIds: parts.map((p) => p.id) }
  if (position?.some((v) => v !== 0)) group.position = position
  if (rotation?.some((v) => v !== 0)) group.rotation = rotation
  return {
    spec: {
      ...spec,
      parts: [...spec.parts, ...parts],
      partGroups: [...partGroups(spec), group],
    },
    groupId: id,
  }
}

/** The centre (X, Z) of the asset's symmetry frame — the AABB centre of the
 *  UNGROUPED solid parts (the asset body a fitting attaches to, e.g. a tabletop),
 *  falling back to all non-hole parts, then all parts, then the origin. Ignores
 *  part rotation (an axis-aligned approximation — enough for X/Z mirroring). Pure. */
function assetCenterXZ(spec: AssetEditSpec): [number, number] {
  const grouped = partGroupMemberIds(spec)
  let pool = spec.parts.filter((p) => !grouped.has(p.id) && p.role !== 'hole')
  if (pool.length === 0) pool = spec.parts.filter((p) => p.role !== 'hole')
  if (pool.length === 0) pool = spec.parts
  if (pool.length === 0) return [0, 0]
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of pool) {
    minX = Math.min(minX, p.position[0] - p.size[0] / 2)
    maxX = Math.max(maxX, p.position[0] + p.size[0] / 2)
    minZ = Math.min(minZ, p.position[2] - p.size[2] / 2)
    maxZ = Math.max(maxZ, p.position[2] + p.size[2] / 2)
  }
  return [(minX + maxX) / 2, (minZ + maxZ) / 2]
}

/** Symmetric-repeat mode for a placed component group (Stage 3b). */
export type SymmetryMode = 'mirror-x' | 'mirror-z' | 'quad'

/**
 * Duplicate a component (transform) group to its symmetric position(s) about the
 * asset's bounding-box centre (`assetCenterXZ`) — the real furniture win: place
 * one leg/foot, then one tap mirrors it to the 2 (`mirror-x`/`mirror-z`) or 4
 * (`quad`) corners. Each copy DEEP-COPIES the members (fresh ids) and carries a
 * mirrored group transform (position reflected across the centre; rotation
 * reflected with the same X-mirror convention as `mirrorPartGroup`). Pure. No-op
 * (empty `groupIds`) for an unknown id.
 */
export function repeatComponentGroup(
  spec: AssetEditSpec,
  groupId: string,
  mode: SymmetryMode,
): { spec: AssetEditSpec; groupIds: string[] } {
  const group = partGroups(spec).find((g) => g.id === groupId)
  if (!group) return { spec, groupIds: [] }
  const [cx, cz] = assetCenterXZ(spec)
  const gp = group.position ?? [0, 0, 0]
  const gr = group.rotation
  type Target = {
    pos: [number, number, number]
    rot?: [number, number, number]
    flip: { x?: boolean; z?: boolean }
  }
  const mirrorX = (): Target => ({
    pos: [2 * cx - gp[0], gp[1], gp[2]],
    rot: gr ? [gr[0], -gr[1], -gr[2]] : undefined,
    flip: { x: true },
  })
  const mirrorZ = (): Target => ({
    pos: [gp[0], gp[1], 2 * cz - gp[2]],
    rot: gr ? [-gr[0], -gr[1], gr[2]] : undefined,
    flip: { z: true },
  })
  const mirrorXZ = (): Target => ({
    pos: [2 * cx - gp[0], gp[1], 2 * cz - gp[2]],
    rot: gr ? [-gr[0], gr[1], -gr[2]] : undefined,
    flip: { x: true, z: true },
  })
  const targets: Target[] =
    mode === 'mirror-x'
      ? [mirrorX()]
      : mode === 'mirror-z'
        ? [mirrorZ()]
        : [mirrorX(), mirrorZ(), mirrorXZ()]

  let next = spec
  const groupIds: string[] = []
  for (const t of targets) {
    const copies: ShapePart[] = []
    const pairs: Array<{ srcId: string; newId: string }> = []
    for (const id of group.partIds) {
      const src = next.parts.find((p) => p.id === id)
      if (!src) continue
      const copy = clonePart(src, (p) => ({ position: [...p.position], rotation: p.rotation }))
      copies.push(copy)
      pairs.push({ srcId: id, newId: copy.id })
    }
    if (copies.length === 0) continue
    const newId = newPartGroupId()
    const copyGroup: PartGroup = {
      id: newId,
      name: group.name,
      partIds: copies.map((p) => p.id),
      ...(t.pos.some((v) => v !== 0) ? { position: t.pos } : {}),
      ...(t.rot?.some((v) => v !== 0) ? { rotation: t.rot } : {}),
    }
    next = appendClonedDecals(
      {
        ...next,
        parts: [...next.parts, ...copies],
        partGroups: [...partGroups(next), copyGroup],
      },
      pairs,
      t.flip,
    )
    groupIds.push(newId)
  }
  return { spec: next, groupIds }
}

/** Clone a part (full transform + material), offset slightly along X so the copy
 *  is visible, and append it. Returns the spec unchanged if the id is unknown.
 *  Arrays are deep-copied so the clone never shares a mutable tuple. */
export function duplicatePart(spec: AssetEditSpec, id: string): AssetEditSpec {
  const src = spec.parts.find((p) => p.id === id)
  if (!src) return spec
  const copy = clonePart(src, (p) => ({
    position: [p.position[0] + 0.2, p.position[1], p.position[2]],
    rotation: p.rotation,
  }))
  return appendClonedDecals({ ...spec, parts: [...spec.parts, copy] }, [
    { srcId: id, newId: copy.id },
  ])
}

/** Clone a part mirrored across the asset's centre (the X=0 / YZ plane): the
 *  copy sits at the opposite X with its Y/Z rotations negated, so a symmetric
 *  pair (chair arms, table legs, sofa sides) is one click. Geometry isn't
 *  negatively scaled, so symmetric primitives mirror exactly and an asymmetric
 *  one (wedge) mirrors its placement but keeps its own handedness. No-op for an
 *  unknown id. */
export function mirrorPart(spec: AssetEditSpec, id: string): AssetEditSpec {
  return mirrorPartAxis(spec, id, 'x').spec
}

export function updatePart(
  spec: AssetEditSpec,
  id: string,
  patch: Partial<ShapePart>,
): AssetEditSpec {
  const old = spec.parts.find((p) => p.id === id)
  const parts = spec.parts.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p))
  const next: AssetEditSpec = { ...spec, parts }
  // Resizing a part keeps its decals on the same RELATIVE spot of the surface:
  // a decal's local position scales proportionally per axis with the part size
  // (its normal is unchanged). Without this the decal drifts off the resized
  // face (Stage 5 — decals are stored in the part's local frame).
  if (old && patch.size && !sameSize(old.size, patch.size)) {
    return rescalePartDecals(next, id, old.size, patch.size)
  }
  return next
}

/** True when two size tuples are componentwise equal. */
function sameSize(a: [number, number, number], b: [number, number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

/** Scale a part's decals' local positions by the per-axis size change (normals
 *  unchanged), so each decal stays on the same fraction of the resized surface.
 *  A zero old extent on an axis leaves that component untouched (no divide). Pure. */
function rescalePartDecals(
  spec: AssetEditSpec,
  partId: string,
  oldSize: [number, number, number],
  newSize: [number, number, number],
): AssetEditSpec {
  const list = decals(spec)
  if (!list.some((d) => d.partId === partId)) return spec
  const f: [number, number, number] = [
    oldSize[0] !== 0 ? newSize[0] / oldSize[0] : 1,
    oldSize[1] !== 0 ? newSize[1] / oldSize[1] : 1,
    oldSize[2] !== 0 ? newSize[2] / oldSize[2] : 1,
  ]
  return {
    ...spec,
    decals: list.map((d) =>
      d.partId === partId
        ? {
            ...d,
            position: [d.position[0] * f[0], d.position[1] * f[1], d.position[2] * f[2]],
          }
        : d,
    ),
  }
}

/** Set (or clear) a part's display name immutably (Stage 4). A blank name clears
 *  the field so the layers panel falls back to the default `kind N` label. No-op
 *  for an unknown id. */
export function renamePart(spec: AssetEditSpec, id: string, name: string): AssetEditSpec {
  const trimmed = name.trim()
  if (!spec.parts.some((p) => p.id === id)) return spec
  return {
    ...spec,
    parts: spec.parts.map((p) => (p.id === id ? { ...p, name: trimmed || undefined } : p)),
  }
}

/** The layers-panel label for a part: its user name when set, else the default
 *  `kind N` (N = its 1-based position in the parts array). Pure. */
export function partLabel(part: ShapePart, number: number): string {
  return part.name?.trim() || `${part.kind} ${number}`
}

/** Which asset origin plane a designer mirror reflects across: `'x'` reflects X
 *  (the YZ plane, left↔right), `'z'` reflects Z (the XY plane, front↔back). */
export type MirrorAxis3 = 'x' | 'z'

/**
 * Reflect a transform across the asset origin plane on `axis` — the SINGLE
 * conjugation every designer mirror shares (`mirrorPart`, `mirrorPartGroup`,
 * `repeatComponentGroup` all use this convention): X-mirror negates X and the
 * Y/Z rotations; Z-mirror negates Z and the X/Y rotations. Pure.
 */
export function mirroredTransform(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] | undefined,
  axis: MirrorAxis3,
): { position: [number, number, number]; rotation?: [number, number, number] } {
  if (axis === 'x') {
    return {
      position: [-position[0], position[1], position[2]],
      rotation: rotation ? [rotation[0], -rotation[1], -rotation[2]] : undefined,
    }
  }
  return {
    position: [position[0], position[1], -position[2]],
    rotation: rotation ? [-rotation[0], -rotation[1], rotation[2]] : undefined,
  }
}

/** Clone a part with a fresh id at an explicit pose (deep-copies its arrays) —
 *  the array/mirror building block, exported for `arrayBuild.ts`. */
export function clonePartAtPose(
  src: ShapePart,
  position: [number, number, number],
  rotation?: [number, number, number],
): ShapePart {
  return clonePart(src, () => ({ position, rotation }))
}

/**
 * Mirror one part across the asset origin plane on `axis` (X or Z), appending a
 * mirrored copy — the axis-aware extension of `mirrorPart` (which stays an
 * X-only alias). Reuses the shared `mirroredTransform` conjugation. No-op for an
 * unknown id. Returns `{ spec, newId }`.
 */
export function mirrorPartAxis(
  spec: AssetEditSpec,
  id: string,
  axis: MirrorAxis3,
): { spec: AssetEditSpec; newId: string | null } {
  const src = spec.parts.find((p) => p.id === id)
  if (!src) return { spec, newId: null }
  const copy = clonePart(src, (p) => mirroredTransform(p.position, p.rotation, axis))
  const withCopy = appendClonedDecals(
    { ...spec, parts: [...spec.parts, copy] },
    [{ srcId: id, newId: copy.id }],
    { x: axis === 'x', z: axis === 'z' },
  )
  return { spec: withCopy, newId: copy.id }
}

/**
 * Mirror a whole multi-selection across the asset origin plane on `axis`,
 * appending a mirrored copy of every given part (each reflected by the shared
 * `mirroredTransform`) so a symmetric assembly is one action. Returns
 * `{ spec, newIds }` (empty when no id resolves). Pure.
 */
export function mirrorPartsAxis(
  spec: AssetEditSpec,
  ids: string[],
  axis: MirrorAxis3,
): { spec: AssetEditSpec; newIds: string[] } {
  const copies: ShapePart[] = []
  const pairs: Array<{ srcId: string; newId: string }> = []
  for (const id of ids) {
    const src = spec.parts.find((p) => p.id === id)
    if (!src) continue
    const copy = clonePart(src, (p) => mirroredTransform(p.position, p.rotation, axis))
    copies.push(copy)
    pairs.push({ srcId: id, newId: copy.id })
  }
  if (copies.length === 0) return { spec, newIds: [] }
  const withCopies = appendClonedDecals({ ...spec, parts: [...spec.parts, ...copies] }, pairs, {
    x: axis === 'x',
    z: axis === 'z',
  })
  return { spec: withCopies, newIds: copies.map((p) => p.id) }
}

// ---- Decals / detail layer (Stage 5) --------------------------------------

let decalSeq = 0
/** Fresh unique decal id (internal — decals are only minted by `addDecal`). */
function newDecalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dcl-${crypto.randomUUID()}`
  }
  decalSeq += 1
  return `dcl-${Date.now().toString(36)}-${decalSeq}`
}

/** The decals on a spec (never undefined). */
export function decals(spec: AssetEditSpec): Decal[] {
  return spec.decals ?? []
}

/** Decals projected onto a given part (in render/build order). */
export function decalsForPart(spec: AssetEditSpec, partId: string): Decal[] {
  return decals(spec).filter((d) => d.partId === partId)
}

/** Return a spec with no `decals` field (keeps round-trips byte-identical to a
 *  fresh spec once the last decal is gone). */
function stripDecals(spec: AssetEditSpec): AssetEditSpec {
  if (spec.decals === undefined) return spec
  const { decals: _drop, ...rest } = spec
  return rest
}

/**
 * Record a projected decal onto a part (Stage 5). Mints a fresh id; the caller
 * supplies the target `partId`, part-local `position`/`normal`, `size`, `kind`
 * (+ optional colour/roll). Guards: the target part must exist. Returns
 * `{ spec, decalId }` (decalId null for an unknown part).
 */
export function addDecal(
  spec: AssetEditSpec,
  decal: Omit<Decal, 'id'>,
): { spec: AssetEditSpec; decalId: string | null } {
  if (!spec.parts.some((p) => p.id === decal.partId)) return { spec, decalId: null }
  const id = newDecalId()
  return { spec: { ...spec, decals: [...decals(spec), { ...decal, id }] }, decalId: id }
}

/** Remove one decal immutably. Drops the `decals` field once the last is gone.
 *  No-op for an unknown id. */
export function removeDecal(spec: AssetEditSpec, id: string): AssetEditSpec {
  const list = decals(spec)
  const next = list.filter((d) => d.id !== id)
  if (next.length === list.length) return spec
  return next.length > 0 ? { ...spec, decals: next } : stripDecals(spec)
}

/** Patch one decal's fields (size/colour/rotation/…) immutably. No-op for an
 *  unknown id; `id`/`partId` are preserved. */
export function updateDecal(
  spec: AssetEditSpec,
  id: string,
  patch: Partial<Omit<Decal, 'id' | 'partId'>>,
): AssetEditSpec {
  const list = decals(spec)
  if (!list.some((d) => d.id === id)) return spec
  return {
    ...spec,
    decals: list.map((d) => (d.id === id ? { ...d, ...patch, id: d.id, partId: d.partId } : d)),
  }
}

/** Drop any decal whose target part no longer exists (called by `removePart`).
 *  Keeps the field absent when there are none. Pure. */
export function pruneDecals(spec: AssetEditSpec): AssetEditSpec {
  const list = decals(spec)
  if (list.length === 0) return spec
  const live = new Set(spec.parts.map((p) => p.id))
  const next = list.filter((d) => live.has(d.partId))
  if (next.length === list.length) return spec
  return next.length > 0 ? { ...spec, decals: next } : stripDecals(spec)
}

/** Reflect a decal's LOCAL position + normal across the requested axes — the
 *  detail-layer counterpart to `mirroredTransform`. The mirrored part keeps its
 *  geometry handedness (positions aren't negatively scaled), so a straight
 *  negation of the local point + normal on the flipped axis lands the decal on
 *  the mirror-image spot of the copy's surface. Pure. */
function transformDecalLocal(
  d: Decal,
  flip: { x?: boolean; z?: boolean } | undefined,
): Pick<Decal, 'position' | 'normal'> {
  const position: [number, number, number] = [...d.position]
  const normal: [number, number, number] = [...d.normal]
  if (flip?.x) {
    position[0] = -position[0]
    normal[0] = -normal[0]
  }
  if (flip?.z) {
    position[2] = -position[2]
    normal[2] = -normal[2]
  }
  return { position, normal }
}

/**
 * Clone the decals of each source part onto its cloned counterpart, appending the
 * fresh decals (each with a new id) to the spec. `pairs` maps `srcId → newId`
 * (the ids `clonePart`/`clonePartAtPose` produced); `flip` mirrors every cloned
 * decal's local pose for a mirror op (X and/or Z). Keeps the `decals` field
 * absent when the sources carry none, so a decal-free clone stays byte-identical.
 * Pure — shared by duplicate/mirror/array of parts + groups.
 */
export function appendClonedDecals(
  spec: AssetEditSpec,
  pairs: Array<{ srcId: string; newId: string }>,
  flip?: { x?: boolean; z?: boolean },
): AssetEditSpec {
  const src = decals(spec)
  if (src.length === 0 || pairs.length === 0) return spec
  const add: Decal[] = []
  for (const { srcId, newId } of pairs) {
    for (const d of src) {
      if (d.partId !== srcId) continue
      add.push({ ...d, ...transformDecalLocal(d, flip), id: newDecalId(), partId: newId })
    }
  }
  if (add.length === 0) return spec
  return { ...spec, decals: [...src, ...add] }
}

/** True when the spec would produce a non-empty asset (a source or ≥1 part). */
export function isBuildable(spec: AssetEditSpec): boolean {
  return !!spec.sourceAssetId || spec.parts.length > 0
}
