/**
 * Attach baked aperture-visibility maps to the meshes of a live scene — item (w)'s wiring.
 *
 * Pulls together the four pure modules: `lightmapIndex` (which maps exist), `lightmapKey` (what
 * a live mesh is called in that set), `lightmapUv` (the `uv1` the maps were baked in), and
 * `visibilityLightmap` (the shader patch and its gain).
 *
 * **Attach cost, stated because it constrains the caller.** Adding an `aoMap` compiles a new
 * shader variant per material — ~19 across a plan — and doing it mid-session cost a **216 ms**
 * frame (`v0.31.7.15`). Steady-state cost is nil: 60 fps unchanged at `performance` and `medium`
 * with 331 distinct maps attached. So call this **once, while the scene is still loading**, and
 * never in response to a live toggle.
 *
 * Every failure path degrades to today's render rather than throwing. A missing asset, a stale
 * index, an unbaked plan — all of them must leave a working scene, because the alternative is
 * trading a fidelity improvement for a blank canvas.
 */
import type { BufferGeometry, Mesh, MeshStandardMaterial, Object3D, Texture } from 'three'
import { Box3, BufferAttribute, Matrix3, Matrix4, Vector3 } from 'three'
import { MITRE_END_ATTR } from '../apartment/walls/wallBodyGeometry'
import { isGlazing, isSectionCap } from '../apartment/walls/wallReveal'
import { isFeatureEnabled } from '../features/featureFlags'
import { LAMP_BOUNCE_K, LAMP_BOUNCE_ORIENTATION } from './lampBounce'
import { daytimeSkyTint } from './lighting/altitudeCurve'
import { sunBounceShare } from './lighting/weather'
import {
  markCutCapFaces,
  markExteriorFaces,
  markMitreEndFaces,
  markOpeningSoffitFaces,
} from './lightmapExterior'
import { createLightmapResolver, type LightmapIndex } from './lightmapIndex'
import { lightmapKey } from './lightmapKey'
import { computeMitreEndInheritUv } from './lightmapMitre'
import { chooseNeighbourDonor, type WorldAabb } from './lightmapNeighbour'
import { ceilingClampV, computeBoxAtlasUv } from './lightmapUv'
import {
  applyVisibilityLightmap,
  detachVisibilityLightmap,
  exteriorBoostBase,
  IRRADIANCE_GAIN,
} from './visibilityLightmap'

/** Where the baked set lives, base-path aware so it survives a non-root deployment.
 *  Not exported: it is the default for `baseUrl` below, and an export nothing imports fails
 *  `npm run deadcode`. */
const LIGHTMAP_BASE = `${import.meta.env.BASE_URL}assets/lightmaps`

/**
 * How much of the daytime sky's chroma the injected irradiance carries, PER SURFACE ORIENTATION
 * — see `(z4)` for the mechanism and `(z8)` for why one number could not do the job.
 *
 * 0 reproduces the old achromatic term exactly; 1 is the full luminance-preserving sky tint.
 *
 * **Why three values.** `(z4)` shipped a single strength calibrated on ONE vertical wall and
 * applied it to every baked surface. That over-cooled ceilings by **7 counts** of R−B, and it had
 * to: a ceiling faces DOWN, so its indirect arrives off the floor as WARM bounce, not from the
 * sky. Sky chroma is simply the wrong illuminant for a downward-facing surface, and no single
 * scalar can be right for both.
 *
 * **Every value is MEASURED, not chosen.** Daylight-only (lights off on both sides, which is the
 * arm `v0.31.7.8`'s decision endorses for calibration), one pose in `livingDining` at 13:00, each
 * surface's R−B read at strength 0 and 1 and the target solved from the Cycles reference:
 *
 * | surface   | s=0  | s=1   | Cycles | solved |
 * | --------- | ---- | ----- | ------ | ------ |
 * | ceiling   |  0.0 | −20.4 | −11.0  | 0.539  |
 * | wall      |  1.8 | −16.9 | −14.4  | 0.866  |
 *
 * The FLOOR row of that table was measured on frames where the floor's own lightmap had NOT yet
 * attached (`(z10)`) and is void. Re-measured with the GI settled, its endpoints are **38.1 at 0
 * and 25.2 at 1** — a span of only 12.9, so the lever SATURATES: even fully sky-coloured the floor
 * stays **5.7 counts too warm** against Cycles' 19.5. `up` is therefore set to the lever's maximum
 * rather than to a solved value, which also restores the ordering physics expects — of the three,
 * a floor sees sky through the glazing most directly, so it should carry the MOST sky chroma:
 * `up 1.0 > side 0.866 > down 0.539`.
 *
 * The residual is not a tint-strength problem and cannot be fixed by this dial: the floor's R−B is
 * dominated by its warm wood albedo (0.527 / 0.361 / 0.216), which both renderers share, so a
 * chroma multiplier on the indirect term cannot close the last 5.7 counts.
 *
 * The wall's 0.866 independently reproduces `(z4)`'s 0.87, which was fitted lights-ON at 17:00
 * against this run's lights-OFF at 13:00 — two different arms agreeing on the same surface is the
 * reason to trust the mechanism rather than just the number.
 *
 * **Known limit: n = 1 room.** One pose in one room set all three. The ORDERING is physical
 * (a ceiling needs least sky chroma) but the exact values are not yet corroborated elsewhere, and
 * the floor coming out below the wall is mildly against expectation for a surface that sees sky
 * through the glazing directly. Treat as measured-but-provisional.
 */
export const SKY_TINT_STRENGTH: Readonly<Record<'up' | 'down' | 'side', number>> = {
  /** Floors. Sees sky through the glazing most directly of the three, so it carries the MOST
   *  sky chroma -- and 1.0 is the lever's maximum, not a solved value (see above). */
  up: 1,
  /** Ceilings. Faces down onto a warm floor, so it needs the LEAST sky chroma. */
  down: 0.539,
  /** Walls and everything else. */
  side: 0.866,
}

/**
 * Which way a baked mesh predominantly faces, in WORLD space.
 *
 * Averaged over the normal attribute and pushed through the world matrix, because the local
 * normal is meaningless on its own: a floor is a `PlaneGeometry` whose local normal is +Z and
 * which is rotated −π/2 about X to lie flat. Read through the accessor rather than
 * `attribute.array` for the same reason the `uv1` builder below does — an interleaved buffer would
 * otherwise yield garbage that looks like a tuning problem instead of a data one.
 *
 * The 0.7 threshold is a little over 45°, so a surface has to be meaningfully horizontal to count
 * as a floor or ceiling; anything ambiguous takes the wall value, which is the middle of the three.
 */
export function surfaceOrientation(mesh: Mesh): 'up' | 'down' | 'side' {
  const nrm = (mesh.geometry as BufferGeometry).getAttribute('normal')
  if (!nrm || nrm.count === 0) return 'side'
  let x = 0
  let y = 0
  let z = 0
  for (let i = 0; i < nrm.count; i += 1) {
    x += nrm.getX(i)
    y += nrm.getY(i)
    z += nrm.getZ(i)
  }
  const v = new Vector3(x / nrm.count, y / nrm.count, z / nrm.count)
  if (v.lengthSq() < 1e-8) return 'side'
  mesh.updateWorldMatrix(true, false)
  v.applyMatrix3(new Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize()
  if (v.y > 0.7) return 'up'
  if (v.y < -0.7) return 'down'
  return 'side'
}

/** Luminance-preserving sky chroma at a given strength; 0 is white. */
function skyTintAt(strength: number): [number, number, number] {
  const t = daytimeSkyTint()
  return [1 + (t[0] - 1) * strength, 1 + (t[1] - 1) * strength, 1 + (t[2] - 1) * strength]
}

const SKY_TINT_BY_ORIENTATION: Readonly<Record<'up' | 'down' | 'side', [number, number, number]>> =
  {
    up: skyTintAt(SKY_TINT_STRENGTH.up),
    down: skyTintAt(SKY_TINT_STRENGTH.down),
    side: skyTintAt(SKY_TINT_STRENGTH.side),
  }

export interface ApplyOptions {
  baseUrl?: string
  expectCoverage?: boolean
  /** Override the fitted `VISIBILITY_GAIN`. Diagnostic only — see `VisibilityLightmaps`. */
  gain?: number
  /** DEV visualiser: paint the sampled occlusion value instead of shading. */
  debug?: boolean
  /** Lamp density (Σ emitter intensity / m²) at a world point — `lampBounce.ts`. Absent → no
   *  lamp-bounce term (the pre-v0.33.0.3 render). */
  lampDensityAt?: (x: number, z: number) => number
  /**
   * Exclude window glazing from the candidate set (GLAZING-LIGHTMAP). Glass carries ~no diffuse
   * irradiance to bake — a pane is mostly transmission — so patching it wrote the baked-GI
   * injection's synthesised box-atlas map as grey texel noise over the transmitted view: invisible
   * by day (the transmitted scene swamps it) and, at night, the mid-grey blocky "static" seen
   * through a living-room window that was first mistaken for an estate/transmission-target bug.
   * Defaults to the `glazingLightmapExclude` flag so a live caller need not thread it explicitly;
   * unit tests inject an explicit value to test both arms without the feature-flag system.
   */
  excludeGlazing?: boolean
  /**
   * Is this world point (metres, x/z) INSIDE the building footprint? (EXTERIOR-FACE-LIGHTMAP.)
   *
   * When supplied, every keyed mesh's vertical faces are probed 6 cm along their own normal and
   * the ones that land outside are given the `uv1 = (-2,-2)` sentinel, which the shader reads as
   * "keep three's analytic fill here". Needed because the bake only fills a box's ROOM-FACING
   * atlas slots, and the UV builder's mirror-row reconciliation then hands an exterior face the
   * INTERIOR face's irradiance — see `lightmapExterior.ts` for the full mechanism and the wall it
   * was measured on. Absent → no face is marked, i.e. exactly the pre-fix render.
   *
   * `VisibilityLightmaps.tsx` builds it from the store's `floorPlan` (the exterior walls'
   * centre-lines through `floorplan/footprint.ts:pointInBuilding`) when the
   * `exteriorFaceLightmapFallback` flag is on; unit tests inject a predicate directly.
   */
  insideBuilding?: (x: number, z: number) => boolean
  /**
   * World Y of the orbit SECTION CUT — the plan's ceiling height (ORBIT-NIGHT-CAPS).
   *
   * When supplied, every up-facing triangle (`n.y > 0.9`) whose centroid sits within 3 cm of that
   * plane gets the `uv1 = (-1,-1)` cut-cap sentinel (a DIFFERENT value from the `(-2,-2)`
   * `insideBuilding` writes, so only the exterior faces take the daylight boost), and the
   * shader keeps three's analytic fill there. Orbit culls the ceiling and renders the flat as a
   * building section, and the bake fills only ROOM-FACING atlas slots — so a wall's empty TOP slot
   * was relocated to the mirror (BOTTOM) row and the cut face rendered the wrong face's
   * irradiance: at 20:00, a bright white rim along every wall top that the bloom then amplified.
   * A section cut is not a physical surface, so there is no reference render to match; the analytic
   * fill is the honest answer. Absent → no cap is marked, i.e. exactly the pre-fix render.
   *
   * Only faces AT the cut plane are touched. Worktops, shelves, sills and cabinet tops are
   * up-facing boxes with the same unfilled-slot problem, but they are metres below `cutCapY` and
   * are never sectioned, so they keep the bake they have always had.
   *
   * `VisibilityLightmaps.tsx` passes `floorPlan.ceilingHeight` when the `orbitNightCaps` flag is
   * on; unit tests pass a height directly.
   */
  cutCapY?: number
  /**
   * EXTERIOR-FACE-DAYLIGHT: give the faces `insideBuilding` marks a daylight boost on top of
   * three's analytic fill, instead of leaving them on the fill alone.
   *
   * The fill is tuned for INTERIOR surfaces; an exterior shell face sees the whole sky dome and a
   * Cycles reference renders it near-white, where the bare fill reads a flat mid-grey. The estate
   * makes the same correction for its own boxes with an emissive `EXTERIOR_DAY_BOOST`
   * (`estate/Estate.tsx`). Only materials that actually received an exterior face get a non-zero
   * `exteriorBoost` uniform; every other material carries 0, so the uniform is in every injected
   * program and inert where it does not apply. Cut caps are NOT boosted — a section cut is not a
   * physical surface — which is why the two families carry different sentinel values
   * (`lightmapExterior.ts`).
   *
   * `VisibilityLightmaps.tsx` passes the `exteriorFaceDaylight` flag; unit tests pass a boolean.
   */
  exteriorDaylight?: boolean
  /**
   * BAKED-GI-DAY-LEVEL (LIVING-SLAB): scale the injected baked irradiance by the live day level,
   * because the bake is BOUNCED DAYLIGHT and was being assigned whole at every hour — leaving
   * every mapped surface at its 13:00 irradiance after dark. Byte-identical by day; see
   * `visibilityLightmap.ts:setVisDayLevel`.
   *
   * `VisibilityLightmaps.tsx` passes the `bakedGiDayLevel` flag; unit tests pass a boolean.
   */
  bakedGiDayLevel?: boolean
  /**
   * WEATHER-BOUNCE-RECALIBRATE (z19): scale each material's `bakedGiDayLevel` weather term by
   * its own orientation's sun-bounce share (`lighting/weather.ts:sunBounceShare`) instead of the
   * flat dome ratio every material took before. `false` is byte-identical — every material's
   * share is exactly 0, which makes `visDayScale`'s extra factor exactly 1.
   *
   * `VisibilityLightmaps.tsx` passes the `weatherBounceOrientation` flag; unit tests pass a
   * boolean.
   */
  weatherBounceOrientation?: boolean
  /**
   * DOOR-LEAF-REALISM (b): give a door/window HEAD SOFFIT the cut-cap sentinel so it keeps three's
   * analytic fill instead of sampling an atlas slot the bake never filled — the black wedges above
   * the door heads. See `lightmapExterior.ts:markOpeningSoffitFaces`.
   *
   * `VisibilityLightmaps.tsx` passes the `doorLeafRealism` flag; unit tests pass a boolean.
   */
  openingSoffitFill?: boolean
  /**
   * LIGHTMAP-CHANNEL: sample the bake's full RGB triple, so indirect light carries its own
   * per-texel chroma instead of one global tint. `false` is bit-identical (`lightmapChroma`).
   */
  lightmapChroma?: boolean
  /**
   * LIGHTMAP-NEIGHBOUR-INHERIT: let a shell mesh the bake skipped sample the map of the baked mesh
   * it sits ON, at its own place on it, instead of rendering the whole analytic fill.
   *
   * The bake's `--min-area` and this module's `MIN_SPAN_M` both drop sub-square-metre shell
   * meshes — the skirting, the crown moulding, the narrow wall-face panels beside a window — and a
   * mapped surface next to an unmapped one steps 8 → 124 counts in a dark room. See
   * `lightmapNeighbour.ts` for the measurements and the donor rule. `false` is bit-identical: no
   * receiver is patched and every material stays exactly as the pre-fix render left it.
   *
   * `VisibilityLightmaps.tsx` passes the `lightmapNeighbourInherit` flag; unit tests pass a
   * boolean.
   */
  neighbourInherit?: boolean
  /**
   * WALL-HEAD-CLAMP: the ROOM ceiling height at a world point (metres, x/z), or `undefined` where
   * no room covers it.
   *
   * `bath1`/`bath2` declare `ceilingHeight: 2.4` while the walls build to the plan's global 2.6,
   * so a bathroom wall carries a 200 mm plenum band above its own ceiling which the bake renders
   * BRIGHT (8–11 against 0.00 inside the room) and a linear filter then bleeds across the topmost
   * visible pixel row — the ~160-count hairline along the wall-head joint the walk audit filed as
   * W14 in the bathrooms. Supplied, every mapped mesh whose mapping is an unambiguous affine
   * function of height gets a `visVRange` that stops short of the ceiling; absent, nothing is
   * clamped and the render is exactly as before. See `lightmapUv.ts:ceilingClampV`.
   *
   * `VisibilityLightmaps.tsx` builds it from the store's `floorPlan` when `wallHeadClamp` is on.
   */
  ceilingAt?: (x: number, z: number) => number | undefined
  /**
   * How the map enters the shading. Derived from the INDEX's own `pass` field by
   * the caller, not configured: a `visibility` map is a dimensionless occlusion
   * ratio that must MULTIPLY the fill, and an `irradiance` map is the light
   * itself and must REPLACE it. Getting that backwards is not a tuning error —
   * `v0.31.7.67` measured multiplying by irradiance as *worse* than multiplying
   * by visibility, because the app's ambient/hemisphere fill stays in place and
   * gets scaled instead of stood in for.
   */
}

/**
 * Strip the injection from every material under `root`. Returns how many were stripped.
 *
 * **Exported because turning the feature OFF has to be a real removal.** The apply path detaches
 * as its first step, so re-applying was always safe; but a caller that simply stops calling apply
 * — which is what a tier gate or a flag toggle does — left the previous state attached forever.
 * `v0.31.7.114` gated the GI to `realistic`, and without this a `realistic -> performance` switch
 * would keep the baked light on the tier chosen for responsiveness.
 */
export function detachAllVisibilityLightmaps(root: Object3D): number {
  let detached = 0
  root.traverse((o) => {
    const m = (o as Mesh).material
    if (!m || Array.isArray(m)) return
    if (detachVisibilityLightmap(m as never)) detached += 1
    // Put the shared original back where a clone stood in, so turning the feature off leaves the
    // scene as it was rather than with private copies of shared materials.
    const from = (m as { userData?: Record<string, unknown> }).userData?.visClonedFrom
    if (from) {
      ;(o as Mesh).material = from as never
      ;(m as { dispose?: () => void }).dispose?.()
    }
  })
  return detached
}

export interface ApplyResult {
  /** Meshes considered — large enough, and carrying a material with an `aoMap` slot. */
  candidates: number
  /** Meshes that matched a baked key and now carry a map. */
  applied: number
  /** Materials whose PREVIOUS map was removed first — non-zero on a plan change. */
  detached: number
  /**
   * Which baked plan was chosen, or `null` if none matched or the evidence tied.
   *
   * Reported because it is the field that distinguishes the three states a caller cares about:
   * maps applied from plan X, no plan recognised (normal for an unbaked layout), and *ambiguous*
   * — and the last two are indistinguishable from `applied: 0` alone.
   */
  context: string | null
  /** Human-readable hit-rate line, and whether it looks wrong. */
  report: string
  suspect: boolean
  /** Meshes skipped because a vertex was shared across two atlas slots. */
  conflicts: number
  /** Faces given the `uv1 = (-2,-2)` sentinel because they point OUT of the building
   *  (EXTERIOR-FACE-LIGHTMAP). Zero when no `insideBuilding` predicate was supplied. */
  exteriorFaces: number
  /** Vertices one face wanted to sentinel and another wanted to keep mapped. Expected 0 — box and
   *  plane geometries duplicate their corners per face — and counted rather than resolved so a
   *  geometry that breaks the assumption says so instead of rendering a silent half-answer. */
  exteriorConflicts: number
  /** Up-facing faces at the orbit section cut given the sentinel (ORBIT-NIGHT-CAPS). Zero when no
   *  `cutCapY` was supplied. */
  cutCapFaces: number
  /** Vertices one cut-cap face wanted to sentinel and another wanted to keep mapped. Expected 0,
   *  and counted for the same reason `exteriorConflicts` is. */
  cutCapConflicts: number
  /** Down-facing faces above a mesh's own bottom given the sentinel — door/window HEAD SOFFITS
   *  (DOOR-LEAF-REALISM defect (b)). Zero when `openingSoffitFill` is off. */
  soffitFaces: number
  /** Vertices one soffit face wanted to sentinel and another wanted to keep mapped. Expected 0,
   *  and counted for the same reason `exteriorConflicts` is. */
  soffitConflicts: number
  /** Meshes the bake skipped that borrowed a neighbouring baked mesh's map
   *  (LIGHTMAP-NEIGHBOUR-INHERIT). 0 with `neighbourInherit` off. */
  inherited: number
  /** Mapped meshes given a `visVRange` that stops short of their room's ceiling
   *  (WALL-HEAD-CLAMP). 0 with no `ceilingAt`. */
  headClamped: number
  /** Materials cloned for those receivers. Reported because it is the COST of the mechanism — one
   *  clone is one extra shader variant to compile at attach (`v0.31.7.15`: ~19 variants, 216 ms). */
  inheritedClones: number
}

/**
 * Only shell-sized meshes are baked (`bake_material.py --min-area 3.0`), so keying every teacup
 * would spend a hash per mesh to learn nothing. 1.5 m is deliberately below the bake's threshold
 * — a mesh just over 3 m² can be under 1.5 m in its longest axis — so the filter never excludes
 * something the set actually has.
 */
const MIN_SPAN_M = 1.5

/** World-space vertex positions of a geometry, flat `xyz`, for keying. */
function worldPositions(mesh: Mesh): Float64Array | null {
  const geometry = mesh.geometry as BufferGeometry
  const pos = geometry.getAttribute('position')
  if (!pos) return null
  const out = new Float64Array(pos.count * 3)
  const m = mesh.matrixWorld.elements
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    // Inlined rather than via Vector3.applyMatrix4: one allocation per vertex across ~400
    // meshes is thousands of throwaway objects during load.
    out[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]
    out[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
    out[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
  }
  return out
}

/**
 * A mesh worth keying: big enough, and with a material that has an `aoMap` slot.
 *
 * `excludeGlazing` (GLAZING-LIGHTMAP) rejects a window pane two ways: the mesh's own
 * `userData` mark (`apartment/walls/wallReveal.ts:markGlazing`, set on the pane meshes in
 * `Window.tsx`/`PlanShell.tsx`, never on frames/mullions/grilles/sills), and belt-and-braces a
 * `MeshPhysicalMaterial` with `transmission > 0` — transmissive glass has ~no diffuse irradiance
 * to bake regardless of whether the mesh happened to carry the mark. Excluded here means the mesh
 * is never counted in `candidates` and never keyed, so it cannot become a shared-material sharer
 * either.
 */
function isCandidate(o: Object3D, excludeGlazing: boolean): o is Mesh {
  const mesh = o as Mesh
  if (!mesh.isMesh || !mesh.geometry) return false
  const material = mesh.material
  if (Array.isArray(material) || !material || !('aoMap' in material)) return false
  // MITRE-SEAM-IN-REVEAL: the ORBIT-CLEAN-CUT section cap is a drafting convention with no real
  // irradiance to bake — see `markSectionCap`. Excluded unconditionally (not behind
  // `excludeGlazing`): this is a correctness fix, not the same artistic on/off as glazing.
  if (isSectionCap(mesh.userData)) return false
  if (excludeGlazing) {
    if (isGlazing(mesh.userData)) return false
    const transmission = (material as { transmission?: number }).transmission ?? 0
    if (transmission > 0) return false
  }
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox
  if (!bb) return false
  const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z)
  return span >= MIN_SPAN_M
}

/**
 * Apply maps from an already-parsed index to `root`.
 *
 * Separated from fetching so it is testable without a network or a GPU: `loadTexture` is injected
 * and can return a stub.
 *
 * `expectCoverage` is passed through to the hit-rate diagnostic — see `lightmapIndex`. Zero hits
 * is a bug on a plan known to be baked and completely normal on one that is not.
 */
export function applyLightmapsFromIndex(
  root: Object3D,
  index: LightmapIndex,
  loadTexture: (url: string) => Texture,
  {
    baseUrl = LIGHTMAP_BASE,
    expectCoverage = false,
    gain,
    debug = false,
    lampDensityAt,
    excludeGlazing = isFeatureEnabled('glazingLightmapExclude'),
    insideBuilding,
    cutCapY,
    exteriorDaylight = false,
    bakedGiDayLevel = false,
    weatherBounceOrientation = false,
    openingSoffitFill = false,
    lightmapChroma = false,
    neighbourInherit = false,
    ceilingAt,
  }: ApplyOptions = {},
): ApplyResult {
  const resolver = createLightmapResolver(index, baseUrl)
  // DETACH FIRST. Materials survive a plan change, so anything patched for the previous plan is
  // still carrying that plan's visibility; adding the new plan's maps on top leaves the reused
  // materials wrong and the result stubbornly unchanged (`v0.31.7.45`).
  const detached = detachAllVisibilityLightmaps(root)
  root.updateMatrixWorld(true)
  // TWO PASSES, because a key can belong to more than one baked plan. Pass one keys every
  // candidate and asks which plan they belong to; pass two applies only that plan's maps.
  // Applying per-key as they are found would mix two plans' visibility on real data -- 20 of 65
  // meshes in the 5-Room plan share a key with the 4-Room set.
  const keyed: { mesh: Mesh; key: string }[] = []
  let candidates = 0
  root.traverse((o) => {
    if (!isCandidate(o, excludeGlazing)) return
    candidates += 1
    const positions = worldPositions(o)
    if (!positions) return
    keyed.push({ mesh: o, key: lightmapKey(positions) })
  })
  const ctx = resolver.chooseContext(keyed.map((k) => k.key))
  // Scaled per plan unless the caller overrides. A plan whose surfaces see more sky needs less
  // gain, and the index records each plan's mean so one fitted measurement calibrates all of
  // them (`v0.31.7.44`).
  // The bake's `scale` multiplies back IN, restoring the map to the units it was baked in before
  // any artistic gain applies. Kept separate from `gain` on purpose: one is a measured unit
  // conversion recorded by the producer, the other is a fitted look constant, and collapsing them
  // is how `v0.31.7.104`'s clipped set came to be "explained" by a gain of ~14.
  const scale = index.scale ?? 1
  const baseGain = gain ?? IRRADIANCE_GAIN
  // LIGHTMAP-ENCODE-DECODE: the bake's own `--encode` exponent, read from the index exactly like
  // `scale` above and threaded to every mapped material so `visDecode = 1 / encode` undoes the
  // bake's dark-end compression. Absent or 1 (every set shipped before this existed) reproduces
  // the shipped render bit-for-bit -- see `lightmapIndex.ts`'s `encode` field and
  // `visibilityLightmap.ts`'s `visDecode` uniform.
  const encode = index.encode ?? 1
  // HOW MANY MESHES RIDE EACH MATERIAL, counted over the WHOLE root rather than the candidate set.
  // `applyVisibilityLightmap` patches a MATERIAL while `uv1` is built per GEOMETRY, so a material
  // shared by N meshes gets one map and one gain for all of them — and any sharer that was never
  // keyed has no `uv1`, samples undefined coordinates, and in `'replace'` mode is ASSIGNED that,
  // which is a cliff to black rather than a dim surface. Measured in `v0.31.7.174`: the bedroom3
  // wood floor read 126.7 counts with the feature off and 24.4 with it on, warm cast gone. 18 of
  // 52 mapped meshes rode just 2 shared materials, one of them 10 meshes with only 2 `uv1`s.
  //
  // Counted over every mesh, not just candidates, because the sharers that break are exactly the
  // ones the candidate filter EXCLUDED — a mesh too small to key still renders the material it
  // shares with a big one.
  const meshesPerMaterial = new Map<unknown, number>()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const m = mesh.material
    if (Array.isArray(m) || !m) return
    meshesPerMaterial.set(m, (meshesPerMaterial.get(m) ?? 0) + 1)
  })
  // Which map each keyed mesh WOULD get, so a shared material can be checked for agreement before
  // anything is patched.
  // Per material: which maps its meshes want, and HOW MANY of its meshes will actually receive
  // one. The count is the load-bearing half — a mesh can be keyed and still get no map, and that
  // is precisely the mesh that breaks: it renders the patched material with no `uv1` of its own.
  const urlByMaterial = new Map<unknown, { urls: Set<string>; withMap: number }>()
  for (const { mesh: o, key } of keyed) {
    const u = ctx ? resolver.urlFor(key, ctx) : null
    if (!u) continue
    const m = o.material
    if (Array.isArray(m) || !m) continue
    const e = urlByMaterial.get(m) ?? { urls: new Set<string>(), withMap: 0 }
    e.urls.add(u)
    e.withMap += 1
    urlByMaterial.set(m, e)
  }

  let applied = 0
  /** Meshes given a private clone because their material is shared with an unmapped mesh. */
  let cloned = 0
  // Faces relocated to the mirror atlas row because the bake put the data there.
  let flippedFaces = 0
  let conflictMeshes = 0
  // EXTERIOR-FACE-LIGHTMAP counters.
  let exteriorFaces = 0
  let exteriorConflicts = 0
  // ORBIT-NIGHT-CAPS counters.
  let cutCapFaces = 0
  let cutCapConflicts = 0
  let soffitFaces = 0
  let soffitConflicts = 0
  // MITRE-SEAM-IN-REVEAL counters.
  let mitreEndFaces = 0
  let mitreEndConflicts = 0
  // MITRE-END-INHERIT counters.
  let mitreEndInherited = 0
  let mitreEndFallback = 0
  // LIGHTMAP-NEIGHBOUR-INHERIT: what each mapped mesh offers a neighbour the bake skipped. Filled
  // in the main loop so the second pass costs one extra traversal rather than a second resolve.
  const donors: {
    aabb: WorldAabb
    localMin: readonly [number, number, number]
    localSize: readonly [number, number, number]
    worldToLocal: Matrix4
    url: string
    key: string
    gain: number
  }[] = []
  let inherited = 0
  let inheritedClones = 0
  let headClamped = 0
  for (const { mesh: o, key } of keyed) {
    const url = ctx ? resolver.urlFor(key, ctx) : null
    if (!url) continue
    const geometry = o.geometry as BufferGeometry
    if (!geometry.getAttribute('uv1')) {
      // Read through the ACCESSORS, not `attribute.array`. A raw array is only plain xyz
      // triples for a tightly-packed, non-normalised, non-interleaved buffer -- three makes no
      // such promise, and an interleaved geometry would silently produce garbage UVs that look
      // like a tuning problem rather than a data one.
      const pos = geometry.getAttribute('position')
      const local = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i += 1) {
        local[i * 3] = pos.getX(i)
        local[i * 3 + 1] = pos.getY(i)
        local[i * 3 + 2] = pos.getZ(i)
      }
      const idx = geometry.index
      let indices: Uint32Array | null = null
      if (idx) {
        indices = new Uint32Array(idx.count)
        for (let i = 0; i < idx.count; i += 1) indices[i] = idx.getX(i)
      }
      // Hand the bake's own slot occupancy to the UV builder. Without it a
      // winding disagreement puts the lookup on the empty mirror row and the
      // surface renders black (`v0.31.7.98`).
      const { uv, conflicts, flipped } = computeBoxAtlasUv({
        positions: local,
        indices,
        occupiedSlots: ctx ? resolver.slotsFor(key, ctx) : null,
      })
      if (flipped > 0) flippedFaces += flipped
      // A conflict means two faces in different atlas slots share a vertex, so a per-vertex
      // attribute cannot represent the layout and the map would land wrong. Skip rather than
      // render something subtly incorrect.
      if (conflicts > 0) {
        // COUNTED, not just acted on. `conflicts` has gated this `continue` since the UV builder
        // existed and was never surfaced, so "the mesh was skipped" and "the mesh had no map" were
        // indistinguishable from outside — and a skipped mesh sitting next to a mapped one is a
        // candidate for the edge artefact `v0.31.7.129` has now eliminated five other causes for.
        // Third time in this arc that the number needed was already being computed (`.123`'s
        // `textured_share`, `.127`'s `padded`).
        conflictMeshes += 1
        continue
      }
      if (insideBuilding || cutCapY !== undefined || openingSoffitFill) {
        // EXTERIOR-FACE-LIGHTMAP and ORBIT-NIGHT-CAPS. Per TRIANGLE, in WORLD space (the footprint
        // test is a world query and the cut plane is a world height), so both have to run on
        // `worldPositions` rather than the local array the atlas UVs were built from. They run
        // AFTER the atlas UVs so they overwrite them for the sentinel'd faces only — every other
        // face keeps the bake it was given. The two passes are disjoint by construction: the
        // exterior pass tests `|n.y| <= 0.5` and the cut-cap pass `n.y > 0.9`.
        const world = worldPositions(o)
        if (world) {
          if (insideBuilding) {
            const marked = markExteriorFaces(world, indices, uv, insideBuilding)
            exteriorFaces += marked.faces
            exteriorConflicts += marked.conflicts
            // Remembered on the GEOMETRY (EXTERIOR-FACE-DAYLIGHT), because the marking runs only
            // while `uv1` is being built: a re-attach on a geometry that already carries `uv1`
            // takes the branch above and would otherwise report "no exterior faces" and drop the
            // boost — a difference between the first attach and every later one.
            if (marked.faces > 0) geometry.userData.lmExteriorFaces = marked.faces
          }
          if (cutCapY !== undefined) {
            const capped = markCutCapFaces(world, indices, uv, cutCapY)
            cutCapFaces += capped.faces
            cutCapConflicts += capped.conflicts
          }
          if (openingSoffitFill) {
            // DOOR-LEAF-REALISM (b). The threshold is the mesh's OWN world bottom, read off the
            // same world positions the pass runs on — a face above it and pointing straight down
            // is an opening's head soffit, while a slab/worktop/ceiling underside sits AT it and
            // is left mapped. Disjoint from the two passes above by their own gates.
            let minY = Number.POSITIVE_INFINITY
            for (let i = 1; i < world.length; i += 3) if (world[i] < minY) minY = world[i]
            const soffits = markOpeningSoffitFaces(world, indices, uv, minY)
            soffitFaces += soffits.faces
            soffitConflicts += soffits.conflicts
          }
        }
      }
      // MITRE-SEAM-IN-REVEAL. Unconditional (no flag, no `world`/height/footprint test needed —
      // `applyMiter` already recorded exactly which vertices it sheared) and runs LAST so it wins
      // any vertex the exterior/cut-cap passes above also claimed: a mitred end face is never a
      // real exterior surface or a section cut, whatever its normal happened to read as.
      const mitreEnd = geometry.getAttribute(MITRE_END_ATTR)
      if (mitreEnd) {
        const mitreEndArray = mitreEnd.array as Float32Array
        const mitred = markMitreEndFaces(indices, pos.count, mitreEndArray, uv)
        mitreEndFaces += mitred.faces
        mitreEndConflicts += mitred.conflicts
        // MITRE-END-INHERIT: upgrade every mitred vertex that has a real donor (its own wall's
        // adjacent room-facing cap) from the sentinel `markMitreEndFaces` just wrote to that
        // donor's own atlas slot. Runs on `local`/`occupiedSlots` — the SAME frame and occupancy
        // `computeBoxAtlasUv` just used — never on `world`, since the donor is THIS mesh's own
        // cap, not a neighbour's.
        const inheritedMitre = computeMitreEndInheritUv(
          local,
          mitreEndArray,
          uv,
          ctx ? resolver.slotsFor(key, ctx) : null,
        )
        mitreEndInherited += inheritedMitre.inherited
        mitreEndFallback += inheritedMitre.fallback
      }
      geometry.setAttribute('uv1', new BufferAttribute(uv, 2))
    }
    // PER MAP, not once for the set. Under `--per-map-scale` each map is normalised to its own
    // maximum, so a single factor would rescale every mesh by the wrong amount and flatten the
    // between-mesh ratios a GI bake exists to carry. The entry's own divisor wins; the
    // index-level one is the fallback for a globally scaled set.
    // A material may only be patched when every mesh that renders it agrees on the map. One
    // texture and one gain live on the material, so a disagreement cannot be represented — and the
    // failure is silent and severe (see the count above).
    //
    // CLONING per mesh was the obvious alternative and is not taken: materials here come from the
    // shared cache that finish changes are applied through, so a clone would quietly stop
    // responding to a floor or wall re-finish. Losing GI on a shared surface is recoverable;
    // a surface that stops taking finishes is not.
    const mat = o.material
    const sharers = meshesPerMaterial.get(mat) ?? 1
    const share = urlByMaterial.get(mat)
    // Safe to patch IN PLACE only when every mesh rendering this material receives a map AND they
    // all agree on which one. `withMap`, not the keyed count: a mesh can be keyed and still resolve
    // to no map, and that mesh is exactly the one that renders the patch with no `uv1`.
    //
    // Otherwise CLONE for this mesh. `v0.31.7.175` skipped instead — the safe move while the cause
    // was fresh, but it cost the GI on 21 meshes including every floor in the flat, which is why
    // floors were the one shell class the feature never reached. Cloning is viable because nothing
    // here keys state on material identity, and a finish change re-selects the material through the
    // store on re-render rather than mutating it in place, so a clone cannot silently stop taking
    // finishes — the reason `.175` gave for not doing this.
    let target = mat as MeshStandardMaterial
    if (sharers > 1 && (share?.urls.size !== 1 || share.withMap !== sharers)) {
      target = (mat as MeshStandardMaterial).clone()
      // Remembered so `detachAllVisibilityLightmaps` can put the shared original back: turning the
      // feature off has to leave the scene as it found it, and a mesh quietly keeping a private
      // copy of a shared material is a difference that would outlive the flag.
      target.userData = { ...target.userData, visClonedFrom: mat }
      o.material = target
      cloned += 1
    }
    const mapGain = (resolver.scaleFor(key, ctx ?? '') ?? scale) * baseGain
    const orientation = surfaceOrientation(o)
    // WALL-HEAD-CLAMP. Taken from the mesh's OWN uv1 and world heights rather than from the plan,
    // so a mapping the clamp cannot describe (a multi-face box, a horizontal plane, a face whose
    // in-slot coordinate is not the vertical one) refuses itself — see `ceilingClampV`. The room
    // is sampled at the mesh's world centre, which for a shell mesh lies in one room; a wall on a
    // room boundary is asked about only one side, and that is fine because both sides' ceilings
    // would have to differ for the answer to matter and the clamp only ever REMOVES the plenum.
    let vRange: readonly [number, number] = [0, 1]
    if (ceilingAt) {
      const world = worldPositions(o)
      const uv1 = geometry.getAttribute('uv1')
      if (world && uv1) {
        const box = new Box3().setFromObject(o)
        const c = box.getCenter(new Vector3())
        const ceil = ceilingAt(c.x, c.z)
        if (ceil !== undefined) {
          const ys = new Float64Array(uv1.count)
          const uvs = new Float64Array(uv1.count * 2)
          for (let i = 0; i < uv1.count; i += 1) {
            ys[i] = world[i * 3 + 1]
            uvs[i * 2] = uv1.getX(i)
            uvs[i * 2 + 1] = uv1.getY(i)
          }
          const clamped = ceilingClampV(ys, uvs, ceil)
          if (clamped) {
            vRange = clamped
            headClamped += 1
          }
        }
      }
    }
    // LAMP-BOUNCE: this surface's share of its room's lamp interreflection (`lampBounce.ts`),
    // looked up at the mesh's world centre — a shell mesh lies within one room.
    let lampBase = 0
    if (lampDensityAt) {
      const c = new Box3().setFromObject(o).getCenter(new Vector3())
      lampBase = LAMP_BOUNCE_K * lampDensityAt(c.x, c.z) * LAMP_BOUNCE_ORIENTATION[orientation]
    }
    applyVisibilityLightmap(
      target as never,
      loadTexture(url),
      mapGain,
      debug,
      SKY_TINT_BY_ORIENTATION[orientation],
      lampBase,
      // EXTERIOR-FACE-DAYLIGHT: non-zero only for a material whose mesh actually carries an
      // exterior face, so the uniform is inert on every interior-only material.
      exteriorBoostBase(
        ((geometry.userData.lmExteriorFaces as number | undefined) ?? 0) > 0,
        exteriorDaylight,
      ),
      // BAKED-GI-DAY-LEVEL: every mapped material takes the day scale, not just some — the bake
      // is one quantity (bounced daylight) and it follows the sun everywhere it is applied.
      bakedGiDayLevel,
      // LIGHTMAP-CHANNEL. `SKY_TINT_BY_ORIENTATION` above is IGNORED when this is on — the map
      // supplies the chroma per texel and applying the orientation tint as well would land the sky
      // colour twice. That substitution is made inside `applyVisibilityLightmap`, not here, so the
      // two halves (neutral tint, divided gain) cannot be applied separately.
      lightmapChroma,
      encode,
      vRange,
      // WEATHER-BOUNCE-RECALIBRATE (z19): this material's own orientation share, or 0 (a no-op)
      // with the flag off.
      weatherBounceOrientation ? sunBounceShare(orientation) : 0,
    )
    if (import.meta.env.DEV) {
      // DEV-only pairing handle. A probe needs to know WHICH map a mesh was
      // handed to compare its `uv1` against that map's texels, and the texture
      // itself may carry an `ImageBitmap` with no `src` to read back.
      ;(o.material as { userData: Record<string, unknown> }).userData.visMapUrl = url
    }
    applied += 1
    if (neighbourInherit) {
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      const bb = geometry.boundingBox
      if (bb) {
        const world = new Box3().copy(bb).applyMatrix4(o.matrixWorld)
        donors.push({
          aabb: {
            min: [world.min.x, world.min.y, world.min.z],
            max: [world.max.x, world.max.y, world.max.z],
          },
          localMin: [bb.min.x, bb.min.y, bb.min.z],
          localSize: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z],
          worldToLocal: new Matrix4().copy(o.matrixWorld).invert(),
          url,
          key,
          gain: mapGain,
        })
      }
    }
  }
  if (neighbourInherit && donors.length > 0) {
    const donorBoxes = donors.map((d) => d.aabb)
    const mapped = new Set(
      keyed.filter((k) => resolver.urlFor(k.key, ctx ?? '')).map((k) => k.mesh),
    )
    // One clone per (base material, donor map, orientation, lamp density) — NOT per mesh. The
    // receivers are the flat's trim, which shares a handful of materials across hundreds of
    // strips, and a clone is a shader variant to compile at attach.
    const cloneCache = new Map<string, MeshStandardMaterial>()
    const receivers: Mesh[] = []
    root.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      if (mapped.has(mesh)) return
      const material = mesh.material
      if (Array.isArray(material) || !material || !('aoMap' in material)) return
      if (excludeGlazing) {
        if (isGlazing(mesh.userData)) return
        if (((material as { transmission?: number }).transmission ?? 0) > 0) return
      }
      receivers.push(mesh)
    })
    for (const mesh of receivers) {
      const geometry = mesh.geometry as BufferGeometry
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      const bb = geometry.boundingBox
      if (!bb) continue
      const world = new Box3().copy(bb).applyMatrix4(mesh.matrixWorld)
      const pick = chooseNeighbourDonor(
        {
          min: [world.min.x, world.min.y, world.min.z],
          max: [world.max.x, world.max.y, world.max.z],
        },
        donorBoxes,
      )
      if (pick === null) continue
      const donor = donors[pick]
      // A geometry INSTANCE may be shared by two strips on two different walls, and `uv1` lives on
      // the geometry — so a second receiver wanting a different donor cannot be served, and taking
      // the first one's UVs would put it on the wrong wall. Skip rather than render that.
      const existing = geometry.getAttribute('uv1')
      if (existing && geometry.userData.lmNeighbourDonor !== donor.url) continue
      if (!existing) {
        const pos = geometry.getAttribute('position')
        // Receiver vertices expressed in the DONOR's local frame: the map is the donor's, so the
        // place on it has to be measured in the donor's own coordinates.
        const local = new Float32Array(pos.count * 3)
        const v = new Vector3()
        const toDonor = new Matrix4().multiplyMatrices(donor.worldToLocal, mesh.matrixWorld)
        for (let i = 0; i < pos.count; i += 1) {
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(toDonor)
          local[i * 3] = v.x
          local[i * 3 + 1] = v.y
          local[i * 3 + 2] = v.z
        }
        const idx = geometry.index
        let indices: Uint32Array | null = null
        if (idx) {
          indices = new Uint32Array(idx.count)
          for (let i = 0; i < idx.count; i += 1) indices[i] = idx.getX(i)
        }
        const { uv, conflicts } = computeBoxAtlasUv({
          positions: local,
          indices,
          occupiedSlots: ctx ? resolver.slotsFor(donor.key, ctx) : null,
          bounds: { min: donor.localMin, size: donor.localSize },
        })
        // Same reason the main loop skips on a conflict: a per-vertex attribute cannot carry two
        // slots, and a wrong map is worse than no map.
        if (conflicts > 0) continue
        const worldPos = worldPositions(mesh)
        if (worldPos) {
          // The three sentinel families apply to a receiver exactly as to its host — a crown
          // moulding AT the orbit section cut is a cut cap, and an outward-facing trim strip is an
          // exterior face. Skipping them here would put back, on the trim, the very artefacts
          // ORBIT-NIGHT-CAPS and EXTERIOR-FACE-LIGHTMAP removed from the wall behind it.
          if (insideBuilding) {
            const marked = markExteriorFaces(worldPos, indices, uv, insideBuilding)
            exteriorFaces += marked.faces
            exteriorConflicts += marked.conflicts
            if (marked.faces > 0) geometry.userData.lmExteriorFaces = marked.faces
          }
          if (cutCapY !== undefined) {
            const capped = markCutCapFaces(worldPos, indices, uv, cutCapY)
            cutCapFaces += capped.faces
            cutCapConflicts += capped.conflicts
          }
        }
        // MITRE-SEAM-IN-REVEAL — same unconditional, run-last treatment as the main loop above;
        // a mitred wall body that inherits its map from a neighbour still carries its own
        // `applyMiter`-recorded end-face flags.
        const mitreEnd = geometry.getAttribute(MITRE_END_ATTR)
        if (mitreEnd) {
          const mitreEndArray = mitreEnd.array as Float32Array
          const mitred = markMitreEndFaces(indices, pos.count, mitreEndArray, uv)
          mitreEndFaces += mitred.faces
          mitreEndConflicts += mitred.conflicts
          // MITRE-END-INHERIT: the receiver (e.g. a mitred skirting strip) is itself a mitred
          // body, and its donor is the SAME wall its non-mitred vertices already borrow from —
          // so the projection runs in the DONOR's frame/bounds, exactly like the `bounds` call
          // to `computeBoxAtlasUv` two lines above this block.
          const inheritedMitre = computeMitreEndInheritUv(
            local,
            mitreEndArray,
            uv,
            ctx ? resolver.slotsFor(donor.key, ctx) : null,
            undefined,
            undefined,
            { min: donor.localMin, size: donor.localSize },
          )
          mitreEndInherited += inheritedMitre.inherited
          mitreEndFallback += inheritedMitre.fallback
        }
        geometry.setAttribute('uv1', new BufferAttribute(uv, 2))
        geometry.userData.lmNeighbourDonor = donor.url
      }
      const orientation = surfaceOrientation(mesh)
      let lampBase = 0
      if (lampDensityAt) {
        const c = new Box3().setFromObject(mesh).getCenter(new Vector3())
        lampBase = LAMP_BOUNCE_K * lampDensityAt(c.x, c.z) * LAMP_BOUNCE_ORIENTATION[orientation]
      }
      const base = mesh.material as MeshStandardMaterial
      const cacheKey = `${base.uuid}|${donor.url}|${orientation}|${lampBase.toFixed(3)}`
      let target = cloneCache.get(cacheKey)
      if (!target) {
        // ALWAYS a clone, never an in-place patch. A trim material is shared across the whole flat
        // while a donor map is one wall, so patching in place would give every skirting board in
        // the home one room's irradiance — the `meshesPerMaterial` failure the main loop guards
        // against, with the sharers guaranteed rather than merely possible.
        target = base.clone()
        target.userData = { ...target.userData, visClonedFrom: base }
        applyVisibilityLightmap(
          target as never,
          loadTexture(donor.url),
          donor.gain,
          debug,
          SKY_TINT_BY_ORIENTATION[orientation],
          lampBase,
          exteriorBoostBase(
            ((geometry.userData.lmExteriorFaces as number | undefined) ?? 0) > 0,
            exteriorDaylight,
          ),
          bakedGiDayLevel,
          lightmapChroma,
          encode,
          undefined,
          // WEATHER-BOUNCE-RECALIBRATE (z19): same per-orientation share as the main loop above.
          weatherBounceOrientation ? sunBounceShare(orientation) : 0,
        )
        if (import.meta.env.DEV) {
          ;(target as { userData: Record<string, unknown> }).userData.visMapUrl = donor.url
        }
        cloneCache.set(cacheKey, target)
        inheritedClones += 1
      }
      mesh.material = target
      inherited += 1
    }
  }
  const { message, suspect } = resolver.describeHitRate(expectCoverage)
  const extras = [
    flippedFaces > 0 ? `${flippedFaces} face(s) mirrored` : null,
    conflictMeshes > 0 ? `${conflictMeshes} mesh(es) SKIPPED on uv1 conflict` : null,
    cloned > 0 ? `${cloned} material(s) CLONED off a shared one` : null,
    exteriorFaces > 0 ? `${exteriorFaces} exterior face(s) → analytic` : null,
    exteriorConflicts > 0 ? `${exteriorConflicts} exterior uv1 CONFLICT(s)` : null,
    cutCapFaces > 0 ? `${cutCapFaces} cut-cap face(s) → analytic` : null,
    cutCapConflicts > 0 ? `${cutCapConflicts} cut-cap uv1 CONFLICT(s)` : null,
    soffitFaces > 0 ? `${soffitFaces} head-soffit face(s) → analytic` : null,
    soffitConflicts > 0 ? `${soffitConflicts} head-soffit uv1 CONFLICT(s)` : null,
    mitreEndFaces > 0 ? `${mitreEndFaces} mitre-end face(s) → analytic` : null,
    mitreEndConflicts > 0 ? `${mitreEndConflicts} mitre-end uv1 CONFLICT(s)` : null,
    mitreEndInherited > 0 ? `${mitreEndInherited} mitre-end vertex(es) → own wall's map` : null,
    mitreEndFallback > 0 ? `${mitreEndFallback} mitre-end vertex(es) with no donor` : null,
    inherited > 0
      ? `${inherited} mesh(es) INHERITED a neighbour's map (${inheritedClones} clones)`
      : null,
    headClamped > 0 ? `${headClamped} mesh(es) head-CLAMPED below their ceiling` : null,
  ].filter(Boolean)
  const report = extras.length ? `${message}, ${extras.join(', ')}` : message
  return {
    candidates,
    applied,
    detached,
    conflicts: conflictMeshes,
    exteriorFaces,
    exteriorConflicts,
    cutCapFaces,
    cutCapConflicts,
    soffitFaces,
    soffitConflicts,
    inherited,
    inheritedClones,
    headClamped,
    context: ctx,
    report,
    suspect,
  }
}
