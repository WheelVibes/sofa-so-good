/**
 * Parametric furniture generator (PF1) — the typed spec + limits + clamping.
 *
 * A `ParametricSpec` describes a storage piece (bookshelf / wardrobe /
 * sideboard) by exact dimensions plus a few per-type options. `clampSpec`
 * is the single defence against bad input (NaN / empty / out-of-range UI
 * values): whatever comes in, what comes out is always buildable. The part
 * generator (`buildParts.ts`) and price model (`price.ts`) consume only
 * clamped specs. Pure + dependency-free so every consumer is unit-testable.
 */

export type ParametricType = 'bookshelf' | 'wardrobe' | 'sideboard'

export const PARAMETRIC_TYPES: readonly ParametricType[] = ['bookshelf', 'wardrobe', 'sideboard']

export const PARAMETRIC_TYPE_LABEL: Record<ParametricType, string> = {
  bookshelf: 'Bookshelf',
  wardrobe: 'Wardrobe',
  sideboard: 'Sideboard / TV console',
}

/** Hard-surface finish kinds the generator offers (subset of
 *  `getSurfaceMaterial` kinds; `mat:<id>` DLC values also pass through). */
export type ParametricFinish = 'wood' | 'painted' | 'gloss' | (string & {})

export interface ParametricSpec {
  type: ParametricType
  /** Overall outer width (m). */
  width: number
  /** Overall outer height (m), floor → top. */
  height: number
  /** Overall outer depth (m). */
  depth: number
  /** Shelf count per bay — `'auto'` spaces shelves every ~0.35 m; `0` = open
   *  cube. Bookshelf + sideboard only (a wardrobe gets a fixed top shelf). */
  shelves: number | 'auto'
  /** Wardrobe only: hinged doors on/off (off = open-front). */
  doors: boolean
  /** Sideboard only: raised legs vs a recessed plinth base. */
  base: 'legs' | 'plinth'
  /** Surface finish kind (wood grain / painted / gloss / `mat:<id>` DLC). */
  finish: ParametricFinish
  /** Tint colour (hex) for the finish. */
  color: string
}

export interface DimRange {
  min: number
  max: number
}

export interface ParametricLimits {
  width: DimRange
  height: DimRange
  depth: DimRange
}

/** Sensible per-type dimension envelopes (metres) — IKEA BILLY/PAX-class
 *  ranges, per docs/interior-design-guidelines.md conventions. */
export const PARAMETRIC_LIMITS: Record<ParametricType, ParametricLimits> = {
  bookshelf: {
    width: { min: 0.4, max: 2.4 },
    height: { min: 0.6, max: 2.4 },
    depth: { min: 0.24, max: 0.45 },
  },
  wardrobe: {
    width: { min: 0.5, max: 3.0 },
    height: { min: 1.8, max: 2.4 },
    depth: { min: 0.55, max: 0.65 },
  },
  sideboard: {
    width: { min: 0.8, max: 2.4 },
    height: { min: 0.45, max: 0.9 },
    depth: { min: 0.35, max: 0.55 },
  },
}

/** Max manual shelf count per bay (more than this won't fit books anyway). */
export const MAX_SHELVES = 12

/** Auto shelf spacing target band (m) — a comfortable book/folded-clothes gap. */
export const AUTO_SHELF_SPACING = 0.35

/** Widest a single hinged door leaf may be (m) — beyond this leaves double up. */
export const MAX_DOOR_LEAF = 0.6

/** A bay wider than this gets a centre divider so shelves never span
 *  unsupported (extreme-aspect safeguard). */
export const MAX_BAY_SPAN = 1.2

export const DEFAULT_SPECS: Record<ParametricType, ParametricSpec> = {
  bookshelf: {
    type: 'bookshelf',
    width: 0.8,
    height: 2.0,
    depth: 0.3,
    shelves: 'auto',
    doors: false,
    base: 'plinth',
    finish: 'wood',
    color: '#9a7b50',
  },
  wardrobe: {
    type: 'wardrobe',
    width: 1.2,
    height: 2.2,
    depth: 0.6,
    shelves: 'auto',
    doors: true,
    base: 'plinth',
    finish: 'painted',
    color: '#e8e4dc',
  },
  sideboard: {
    type: 'sideboard',
    width: 1.6,
    height: 0.65,
    depth: 0.42,
    shelves: 1,
    doors: true,
    base: 'legs',
    finish: 'wood',
    color: '#6e5337',
  },
}

export function defaultSpec(type: ParametricType): ParametricSpec {
  return { ...DEFAULT_SPECS[type] }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** A finite number from arbitrary UI input, else the fallback. */
function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

/**
 * Normalise an arbitrary (possibly user-mangled) spec into a buildable one:
 * unknown type → bookshelf; NaN/empty dims → the type default; every dimension
 * clamped to its envelope; shelf count an integer 0..MAX_SHELVES (or 'auto').
 * Never throws.
 */
export function clampSpec(raw: Partial<ParametricSpec> | null | undefined): ParametricSpec {
  const type: ParametricType = PARAMETRIC_TYPES.includes(raw?.type as ParametricType)
    ? (raw?.type as ParametricType)
    : 'bookshelf'
  const d = DEFAULT_SPECS[type]
  const lim = PARAMETRIC_LIMITS[type]
  const shelvesRaw = raw?.shelves
  let shelves: number | 'auto'
  if (shelvesRaw === 'auto') {
    shelves = 'auto'
  } else if (shelvesRaw === undefined || shelvesRaw === null) {
    shelves = d.shelves
  } else {
    const n = num(shelvesRaw, Number.NaN)
    shelves = Number.isFinite(n) ? clamp(Math.round(n), 0, MAX_SHELVES) : d.shelves
  }
  return {
    type,
    width: clamp(num(raw?.width, d.width), lim.width.min, lim.width.max),
    height: clamp(num(raw?.height, d.height), lim.height.min, lim.height.max),
    depth: clamp(num(raw?.depth, d.depth), lim.depth.min, lim.depth.max),
    shelves,
    doors: typeof raw?.doors === 'boolean' ? raw.doors : d.doors,
    base: raw?.base === 'legs' || raw?.base === 'plinth' ? raw.base : d.base,
    finish: typeof raw?.finish === 'string' && raw.finish ? raw.finish : d.finish,
    color:
      typeof raw?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : d.color,
  }
}

/** Display name for a generated def, e.g. "Custom bookshelf 80 × 200 cm". */
export function specLabel(spec: ParametricSpec): string {
  const cm = (m: number) => Math.round(m * 100)
  const noun =
    spec.type === 'sideboard' ? 'sideboard' : spec.type === 'wardrobe' ? 'wardrobe' : 'bookshelf'
  return `Custom ${noun} ${cm(spec.width)} × ${cm(spec.height)} cm`
}
