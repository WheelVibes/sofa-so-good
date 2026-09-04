/**
 * PHOTOREAL-HERO — photo-scanned CC0 stand-ins for the boxy parametric primitives.
 *
 * The single strongest "this is CAD, not a photo" cue in a walk-mode frame is the
 * furniture: a sofa built from bevelled boxes reads as a render however good the
 * lighting is. In Realistic mode the hero pieces of a room (sofa, armchair, dining
 * chairs, coffee/side tables, TV console, ottoman) therefore render as
 * Poly Haven GLBs (`scripts/asset-pipeline/fetch-hero-models.mjs`) instead of their
 * primitive — a RENDER swap only:
 *
 *  - **Collision, placement, the arranger, exports of the plan, prices and every
 *    corpus ratchet keep reading the PARAMETRIC def.** The item's `defId` never
 *    changes; only what `Furniture.tsx` draws for it does. That is what keeps the
 *    blast radius at one file plus this one.
 *  - **The GLB is drawn in the primitive's frame**: floor-centred, facing +Z, at a
 *    UNIFORM scale chosen here so its width matches the item's live `width` param
 *    (rows of dining chairs stay spaced) and its depth/height never exceed the
 *    parametric footprint by more than {@link DEFAULT_TOLERANCE}. Uniform, because a
 *    stretched photo-scan reads worse than a slightly smaller one; bounded, because a
 *    proxy that pokes past its own collision box clips walls ("zero artifacts").
 *  - **Realistic mode only.** `performance` is the fast editing path and keeps the
 *    primitives byte-identical; the swap also downloads ~0.2 MB per model, so it is
 *    the tier a user opted into paying for. Gated by the `photorealModels` flag.
 *
 * The primitive is the Suspense fallback, so a piece never vanishes while its GLB
 * streams in — it sharpens from box to scan.
 *
 * Pure: no store, no three. Facing/centring are BAKED into the GLBs by the fetch
 * script (read off Blender turntables), so there is deliberately no yaw here.
 */
import { resolveFootprintDims } from './footprintDims'
import { GENERATED_FURNITURE } from './generatedCatalog'
import type { BuiltinGltfDef, FurnitureDef, ParametricDef, ParamProps } from './types'

export interface ProxySpec {
  /** `GENERATED_FURNITURE` id of the hero GLB (a `ph-*` def). */
  glbId: string
  /**
   * How far (fraction) the scaled GLB may exceed the parametric footprint's depth
   * or height. Chairs need some: a real dining chair is ~0.58 m deep and its back
   * leans past the 0.48 m the primitive reserves. Never applies to WIDTH — width
   * is the placement axis.
   */
  tolerance?: number
  /**
   * Surface hosts (tables, consoles) stretch VERTICALLY so their top lands exactly at
   * the parametric height: every decor prop on them self-lifts to `surfaceHeight`
   * = the parametric `h` (`layout/decorStyling.ts`, `defaults/*.ts`), so a top 6 cm
   * lower leaves the fruit bowl hovering. A table's legs reading 10–20 % taller is
   * invisible; a floating bowl is not. Bounded by {@link MAX_HEIGHT_STRETCH} — a
   * piece that would need more is the wrong model and stays unmapped.
   */
  fitHeight?: boolean
}

export const DEFAULT_TOLERANCE = 0.15
/** Largest vertical-over-horizontal scale ratio `fitHeight` may introduce. */
export const MAX_HEIGHT_STRETCH = 1.25

/** Parametric `defId` → hero GLB. Keep in step with `fetch-hero-models.mjs`. */
export const PHOTOREAL_PROXIES: Readonly<Record<string, ProxySpec>> = {
  'sofa-3seat': { glbId: 'ph-sofa-leather' },
  armchair: { glbId: 'ph-armchair-leather-oak' },
  'dining-chair': { glbId: 'ph-dining-chair-leather', tolerance: 0.2 },
  ottoman: { glbId: 'ph-ottoman-leather' },
  'coffee-table': { glbId: 'ph-coffee-table-stone', fitHeight: true },
  'side-table': { glbId: 'ph-side-table-oak', fitHeight: true },
  nightstand: { glbId: 'ph-side-table-oak', fitHeight: true },
  'tv-console': { glbId: 'ph-cabinet-slatted', fitHeight: true },
  // NOT mapped, deliberately: `sideboard` (0.78 m tall) would need a 1.75× vertical
  // stretch of the 0.68 m cabinet; `bookshelf`/`cube-shelf` would shrink the display
  // shelves to ~0.63–0.83× and leave the trailing plant on top floating half a metre.
  // The GLBs stay in the catalog as placeable pieces in their own right.
}

export interface PhotorealProxy {
  def: BuiltinGltfDef
  url: string
  /** Horizontal (uniform X/Z) scale; footprint at scale 1 is `def.defaultFootprint`. */
  scale: number
  /** What `GltfModel` receives: `[scale, scaleY, scale]` — `scaleY === scale` unless `fitHeight`. */
  scale3: [number, number, number]
}

let heroIndex: Map<string, BuiltinGltfDef> | null = null
function heroDef(id: string): BuiltinGltfDef | null {
  if (!heroIndex) {
    heroIndex = new Map()
    for (const d of GENERATED_FURNITURE)
      if (d.kind === 'gltf' && d.source === 'builtin') heroIndex.set(d.id, d)
  }
  return heroIndex.get(id) ?? null
}

/**
 * Uniform scale that matches the GLB's width to the item's live width, clamped so
 * depth and height stay within `footprint × (1 + tolerance)`.
 */
export function proxyScale(
  glb: { w: number; d: number; h: number },
  target: { w: number; d: number; h: number },
  tolerance = DEFAULT_TOLERANCE,
): number {
  const byWidth = target.w / glb.w
  const maxByDepth = (target.d * (1 + tolerance)) / glb.d
  const maxByHeight = (target.h * (1 + tolerance)) / glb.h
  return Math.min(byWidth, maxByDepth, maxByHeight)
}

/**
 * The hero GLB a parametric item should render as, or `null` to draw the primitive.
 * `enabled` folds the flag + tier gate so callers stay one expression.
 */
export function photorealProxyFor(
  def: FurnitureDef,
  props: ParamProps,
  enabled: boolean,
): PhotorealProxy | null {
  if (!enabled || def.kind !== 'parametric') return null
  const spec = PHOTOREAL_PROXIES[def.id]
  if (!spec) return null
  const glb = heroDef(spec.glbId)
  if (!glb) return null
  const live = resolveFootprintDims(def as ParametricDef, props, {
    w: def.defaultFootprint.w,
    d: def.defaultFootprint.d,
  })
  const scale = proxyScale(
    glb.defaultFootprint,
    { w: live.w, d: live.d, h: def.defaultFootprint.h },
    spec.tolerance,
  )
  if (!(scale > 0) || !Number.isFinite(scale)) return null
  const scaleY = spec.fitHeight
    ? heightFitScale(scale, glb.defaultFootprint.h, def.defaultFootprint.h)
    : scale
  return { def: glb, url: glb.url, scale, scale3: [scale, scaleY, scale] }
}

/** Vertical scale that puts the GLB's top at `targetH`, bounded to `MAX_HEIGHT_STRETCH`
 *  of the horizontal scale in either direction. */
export function heightFitScale(horizontal: number, glbH: number, targetH: number): number {
  const exact = targetH / glbH
  const lo = horizontal / MAX_HEIGHT_STRETCH
  const hi = horizontal * MAX_HEIGHT_STRETCH
  return Math.min(hi, Math.max(lo, exact))
}
