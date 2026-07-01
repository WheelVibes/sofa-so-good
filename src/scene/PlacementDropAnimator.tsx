import { useFrame, useThree } from '@react-three/fiber'
import { tickDrops } from './placementDrop'

/**
 * One mounted `useFrame` that advances placement drop-in animations
 * (`placementDrop.ts`) — mutating the dropping item groups' Y directly, so
 * `Furniture` needs no per-item `useFrame`. Cheap when idle (a single `Map.size`
 * check per frame); a drop keeps the demand-mode pump alive via the animated
 * source registered in `beginDrop`, and this invalidates while one is in flight.
 */
export function PlacementDropAnimator() {
  const invalidate = useThree((s) => s.invalidate)
  useFrame(() => {
    if (tickDrops(performance.now())) invalidate()
  })
  return null
}
