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
