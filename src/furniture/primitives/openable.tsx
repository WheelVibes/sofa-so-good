import { useFrame, useThree } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import type { Group } from 'three'
import { registerAnimatedSource } from '../../scene/animatedSources'
import { pulseShadowRefreshForMotion } from '../../scene/shadowRefreshSignal'
import { advanceOpen, DOOR_OPEN_ANGLE, easeInOut, OPEN_SECONDS } from '../cabinetOpen'

/**
 * Shared open/close animation runners for cabinet-family fronts (CABINET-OPEN).
 * A `HingedDoor` swings a leaf about its hinge edge; a `SlideDrawer` translates a
 * drawer forward. Both ease a raw 0..1 progress toward the target over a fixed
 * `OPEN_SECONDS` (true ease-in-out via {@link easeInOut}), holding the demand
 * render-loop + frozen sun-shadow map open **only while moving** — exactly like
 * `Curtain`/`RollerBlind`. Children are positioned in the primitive's normal local
 * space; the wrapper's transform is identity at the closed pose, so nothing shifts
 * when closed.
 */

/** Drive `apply(easedFraction)` each frame while easing `open` → target. */
function useOpenEase(open: boolean, apply: (frac: number) => void): void {
  const target = open ? 1 : 0
  const rawRef = useRef(target)
  const holdRef = useRef<null | (() => void)>(null)
  const invalidate = useThree((s) => s.invalidate)
  useFrame((_, dt) => {
    const cur = rawRef.current
    if (cur !== target) {
      if (!holdRef.current) holdRef.current = registerAnimatedSource()
      // The moving leaf/drawer casts sun shadows → keep the frozen map refreshing
      // through the sweep (PERF-MAX-1), then let it re-freeze once settled.
      pulseShadowRefreshForMotion()
      const next = advanceOpen(cur, target, dt, OPEN_SECONDS)
      rawRef.current = next
      invalidate()
      if (next === target && holdRef.current) {
        holdRef.current()
        holdRef.current = null
      }
    }
    // Apply every active frame (cheap): keeps the pose correct after a re-render
    // and settles exactly on the target.
    apply(easeInOut(rawRef.current))
  })
}

/**
 * Swing `children` about a vertical hinge axis at local (`pivotX`, `pivotZ`).
 * `swingSign` (±1) sets the direction (see `cabinetOpen.doorHingePivot`). The
 * double translate cancels at the closed pose, so children keep their normal
 * absolute local positions.
 */
export function HingedDoor({
  open,
  pivotX,
  pivotZ,
  swingSign,
  angle = DOOR_OPEN_ANGLE,
  children,
}: {
  open: boolean
  pivotX: number
  pivotZ: number
  swingSign: number
  angle?: number
  children: ReactNode
}) {
  const leafRef = useRef<Group>(null)
  useOpenEase(open, (frac) => {
    if (leafRef.current) leafRef.current.rotation.y = swingSign * angle * frac
  })
  return (
    <group position={[pivotX, 0, pivotZ]}>
      <group ref={leafRef}>
        <group position={[-pivotX, 0, -pivotZ]}>{children}</group>
      </group>
    </group>
  )
}

/** Slide `children` forward (+Z, into the room) by up to `distance` metres. */
export function SlideDrawer({
  open,
  distance,
  children,
}: {
  open: boolean
  distance: number
  children: ReactNode
}) {
  const ref = useRef<Group>(null)
  useOpenEase(open, (frac) => {
    if (ref.current) ref.current.position.z = distance * frac
  })
  return <group ref={ref}>{children}</group>
}
