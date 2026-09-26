import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { shouldReduceMotion } from './motionPreference'

/**
 * The single gate for decorative ambient effects (P7): the `ambientFx` flag AND
 * a non-`performance` `qualityTier` AND no reduced motion (U4: OS
 * `prefers-reduced-motion` OR the in-app override). Dormant by
 * default — Performance is every device's default tier — so these effects cost
 * nothing until a user opts into a heavier tier. Every effect consumes this and
 * renders nothing when it returns false.
 *
 * Continuously-animating effects (the HQ border-beam) additionally mount only
 * while active and IntersectionObserver-pause off-screen; event-driven ones (the
 * catalog radial gradient) need only this gate.
 */
export function useAmbientFx(): boolean {
  const on = useFeature('ambientFx')
  const tier = useStore((s) => s.qualityTier)
  // Selected (not just read inside shouldReduceMotion() alone) so a live
  // toggle of the in-app override re-renders every consumer immediately —
  // shouldReduceMotion() itself always reads the current value either way.
  useStore((s) => s.reduceMotion)
  return on && tier !== 'performance' && !shouldReduceMotion()
}
