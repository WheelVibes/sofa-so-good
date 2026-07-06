/**
 * Module singleton: is the profiler running a cost sweep right now? The sweep
 * mutates quality overrides frame-by-frame; the adaptive FPS guard in
 * `QualityController` reads this and skips its auto-downgrade so it doesn't
 * fight the sweep. Same plain-signal pattern as `renderPumpSignal`.
 */
let active = false

export function setProfilerBenchmarkActive(v: boolean): void {
  active = v
}

export function isProfilerBenchmarkActive(): boolean {
  return active
}
