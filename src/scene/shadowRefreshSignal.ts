/**
 * PERF-MAX-1 shared signal: "a discrete scene change happened recently, so the
 * (otherwise frozen) sun shadow map must be re-rendered for a short window".
 *
 * The sun shadow map is expensive (up to 4096² depth render + all shadow-casting
 * geometry, every frame) but its content is a pure function of the sun direction
 * and the shadow-casting geometry — NOT the camera (the directional frustum is
 * centred on the plan). So `Lighting` freezes it (`shadow.autoUpdate = false`)
 * and only re-renders it when it can actually change. Camera-only motion (orbit /
 * turntable auto-rotate / walk) renders via OrbitControls' own `invalidate()` +
 * module signals and never writes the store, so it must NOT trigger a refresh.
 *
 * `RenderPump`'s `markDirty` fires on every discrete store change (furniture
 * move/add/remove, plan edit, orientation, door toggle, finish swap, quality-tier
 * change that remounts the light, …) and sets a short "settle tail". It pulses
 * this signal with that same deadline, and `Lighting` re-arms the shadow while
 * the deadline is in the future — a precise catch-all for geometry/sun changes
 * that keeps the freeze intact during pure camera motion.
 *
 * Continuous furniture animations (spinning fans, sliding curtains) are covered
 * separately by `animatedSourceCount()`; the sun day/night tween by the tween's
 * own `!settled` check. A plain module singleton (no store round-trip, no React
 * re-render) — same pattern as `fixtureGlow`/`animatedSources`.
 */
let dirtyUntil = 0

/** Called by RenderPump.markDirty with its settle-tail deadline (perf.now ms). */
export function pulseShadowRefresh(untilMs: number): void {
  if (untilMs > dirtyUntil) dirtyUntil = untilMs
}

/** True while the last discrete change's settle tail is still open. */
export function isShadowRefreshActive(nowMs: number): boolean {
  return nowMs < dirtyUntil
}

/** Small forward window (ms) a continuously-animating shadow caster re-arms the
 *  refresh by, each frame it moves — so the frozen map keeps updating while it
 *  animates and re-freezes a couple frames after it stops. */
const MOTION_TAIL_MS = 200

/**
 * Re-arm the shadow refresh from a shadow caster that animates its transform
 * every frame WITHOUT a store change (spinning ceiling/standing fan, easing
 * curtain draw / blind raise). Call it each frame the caster actually moves.
 * Distinct from wall-reveal fades (opacity only — no shadow effect), which is
 * why `Lighting` must NOT key its refresh off the generic `animatedSourceCount`.
 */
export function pulseShadowRefreshForMotion(): void {
  pulseShadowRefresh(performance.now() + MOTION_TAIL_MS)
}

/** Test-only reset. */
export function __resetShadowRefresh(): void {
  dirtyUntil = 0
}
