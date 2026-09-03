import { resolveQuality } from '../../scene/quality'
import { useStore } from '../../state/store'

/** Furniture-geometry tessellation multiplier from the active mode + device class
 *  (0.7 / 1 / 1.4 / 1.8). Subscribes narrowly so a primitive re-renders only when
 *  the multiplier actually changes. Use with `seg`. */
export function useDetail(): number {
  return useStore(
    (s) => resolveQuality(s.qualityTier, s.qualityOverrides, s.deviceClass).geometryDetail,
  )
}

/** Scale a baseline radial/curve segment count by the detail multiplier,
 *  clamped to a sane minimum so low-end devices still read as round. */
export function seg(base: number, detail: number, min = 8): number {
  return Math.max(min, Math.round(base * detail))
}
