/**
 * ORBIT-SHELL-CLAMP — keep the orbit/dollhouse camera OUTSIDE the building envelope.
 *
 * `<OrbitControls>` constrains the orbit with two SCALARS: `minDistance` (3 m) and
 * `maxPolarAngle` (`π/2 − 0.015`, just shy of horizontal). Neither knows how big the flat is,
 * and that is the whole defect behind finding S5 of
 * `docs/audit/interaction-sweep-2026-09-18.md`. Measured on the recorded clip: target
 * `(6.36, 1, 4.69)` — the centre of a 12.6 × 10.6 m flat — radius **5.96 m**, dragged to the
 * polar limit, puts the camera at `(10.56, 1.09, 8.91)`: 5.96 m is well past `minDistance`, and
 * 1.09 m is well under the 2.6 m ceiling, so the camera is standing INSIDE the kitchen. The
 * reverse drag cannot recover because at that radius EVERY polar angle below ~64° is still
 * inside the shell — the clamp the user is fighting is not the one that trapped them.
 *
 * So the constraint the orbit actually needs is geometric: the camera must stay outside an
 * axis-aligned box around the storey (`shellBoxForPlan`), and when it is inside it is pushed
 * radially OUT along its own view ray until it clears (`pushOutsideShell`) — radially, so the
 * framing (which way the camera looks at the flat) is preserved and only the dolly distance
 * grows. Pure and dependency-free so the geometry is unit-tested with plain numbers, exactly
 * like its neighbours `frameSelection.ts` / `cameraTween.ts` / `verticalLock.ts`.
 */

export type Vec3 = [number, number, number]

/** The storey's world AABB, already padded by {@link ORBIT_SHELL_PAD}. The plan's footprint
 *  runs from the origin to `(width, depth)` (see `floorplan/planExtent.ts`), and the shell
 *  stands on Y = 0, so only `top` needs stating. */
export interface ShellBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  top: number
}

/**
 * Metres the camera must clear the shell by. The near plane is 0.1 m and the external walls are
 * 0.2 m thick, so anything under ~0.3 m still near-plane-slices a wall it is nominally outside
 * of; 0.6 m also leaves room for the window sills / AC ledges that stand proud of the facade.
 */
export const ORBIT_SHELL_PAD = 0.6

/**
 * Time constant (seconds) of the push-out. The clamp is a CORRECTION applied to a pose the user
 * drove into, so it must read as the camera being eased back rather than as a teleport — the
 * same argument `REVEAL_TAU` makes for the wall fade. Short enough that the camera is out of the
 * shell within ~3 frames of a 60 fps drag.
 */
export const ORBIT_SHELL_TAU = 0.12

/** Below this (metres) the push snaps onto its destination instead of approaching it
 *  asymptotically, so the camera lands exactly on the envelope rather than creeping. */
export const ORBIT_SHELL_SNAP = 0.01

/** Largest `delta` (seconds) the ease honours, so one long stall eases rather than teleports. */
const MAX_DELTA = 0.1

/**
 * The padded storey box for a plan of `width` × `depth` metres standing on Y = 0 with
 * `ceilingHeight` headroom. `pad` is applied on every side INCLUDING the top, so a camera
 * hovering just over the roof is also pushed clear.
 */
export function shellBoxForPlan(
  width: number,
  depth: number,
  ceilingHeight: number,
  pad = ORBIT_SHELL_PAD,
): ShellBox {
  return {
    minX: -pad,
    maxX: width + pad,
    minZ: -pad,
    maxZ: depth + pad,
    top: ceilingHeight + pad,
  }
}

/** True when `p` lies inside the padded box. The floor is the box's own bottom: a point BELOW
 *  Y = 0 is under the slab, which is just as much "inside the building" for this purpose. */
export function insideShell(p: Vec3, box: ShellBox): boolean {
  return p[0] > box.minX && p[0] < box.maxX && p[2] > box.minZ && p[2] < box.maxZ && p[1] < box.top
}

/**
 * Smallest `t > 0` at which the ray `origin + t · dir` leaves `box` — the slab exit parameter,
 * i.e. the MIN over the axes of each axis's far-plane hit. The box is open below (a camera can
 * never legitimately be under the slab looking up), so −Y is not an exit. Returns `null` when
 * the direction is degenerate or no axis provides one.
 */
export function shellExitT(origin: Vec3, dir: Vec3, box: ShellBox): number | null {
  let t = Number.POSITIVE_INFINITY
  const axis = (o: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < 1e-9) return
    const tt = ((d > 0 ? hi : lo) - o) / d
    if (tt > 0 && tt < t) t = tt
  }
  axis(origin[0], dir[0], box.minX, box.maxX)
  axis(origin[2], dir[2], box.minZ, box.maxZ)
  // +Y only: the top plane. A downward ray exits through a side, never through the floor.
  if (dir[1] > 1e-9) {
    const tt = (box.top - origin[1]) / dir[1]
    if (tt > 0 && tt < t) t = tt
  }
  return Number.isFinite(t) ? t : null
}

/**
 * Where the orbit camera SHOULD be, given where it is. Returns `null` when the camera already
 * clears the envelope (the overwhelmingly common case — one box test per frame, no allocation
 * on that path).
 *
 * When it does not:
 *  - **target inside the shell** (the dollhouse pivot normally is): push the camera along its
 *    OWN offset from the target, out to the box surface. The look direction, and therefore the
 *    wall-reveal facing and the whole composition, is unchanged; only the dolly distance grows.
 *    This is the case the recorded clip hits.
 *  - **target outside** (the user panned the pivot out of the flat first): there is no radial
 *    solution, so escape along the axis of LEAST penetration — the shortest move that makes the
 *    frame legal.
 * A degenerate zero-length offset falls back to the same axis escape.
 */
export function pushOutsideShell(cam: Vec3, target: Vec3, box: ShellBox): Vec3 | null {
  if (!insideShell(cam, box)) return null
  const dx = cam[0] - target[0]
  const dy = cam[1] - target[1]
  const dz = cam[2] - target[2]
  if (insideShell(target, box) && Math.hypot(dx, dy, dz) > 1e-6) {
    const t = shellExitT(target, [dx, dy, dz], box)
    // `t >= 1` always holds when both ends are inside; guard anyway so a numeric edge can only
    // ever push the camera OUT, never pull it in.
    if (t != null && t >= 1) {
      const s = t + 1e-3
      return [target[0] + dx * s, target[1] + dy * s, target[2] + dz * s]
    }
  }
  return escapeShell(cam, box)
}

/** Nearest point outside `box` from an interior point, along the axis of least penetration.
 *  −Y is excluded (see {@link shellExitT}) so the camera is never pushed under the slab. */
export function escapeShell(p: Vec3, box: ShellBox): Vec3 {
  const cands: Array<[number, Vec3]> = [
    [p[0] - box.minX, [box.minX, p[1], p[2]]],
    [box.maxX - p[0], [box.maxX, p[1], p[2]]],
    [p[2] - box.minZ, [p[0], p[1], box.minZ]],
    [box.maxZ - p[2], [p[0], p[1], box.maxZ]],
    [box.top - p[1], [p[0], box.top, p[2]]],
  ]
  let best = cands[0]
  for (const c of cands) if (c[0] < best[0]) best = c
  return best[1]
}

/**
 * One frame of the eased recovery: a frame-rate-INDEPENDENT exponential approach of `cur` to
 * `dest` with time constant `tau` seconds (the exact discrete form of `dx/dt = (dest − x)/τ`,
 * same as `wallRevealMath.ts:easeRevealOpacity`), snapping within {@link ORBIT_SHELL_SNAP}. A
 * non-finite or non-positive `delta` leaves the position untouched.
 */
export function easeShellPush(cur: Vec3, dest: Vec3, delta: number, tau = ORBIT_SHELL_TAU): Vec3 {
  const gap = Math.hypot(dest[0] - cur[0], dest[1] - cur[1], dest[2] - cur[2])
  if (gap <= ORBIT_SHELL_SNAP) return dest
  if (!Number.isFinite(delta) || delta <= 0) return cur
  const k = 1 - Math.exp(-Math.min(delta, MAX_DELTA) / Math.max(1e-4, tau))
  const next: Vec3 = [
    cur[0] + (dest[0] - cur[0]) * k,
    cur[1] + (dest[1] - cur[1]) * k,
    cur[2] + (dest[2] - cur[2]) * k,
  ]
  return gap * (1 - k) <= ORBIT_SHELL_SNAP ? dest : next
}
