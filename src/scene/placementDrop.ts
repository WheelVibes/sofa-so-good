/**
 * Placement "drop-in": a freshly placed item eases down onto its resting spot
 * from a small height — a bit of tactile feedback that makes a drop feel placed
 * rather than teleported. The timing math here is pure (unit-tested); a single
 * mounted <PlacementDropAnimator> ticks it each frame and mutates the dropping
 * item groups' Y directly, because `Furniture` deliberately has NO per-item
 * `useFrame` (the perf rule — only a few primitives animate). Items register
 * their root group here; only the handful that are mid-drop are ever touched.
 */

import type { Group } from 'three'
import { registerAnimatedSource } from './animatedSources'

/** Height (m) above the resting spot the item drops from. */
export const DROP_HEIGHT = 0.16
/** Drop duration (ms). */
export const DROP_MS = 300

const starts = new Map<string, number>() // id → start time (performance.now ms)
const groups = new Map<string, Group>() // id → item root group
const bases = new Map<string, number>() // id → resting Y (captured on first tick)
const releases = new Map<string, () => void>() // id → animated-source disposer

/** Ease-out cubic — a soft, decelerating landing (clamped 0→1). */
export function dropEase(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t
  const inv = 1 - c
  return 1 - inv * inv * inv
}

/** Height above rest (m) for a drop `elapsedMs` in; `DROP_HEIGHT` at the start,
 *  eased down to 0 once landed. */
export function dropOffsetY(elapsedMs: number): number {
  if (elapsedMs >= DROP_MS) return 0
  if (elapsedMs <= 0) return DROP_HEIGHT
  return DROP_HEIGHT * (1 - dropEase(elapsedMs / DROP_MS))
}

/** Begin a drop-in for a freshly placed item (restart if already dropping). */
export function beginDrop(id: string, nowMs: number): void {
  // If a group is already tracked at a lifted Y from a prior drop, snap it back
  // before restarting so the base recapture is the true resting Y.
  const g = groups.get(id)
  const base = bases.get(id)
  if (g && base !== undefined) g.position.y = base
  starts.set(id, nowMs)
  bases.delete(id)
  if (!releases.has(id)) releases.set(id, registerAnimatedSource())
}

/** Register an item's root group so the animator can move it; returns a disposer. */
export function registerDropGroup(id: string, g: Group): () => void {
  groups.set(id, g)
  return () => {
    if (groups.get(id) === g) groups.delete(id)
  }
}

function endDrop(id: string): void {
  const g = groups.get(id)
  const base = bases.get(id)
  if (g && base !== undefined) g.position.y = base
  starts.delete(id)
  bases.delete(id)
  releases.get(id)?.()
  releases.delete(id)
}

/** True while any drop is in flight. */
export function hasActiveDrops(): boolean {
  return starts.size > 0
}

/**
 * Advance every active drop to `nowMs`, mutating each dropping group's Y; ends
 * finished drops (releasing their render-pump hold + snapping Y to rest).
 * Returns true if any drop is still animating (caller invalidates the frame).
 */
export function tickDrops(nowMs: number): boolean {
  if (starts.size === 0) return false
  let active = false
  for (const [id, start] of [...starts]) {
    const elapsed = nowMs - start
    const g = groups.get(id)
    if (g) {
      // Capture the resting Y the first time we see the group (React set it on
      // mount), then drive Y = rest + offset each frame.
      if (!bases.has(id)) bases.set(id, g.position.y)
      g.position.y = (bases.get(id) as number) + dropOffsetY(elapsed)
    }
    if (elapsed >= DROP_MS) endDrop(id)
    else active = true
  }
  return active
}

/** Test-only reset (releases any held render-pump sources). */
export function __resetDrops(): void {
  for (const r of releases.values()) r()
  starts.clear()
  groups.clear()
  bases.clear()
  releases.clear()
}
