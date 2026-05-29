/**
 * Registry of furniture defs that emit real light at night, plus how their
 * point light is placed and tuned. Centralised so the scene can cap the
 * number of active lights for performance rather than letting every fixture
 * add an unbounded light.
 */
import type { FurnitureType, ParamProps } from './types';

export interface EmitterSpec {
  /** Emit height above the floor, in metres. May read item params. */
  height: (props: ParamProps) => number;
  color: string;
  /** Peak intensity at full darkness (candela; renderer uses physical units). */
  intensity: number;
  /** Falloff distance in metres. */
  distance: number;
}

export const LIGHT_EMITTERS: Partial<Record<FurnitureType, EmitterSpec>> = {
  'floor-lamp': {
    height: () => 1.5,
    color: '#ffdfae',
    intensity: 7,
    distance: 5.5,
  },
  'ceiling-light': {
    height: (p) => {
      const mount = typeof p.mountHeight === 'number' ? p.mountHeight : 2.55;
      const drop = p.style === 'flush' ? 0 : typeof p.drop === 'number' ? p.drop : 0.45;
      return mount - drop - 0.05;
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
};

export function isEmitter(defId: FurnitureType): boolean {
  return defId in LIGHT_EMITTERS;
}
