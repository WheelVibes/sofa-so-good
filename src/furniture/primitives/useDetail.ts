import { useStore } from '../../state/store';
import { resolveQuality } from '../../scene/quality';

/** Furniture-geometry tessellation multiplier from the active quality tier
 *  (Low 0.7 → Medium 1 → High 1.8). Subscribes narrowly so a primitive
 *  re-renders only when the multiplier actually changes. Use with `seg`. */
export function useDetail(): number {
  return useStore((s) => resolveQuality(s.qualityTier, s.qualityOverrides).geometryDetail);
}

/** Scale a baseline radial/curve segment count by the detail multiplier,
 *  clamped to a sane minimum so low-end devices still read as round. */
export function seg(base: number, detail: number, min = 8): number {
  return Math.max(min, Math.round(base * detail));
}
