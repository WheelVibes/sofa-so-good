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
  /** Peak intensity at full darkness (candela; renderer uses physical units). */
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
}

export const LIGHT_EMITTERS: Partial<Record<FurnitureType, EmitterSpec>> = {
  'table-lamp': {
    height: (p) => (typeof p.surfaceHeight === 'number' ? p.surfaceHeight : 0.5) + 0.32,
    color: '#ffe6b8',
    intensity: 4,
    distance: 3.2,
  },
  'floor-lamp': {
    // An arc lamp's bulb hangs ~2 m up at the end of the arch, reaching out
    // over a sofa; disc/tripod bulbs sit at the pole top.
    height: (p) => (p.base === 'arc' ? 2.05 : 1.5),
    offset: (p) => (p.base === 'arc' ? [1.35, 0] : [0, 0]),
    color: '#ffdfae',
    intensity: 7,
    distance: 5.5,
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
  },
  'ceiling-fan': {
    height: (p) => (typeof p.mountHeight === 'number' ? p.mountHeight : 2.5) - 0.35,
    color: '#fff1d6',
    intensity: 8,
    distance: 6,
  },
  'wall-sconce': {
    height: (p) => (typeof p.mountHeight === 'number' ? p.mountHeight : 1.7),
    color: '#ffe2b0',
    intensity: 3.5,
    distance: 3,
  },
  'cove-light': {
    // Just above the lip, washing the ceiling with soft indirect warm light.
    height: (p) => (typeof p.mountHeight === 'number' ? p.mountHeight : 2.3) + 0.2,
    color: '#ffd9a0',
    intensity: 2.6,
    distance: 3.2,
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
  },
  aquarium: {
    // The tank's own light glows from within the water — a cool aqua accent that
    // reads beautifully at night. Low intensity (mood, not room lighting).
    height: () => 0.95,
    color: '#bfe8f2',
    intensity: 2.4,
    distance: 2.6,
  },
}

export function isEmitter(defId: FurnitureType): boolean {
  return defId in LIGHT_EMITTERS
}

/** Whether a *placed item* currently emits: registered AND its per-item
 *  `enabled` gate (if any) passes for the item's params. */
export function isItemEmitter(defId: FurnitureType, props: ParamProps): boolean {
  const spec = LIGHT_EMITTERS[defId]
  return spec !== undefined && (spec.enabled?.(props) ?? true)
}
