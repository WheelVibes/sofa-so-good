import type { ThreeElements } from '@react-three/fiber'
import { useSyncExternalStore } from 'react'
import { isIblActive, NO_IBL_METALNESS, subscribeIbl } from '../../materials/iblSignal'

/**
 * `<meshStandardMaterial>` for METAL, with the no-environment metalness cap.
 *
 * A fully metallic PBR surface has no diffuse term — everything it shows is
 * reflected environment — so on a tier with `ibl: false` (Performance, the
 * default) it renders BLACK. The shared factories (`getMetalMaterial` /
 * `getSolidMaterial`) already cap for that, but dozens of primitives build their
 * metal inline in JSX and bypass them; those accents stayed dark.
 *
 * A component rather than a hook, deliberately: many of these materials are
 * created inside `.map()` callbacks, where calling a hook per item would break
 * the rules of hooks. A component can be rendered in a loop freely, and
 * `useSyncExternalStore` keeps it reactive so switching render tiers updates the
 * metals without a remount.
 */
type MetalMaterialProps = ThreeElements['meshStandardMaterial']

export function MetalMaterial({ metalness, ...rest }: MetalMaterialProps) {
  const ibl = useSyncExternalStore(subscribeIbl, isIblActive, isIblActive)
  const m =
    typeof metalness === 'number' && !ibl ? Math.min(metalness, NO_IBL_METALNESS) : metalness
  return <meshStandardMaterial {...rest} metalness={m} />
}
