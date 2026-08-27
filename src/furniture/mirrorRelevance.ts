/**
 * Real-planar-reflection relevance + budget (MIRROR-RELEVANCE).
 *
 * ## Why this exists
 *
 * drei's `<MeshReflectorMaterial>` re-renders the ENTIRE scene from the mirror's
 * plane inside its own `useFrame`, unconditionally — no frustum check, no
 * visibility check, no throttle (see its source: it flips `parent.visible` off,
 * calls `gl.render(scene, virtualCamera)`, flips it back). At dollhouse-orbit
 * scale that buys almost nothing visually and costs an entire extra scene pass.
 *
 * Attributed on a Mac mini M4 with `scripts/dev-probes/render-attrib.mjs` —
 * ONE orbit frame at the High tier, per-`render()` draw calls:
 *
 * ```
 *  1  target=512x512   drawcalls=1710  tris=464280   <-- the mirror's reflection
 *  2  target=1280x800  drawcalls=2130  tris=604836   <-- the actual beauty pass
 *  …  16 more fullscreen-quad passes (post stack)    drawcalls=1 each
 * total draw calls this frame: 4002
 * ```
 *
 * So a single bathroom mirror — a few dozen pixels tall in the default orbit
 * view — was **43% of the frame's draw calls**. It is also fixed-resolution
 * (512²/1024²), which is why the tier's cost barely moved with screen
 * resolution: 7x the viewport pixels changed the frame budget by only ~9%,
 * because the frame was never fill-bound in the first place.
 *
 * The cost is best stated in draw calls, which `render-attrib.mjs` measures
 * directly: gating the mirror took an orbit frame at High from **4,002 draw calls
 * to 2,283**, and from two full-scene passes to one. (An earlier version of this
 * note quoted "41.9 → 58.4 fps"; those figures came from `tier-fps.mjs`, which
 * counted `requestAnimationFrame` ticks rather than renders. Under
 * `frameloop="demand"` those are not the same thing — see `scene/frameCost.ts` —
 * so they were a ceiling proxy, not a frame rate. Use
 * `scripts/dev-probes/frame-time.mjs`, which reports true per-frame cost.)
 *
 * ## The rule
 *
 * Spend the extra scene pass only when the mirror is big enough on screen for a
 * real reflection to be legible, and only for a bounded number of mirrors at
 * once — the same shape as the existing fixture-light budget
 * (`scene/lighting/chooseEmitters.ts`), which caps simultaneous point lights
 * rather than lighting every emitter in the home. Below the threshold the
 * long-standing tier-cheap fake-shiny pane renders instead, which at that size
 * is visually indistinguishable.
 *
 * Everything here is pure (no three, no React) so the thresholds, the hysteresis
 * and the budget ranking are unit-testable.
 */

/**
 * Fraction of the viewport HEIGHT a mirror of `sizeM` metres covers at
 * `distanceM` metres, under a vertical field of view of `fovDeg`.
 *
 * Standard pinhole projection: the viewport spans `2 * tan(fov/2)` world units
 * at unit distance, so an object's screen fraction is
 * `size / (distance * 2 * tan(fov/2))`. Height rather than width because
 * three's `PerspectiveCamera.fov` is the VERTICAL angle, so the vertical axis is
 * the one that doesn't depend on aspect ratio.
 */
export function mirrorScreenFraction(sizeM: number, distanceM: number, fovDeg: number): number {
  if (!Number.isFinite(sizeM) || !Number.isFinite(distanceM) || !Number.isFinite(fovDeg)) return 0
  if (sizeM <= 0 || fovDeg <= 0) return 0
  // Guard the singularity at the camera (and behind it): a mirror the camera is
  // sitting inside is maximally relevant, not infinitely so.
  if (distanceM <= 1e-3) return 1
  const halfFov = (Math.min(fovDeg, 179) / 2) * (Math.PI / 180)
  const frustumHeightAtDistance = 2 * Math.tan(halfFov) * distanceM
  return Math.min(1, sizeM / frustumHeightAtDistance)
}

/**
 * Screen fraction at or above which a real planar reflection is worth its extra
 * scene pass, and the (lower) fraction at which it is dropped again.
 *
 * Two thresholds, not one: the gate is evaluated against a live camera, so a
 * single threshold would flip the material back and forth while the user hovers
 * near it — and each flip is a material swap, i.e. a shader recompile. The band
 * is deliberately wide.
 *
 * Calibration (computed, not guessed — a 0.9 m tall pane):
 *
 * | view                     | distance | fov  | screen fraction |
 * | ------------------------ | -------- | ---- | --------------- |
 * | orbit dollhouse          | 12 m     | 45   | 0.091           |
 * | orbit, closer            |  9 m     | 45   | 0.121           |
 * | walk, across the room    |  4 m     | 70   | 0.161           |
 * | walk, a couple of steps  |  2.5 m   | 70   | 0.257           |
 * | walk, right in front     |  1.5 m   | 70   | 0.428           |
 *
 * The RELEASE threshold is what has to clear the orbit values: a mirror that
 * went real in walk mode must drop back to cheap when the user returns to the
 * dollhouse view, or the 43%-of-frame cost follows them out. Hence 0.14 (above
 * the 0.121 worst case) rather than a value merely below the engage point.
 */
export const MIRROR_REAL_ON_FRACTION = 0.22
export const MIRROR_REAL_OFF_FRACTION = 0.14

/**
 * Maximum simultaneous real planar reflections, regardless of size.
 *
 * Each one is a full extra scene pass, so cost is LINEAR in the number of
 * reflective panes in view — and a mirrored wardrobe, a wall mirror and a floor
 * mirror in one bedroom is an ordinary layout, not a pathological one. Without a
 * cap that room would render the scene four times per frame. One is enough: the
 * user can only really inspect one mirror at a time, and it is the nearest/
 * largest one that sells the effect.
 */
export const MIRROR_REAL_BUDGET = 1

/**
 * Hysteresis gate. `wasReal` is the mirror's CURRENT state, so the caller feeds
 * its own last decision back in.
 */
export function shouldRenderRealMirror(screenFraction: number, wasReal: boolean): boolean {
  const f = Number.isFinite(screenFraction) ? screenFraction : 0
  return wasReal ? f >= MIRROR_REAL_OFF_FRACTION : f >= MIRROR_REAL_ON_FRACTION
}

/** A mirror competing for the real-reflection budget. */
export interface MirrorCandidate {
  id: string
  /** Fraction of viewport height it covers — the ranking key. */
  screenFraction: number
}

/**
 * Pick which candidates get a real reflection: apply the hysteresis gate to each
 * pane against its OWN previous state, then take the largest-on-screen up to
 * `budget`. Ties break on `id` so the result is stable frame to frame (an
 * unstable order would thrash the material swap).
 *
 * Hysteresis and budget are resolved TOGETHER, here, on the whole candidate set
 * — not independently per pane. A pane cannot know whether a bigger mirror
 * elsewhere has already claimed the budget, so a per-pane decision lets two
 * panes both believe they won and render two full scene passes (observed with
 * two bathroom mirrors before this was centralised).
 */
export function rankRealMirrors(
  candidates: ReadonlyArray<MirrorCandidate>,
  prevGranted: ReadonlyArray<string> = [],
  budget: number = MIRROR_REAL_BUDGET,
): string[] {
  if (budget <= 0) return []
  const prev = new Set(prevGranted)
  return candidates
    .filter(
      (c) =>
        Number.isFinite(c.screenFraction) &&
        shouldRenderRealMirror(c.screenFraction, prev.has(c.id)),
    )
    .slice()
    .sort((a, b) => b.screenFraction - a.screenFraction || (a.id < b.id ? -1 : 1))
    .slice(0, budget)
    .map((c) => c.id)
}
