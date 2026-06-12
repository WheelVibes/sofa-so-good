/**
 * Parametric furniture generator (PF2) — the typed spec + limits + clamping.
 *
 * A `ParametricSpec` describes a storage/work piece (bookshelf / wardrobe /
 * sideboard / desk) by exact dimensions plus per-type options including
 * per-compartment configuration (open / door / drawer). `clampSpec` is the
 * single defence against bad input (NaN / empty / out-of-range UI values):
 * whatever comes in, what comes out is always buildable. The part generator
 * (`buildParts.ts`) and price model (`price.ts`) consume only clamped specs.
 * Pure + dependency-free so every consumer is unit-testable.
 */

export type ParametricType = 'bookshelf' | 'wardrobe' | 'sideboard' | 'desk' | 'kitchen-run'

export const PARAMETRIC_TYPES: readonly ParametricType[] = [
  'bookshelf',
  'wardrobe',
  'sideboard',
  'desk',
  'kitchen-run',
]

export const PARAMETRIC_TYPE_LABEL: Record<ParametricType, string> = {
  bookshelf: 'Bookshelf',
  wardrobe: 'Wardrobe',
  sideboard: 'Sideboard / TV console',
  desk: 'Desk',
  'kitchen-run': 'Kitchen run',
}

/** Hard-surface finish kinds the generator offers (subset of
 *  `getSurfaceMaterial` kinds; `mat:<id>` DLC values also pass through). */
export type ParametricFinish = 'wood' | 'painted' | 'gloss' | (string & {})

/** Per-compartment (bay) front style — what face a single bay shows. */
export type CompartmentStyle = 'open' | 'door' | 'drawer'

/** Configuration for a single bay column. If absent, falls back to the global
 *  `doors` / drawer defaults for that type. */
export interface CompartmentConfig {
  style: CompartmentStyle
}

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
  /** Wardrobe/sideboard: hinged doors on/off (off = open-front). Global default
   *  when no per-compartment override is set. */
  doors: boolean
  /** Sideboard only: raised legs vs a recessed plinth base. */
  base: 'legs' | 'plinth'
  /** Surface finish kind (wood grain / painted / gloss / `mat:<id>` DLC). */
  finish: ParametricFinish
  /** Tint colour (hex) for the finish. */
  color: string
  /**
   * Per-bay style overrides. Index = bay number (0-based). When present and
   * non-empty, overrides the global `doors` toggle for that bay. Bays without
   * an entry inherit the global default.
   *
   * Supported types:
   *  - sideboard + wardrobe: open / door / drawer
   *  - bookshelf: open only (doors/drawers silently ignored)
   *  - desk: no compartment config (field is ignored)
   *  - kitchen-run: door / drawers / open per bay
   */
  compartments?: CompartmentConfig[]
  /** Desk only: leg style. */
  deskLegs: 'legs' | 'pedestal'
  /** Desk only: number of pedestal drawers (1–3; only when deskLegs='pedestal'). */
  pedestalDrawers: number
  /** Kitchen-run only: number of carcass bays (1–6). */
  bays: number
  /** Kitchen-run only: include upper cabinet row above worktop. */
  hasUppers: boolean
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
 *  ranges + HDB-flat desk sizes, per docs/interior-design-guidelines.md
 *  conventions. */
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
  desk: {
    width: { min: 0.6, max: 2.0 },
    height: { min: 0.68, max: 0.82 }, // standard desk height band for HDB
    depth: { min: 0.5, max: 0.85 },
  },
  'kitchen-run': {
    width: { min: 0.6, max: 3.6 }, // single-bay minimum → full HDB kitchen wall
    height: { min: 0.85, max: 0.92 }, // worktop surface height (BS/IKEA standard)
    depth: { min: 0.55, max: 0.65 }, // standard kitchen-base depth
  },
}

/** Max bays for a kitchen-run (each bay ≥ 0.4 m internal = realistic cabinet width). */
export const MAX_KITCHEN_BAYS = 6

/** Max manual shelf count per bay (more than this won't fit books anyway). */
export const MAX_SHELVES = 12

/** Auto shelf spacing target band (m) — a comfortable book/folded-clothes gap. */
export const AUTO_SHELF_SPACING = 0.35

/** Widest a single hinged door leaf may be (m) — beyond this leaves double up. */
export const MAX_DOOR_LEAF = 0.6

/** A bay wider than this gets a centre divider so shelves never span
 *  unsupported (extreme-aspect safeguard). */
export const MAX_BAY_SPAN = 1.2

/** Max pedestal drawers on a desk pedestal. */
export const MAX_PEDESTAL_DRAWERS = 3

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
    compartments: [],
    deskLegs: 'legs',
    pedestalDrawers: 2,
    bays: 1,
    hasUppers: false,
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
    compartments: [],
    deskLegs: 'legs',
    pedestalDrawers: 2,
    bays: 1,
    hasUppers: false,
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
    compartments: [],
    deskLegs: 'legs',
    pedestalDrawers: 2,
    bays: 1,
    hasUppers: false,
  },
  desk: {
    type: 'desk',
    width: 1.2,
    height: 0.75,
    depth: 0.6,
    shelves: 0,
    doors: false,
    base: 'plinth',
    finish: 'wood',
    color: '#9a7b50',
    compartments: [],
    deskLegs: 'legs',
    pedestalDrawers: 2,
    bays: 3,
    hasUppers: false,
  },
  'kitchen-run': {
    type: 'kitchen-run',
    width: 1.8,
    height: 0.87,
    depth: 0.6,
    shelves: 0,
    doors: true,
    base: 'plinth',
    finish: 'painted',
    color: '#e8e4dc',
    compartments: [],
    deskLegs: 'legs',
    pedestalDrawers: 2,
    bays: 3,
    hasUppers: false,
  },
}

export function defaultSpec(type: ParametricType): ParametricSpec {
  return { ...DEFAULT_SPECS[type], compartments: [] }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** A finite number from arbitrary UI input, else the fallback. */
function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

const VALID_COMPARTMENT_STYLES: readonly CompartmentStyle[] = ['open', 'door', 'drawer']

function clampCompartments(raw: unknown): CompartmentConfig[] {
  if (!Array.isArray(raw)) return []
  return raw.map((c) => ({
    style: VALID_COMPARTMENT_STYLES.includes((c as CompartmentConfig)?.style)
      ? (c as CompartmentConfig).style
      : 'open',
  }))
}

/**
 * Normalise an arbitrary (possibly user-mangled) spec into a buildable one:
 * unknown type → bookshelf; NaN/empty dims → the type default; every dimension
 * clamped to its envelope; shelf count an integer 0..MAX_SHELVES (or 'auto');
 * compartment config validated. Never throws.
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

  const rawDeskLegs = raw?.deskLegs
  const deskLegs: 'legs' | 'pedestal' =
    rawDeskLegs === 'legs' || rawDeskLegs === 'pedestal' ? rawDeskLegs : d.deskLegs

  const rawPedestalDrawers = raw?.pedestalDrawers
  const pedestalDrawers = clamp(
    Math.round(num(rawPedestalDrawers, d.pedestalDrawers)),
    1,
    MAX_PEDESTAL_DRAWERS,
  )

  // Kitchen-run: clamp bays to 1..MAX_KITCHEN_BAYS; default from the type default.
  const rawBays = raw?.bays
  const bays = clamp(Math.round(num(rawBays, d.bays ?? 3)), 1, MAX_KITCHEN_BAYS)

  const hasUppers = typeof raw?.hasUppers === 'boolean' ? raw.hasUppers : (d.hasUppers ?? false)

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
    compartments: clampCompartments(raw?.compartments),
    deskLegs,
    pedestalDrawers,
    bays,
    hasUppers,
  }
}

/** Display name for a generated def, e.g. "Custom bookshelf 80 × 200 cm". */
export function specLabel(spec: ParametricSpec): string {
  const cm = (m: number) => Math.round(m * 100)
  if (spec.type === 'kitchen-run') return `Custom kitchen run ${cm(spec.width)} cm wide`
  const noun =
    spec.type === 'sideboard'
      ? 'sideboard'
      : spec.type === 'wardrobe'
        ? 'wardrobe'
        : spec.type === 'desk'
          ? 'desk'
          : 'bookshelf'
  return `Custom ${noun} ${cm(spec.width)} × ${cm(spec.height)} cm`
}

/** Compartment style for bay `b` (0-based) given the spec's per-bay config +
 *  global fallback. Returns the resolved style. */
export function bayStyle(spec: ParametricSpec, b: number): CompartmentStyle {
  const override = spec.compartments?.[b]?.style
  if (override && VALID_COMPARTMENT_STYLES.includes(override)) return override
  // Global fallback: doors flag → 'door', else 'open'.
  return spec.doors ? 'door' : 'open'
}
