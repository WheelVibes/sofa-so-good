/**
 * Registry of furniture defs that emit real light at night, plus how their
 * point light is placed and tuned. Centralised so the scene can cap the
 * number of active lights for performance rather than letting every fixture
 * add an unbounded light.
 */
import type { FurnitureType, ParamProps } from './types'

export interface EmitterSpec {
  /** Emit height above the floor, in metres. May read item params. */
  height: (props: ParamProps) => number
  color: string
  /**
   * Peak intensity at full darkness, in this scene's own RELATIVE units — NOT candela,
   * despite what this comment used to claim (LIGHT-UNITS-RELATIVE, v0.31.5.47).
   *
   * The whole rig is eyeball-calibrated against the tone curve, not photometric: censused
   * live, the sun is a `DirectionalLight` at **0.999** where a real midday sun would be
   * ~100,000 lux, and these point lights run at **2.6-9** — nine times the sun's number.
   * So do NOT "correct" a value by comparing it to a real fixture: a 9 W LED bulb is
   * ~800 lm / 4-pi = ~64 cd, which would read as this ceiling light being 7x too dim, and
   * changing it on that basis would blow out every night interior.
   *
   * What IS meaningful is the ordering and the fixture-to-fill ratio. Room lighting
   * (ceiling-light 9, ceiling-fan 8) sits above task (floor-lamp 7, table-lamp 4) above
   * accent (sconce 3.5, vanity 2.8, cove 2.6, aquarium 2.4); and because the day/night
   * ramp drops the fill (~8x: hemisphere 0.136 -> 0.057, ambient 0.043 -> 0.018, sun
   * 0.999 -> 0.013) while these stay fixed, the fixtures take over at night by
   * construction — measured ~150:1 over the hemisphere fill at 21:00.
   *
   * Re-measure with `scripts/dev-probes/light-units.mjs` before touching any of it.
   */
  intensity: number
  /** Falloff distance in metres. */
  distance: number
  /** Optional in-plane offset of the bulb from the item origin, in LOCAL
   *  metres ([rightX, forwardZ]); rotated by the item's rotation when placed.
   *  Used by fixtures whose bulb is offset from their footprint centre (e.g.
   *  an arc floor lamp whose shade reaches out over a sofa). */
  offset?: (props: ParamProps) => [number, number]
  /** Optional per-item gate: emit only when the item's params switch its
   *  light on (e.g. the vanity's Hollywood bulbs). Defaults to always-on. */
  enabled?: (props: ParamProps) => boolean
  /**
   * SPECIFIED correlated colour temperature (K) — a PRODUCT property for the
   * lighting schedule, on a completely separate register from `intensity`.
   *
   * Deliberately NOT derived from `color`. That hex is a render tint chosen to
   * look right in a night interior; converting it back to Kelvin would be
   * deriving a specification from a rendering constant, the same mistake
   * `floorplan/tileCoursing.ts`'s header warns about for tile sizes. The
   * warning immediately above — that `intensity` must not be "corrected"
   * against real fixtures — is the same separation seen from the other side.
   *
   * 3000 K (warm white) throughout, the Singapore residential default and what
   * the sources give for living rooms and bedrooms. A task space wants ~4000 K
   * neutral, which `analysis/lampSpecAdvisory.ts` raises as an advisory rather
   * than silently re-specifying the fixture.
   */
  cct: number
  /**
   * Which of the three lighting LAYERS this fixture provides.
   *
   * Professional practice lights a room in three layers — ambient (the room's
   * overall brightness, typically ceiling-mounted), task (directed, for reading
   * or a worktop) and accent (highlighting art, shelving, architecture). "Every
   * well-lit room relies on three foundational layers", and the IALD's starting
   * point for a living room is roughly 50% ambient / 30% task / 20% accent.
   *
   * **Authored by FUNCTION, deliberately not copied from the intensity tiers**
   * in this file's own header. That grouping — "room lighting … above task …
   * above accent" — orders fixtures by RENDER candela for the night scene, and
   * its own comment says what is meaningful about it is the ordering and the
   * fixture-to-fill ratio. Reading it as a design classification would be
   * deriving one from a rendering register, the mistake `tileCoursing.ts`
   * warns about for tile sizes. The visible consequence: those tiers put
   * `vanity` under accent, whereas a mirror light IS task lighting — grooming
   * is a task — and it is classified that way here.
   */
  layer: LightLayer
  /**
   * SPECIFIED IP rating as its two-digit integer (20, 44, 65 …).
   *
   * Not derivable from anything the app models, and the one field here that is
   * a COMPLIANCE matter rather than procurement: bathroom Zones 1 and 2 (above
   * the bath/shower to 2.25 m, and 0.6 m around it) require **IP44 minimum**.
   * Every shipped emitter is a standard indoor fixture at IP20, which is why
   * `lampSpecAdvisory.ts` flags one placed in a wet room.
   */
  ip: number
}

/** The three layers professional practice lights a room in. */
export type LightLayer = 'ambient' | 'task' | 'accent'

/** Warm white — the SG residential default (see `EmitterSpec.cct`). */
const WARM_WHITE_K = 3000
/** Standard indoor ingress protection; wet rooms need IP44+ (see `EmitterSpec.ip`). */
const IP_INDOOR = 20
/** Daylight — the standard freshwater aquarium lamp, and the one shipped
 *  emitter whose render tint is deliberately cool rather than warm. */
const AQUARIUM_K = 6500

export const LIGHT_EMITTERS: Partial<Record<FurnitureType, EmitterSpec>> = {
  'table-lamp': {
    height: (p) => (typeof p.surfaceHeight === 'number' ? p.surfaceHeight : 0.5) + 0.32,
    color: '#ffe6b8',
    intensity: 4,
    distance: 3.2,
    cct: WARM_WHITE_K,
    layer: 'task',
    ip: IP_INDOOR,
  },
  'floor-lamp': {
    // An arc lamp's bulb hangs ~2 m up at the end of the arch, reaching out
    // over a sofa; disc/tripod bulbs sit at the pole top.
    height: (p) => (p.base === 'arc' ? 2.05 : 1.5),
    offset: (p) => (p.base === 'arc' ? [1.35, 0] : [0, 0]),
    color: '#ffdfae',
    intensity: 7,
    distance: 5.5,
    cct: WARM_WHITE_K,
    layer: 'task',
    ip: IP_INDOOR,
  },
  'ceiling-light': {
    height: (p) => {
      const mount = typeof p.mountHeight === 'number' ? p.mountHeight : 2.55
      const drop = p.style === 'flush' ? 0 : typeof p.drop === 'number' ? p.drop : 0.45
      return mount - drop - 0.05
    },
    color: '#fff0d4',
    intensity: 9,
    distance: 6.5,
    cct: WARM_WHITE_K,
    layer: 'ambient',
    ip: IP_INDOOR,
  },
  'ceiling-fan': {
    height: (p) => (typeof p.mountHeight === 'number' ? p.mountHeight : 2.5) - 0.35,
    color: '#fff1d6',
    intensity: 8,
    distance: 6,
    cct: WARM_WHITE_K,
    layer: 'ambient',
    ip: IP_INDOOR,
  },
  'wall-sconce': {
    height: (p) => (typeof p.mountHeight === 'number' ? p.mountHeight : 1.7),
    color: '#ffe2b0',
    intensity: 3.5,
    distance: 3,
    cct: WARM_WHITE_K,
    layer: 'accent',
    ip: IP_INDOOR,
  },
  'cove-light': {
    // Just above the lip, washing the ceiling with soft indirect warm light.
    height: (p) => (typeof p.mountHeight === 'number' ? p.mountHeight : 2.3) + 0.2,
    color: '#ffd9a0',
    intensity: 2.6,
    distance: 3.2,
    cct: WARM_WHITE_K,
    layer: 'accent',
    ip: IP_INDOOR,
  },
  vanity: {
    // Hollywood bulb ring around the rectangular mirror — a warm wash centred
    // on the mirror face, just in front of the glass. Only when the item's
    // `lights` param is on (bulbs render only with the rectangular mirror).
    enabled: (p) => p.lights === 'yes' && p.mirror === 'rect',
    height: () => 1.05,
    offset: (p) => [0, -(typeof p.depth === 'number' ? p.depth : 0.42) / 2 + 0.2],
    color: '#ffeec8',
    intensity: 2.8,
    distance: 2.6,
    cct: WARM_WHITE_K,
    layer: 'task',
    ip: IP_INDOOR,
  },
  aquarium: {
    // The tank's own light glows from within the water — a cool aqua accent that
    // reads beautifully at night. Low intensity (mood, not room lighting).
    height: () => 0.95,
    color: '#bfe8f2',
    intensity: 2.4,
    distance: 2.6,
    // NOT warm white: this fixture's own comment above calls it a cool aqua
    // accent, and 6500 K (daylight) is the standard freshwater aquarium lamp.
    // A blanket 3000 K was authored here by a bulk edit and caught on review —
    // the sort of plausible-but-contradicted value the `moduleMm` / paint-
    // coverage rules exist to prevent.
    cct: AQUARIUM_K,
    layer: 'accent',
    ip: IP_INDOOR,
  },
}

export function isEmitter(defId: FurnitureType): boolean {
  return defId in LIGHT_EMITTERS
}

/**
 * Fallback spec for a **user light-source override** (PARITY-FURNLIGHT): any
 * placed item with `props.lightOn === 'yes'` emits a warm point light, even if
 * its def isn't a registered fixture. Bulb sits a little above the item (reads
 * `props.height` when the item exposes one, else ~1.2 m).
 */
export const OVERRIDE_EMITTER: EmitterSpec = {
  height: (p) => (typeof p.height === 'number' ? p.height + 0.1 : 1.2),
  color: '#ffe2b0',
  intensity: 5,
  distance: 4,
  // A user light-source override on an arbitrary item: treated as accent, the
  // least load-bearing layer, so declaring a lamp cannot silently satisfy a
  // room's ambient requirement.
  layer: 'accent',
  // A user-declared light source on an arbitrary item: there is no product to
  // specify, so it carries the generic warm indoor spec. The schedule labels it
  // as a user override, so nobody quotes it as a fixture.
  cct: WARM_WHITE_K,
  ip: IP_INDOOR,
}

/**
 * Whether a *placed item* currently emits, composing the per-item power
 * override with each spec's own gate (WALK-LIGHT-INTERACT):
 * `props.lightOn === 'no'` is a hard, explicit "switched off" that wins over
 * EVERYTHING else — including a registered fixture's own `enabled` gate (e.g.
 * the vanity's Hollywood-bulb condition) — because it's the walk-mode
 * "flip this one switch" action, a deliberate per-item override, not a
 * fallback. Absent that override: a registered fixture whose `enabled` gate
 * (if any) passes emits by default; otherwise a non-registered item only
 * emits when the user flagged it as a light source (`props.lightOn ===
 * 'yes'`, the `itemAsLight` inspector toggle / walk-mode toggle-on). This
 * item-level gate is evaluated once, upstream of the scene-wide `lightsMode`
 * ('on' | 'off') brightness multiplier applied in
 * `FurnitureLights.tsx` — so an item switched off here never appears in the
 * active-lights set at all, regardless of what `lightsMode` says (composition
 * rule: **per-item toggle wins**, in every mode). `lightsMode`
 * only scales the brightness/timing of whichever items already passed this
 * per-item gate; it never re-adds an item this gate excluded.
 */
export function isItemEmitter(defId: FurnitureType, props: ParamProps): boolean {
  if (props.lightOn === 'no') return false
  const spec = LIGHT_EMITTERS[defId]
  if (spec) return spec.enabled?.(props) ?? true
  return props.lightOn === 'yes'
}

/** The emitter spec to drive a placed item's light, or `null` if it doesn't
 *  emit. `props.lightOn === 'no'` short-circuits to `null` first (see
 *  {@link isItemEmitter}); otherwise a registered fixture (gate-passing) wins,
 *  else a user override (`lightOn === 'yes'`) falls back to
 *  `OVERRIDE_EMITTER`. */
/**
 * The SPECIFIED lamp for one placed fixture: the item's own override where set,
 * else the registry default.
 *
 * `props.lampCct` / `props.lampIp` are a **specification** register, kept
 * strictly apart from `props.lightColor` / `props.lightIntensity`, which are
 * RENDER overrides on the same item. Tinting a lamp warmer in the 3D view must
 * not silently re-specify the product a contractor is asked to buy, and raising
 * a fixture's brightness for a night render must not change its lumen package
 * on the schedule. That is the same separation the `EmitterSpec.cct` docs
 * describe — visible here as two override pairs that deliberately do not talk
 * to each other.
 *
 * Falls back to the generic warm indoor spec for an item with no registered
 * emitter (a user light-source override), so a schedule row always has a spec
 * to quote rather than a blank.
 */
export function resolveLampSpec(
  defId: FurnitureType,
  props: ParamProps,
): { cct: number; ip: number } {
  const spec = LIGHT_EMITTERS[defId] ?? OVERRIDE_EMITTER
  const cct = typeof props.lampCct === 'number' ? props.lampCct : spec.cct
  const ip = typeof props.lampIp === 'number' ? props.lampIp : spec.ip
  return { cct, ip }
}

export function resolveEmitterSpec(defId: FurnitureType, props: ParamProps): EmitterSpec | null {
  if (props.lightOn === 'no') return null
  const spec = LIGHT_EMITTERS[defId]
  if (spec && (spec.enabled?.(props) ?? true)) return spec
  if (props.lightOn === 'yes') return OVERRIDE_EMITTER
  return null
}
