# src/dev/profiler — dev-only performance profiler

Detached-window ("DevTools-style") profiler. **Dev-only**: gated by the
`profiler` feature flag (`devOnly: true`, `tier: 'pro'`) AND `import.meta.env.DEV`
at every wiring point, so it tree-shakes out of production.

- **Bridge is a singleton reached via `window.__profiler`, not by import.**
  `openProfilerWindow` renders the PARENT's React root (`createRoot`) into the
  child window's DOM, so `ProfilerApp` actually runs in the MAIN window's
  realm — not a separate module realm. It must read the bridge via
  `window.__profiler` (installed by `installProfiler.ts`); `window.opener` is
  null for the main tab and must not be used. Still read the `window.__profiler`
  API surface rather than importing `profilerBridge` directly (that would risk
  a different instance if this ever changes to a true separate realm) — it's
  also just the cleaner facade.
- **The Canvas is `frameloop="demand"`.** The cost sweep drives its own
  `requestAnimationFrame` + `invalidate()` loop to force continuous frames while
  measuring; the live probe marks samples `continuous:false` when idle (shown as
  "idle" FPS).
- **Suspend the FPS guard during a sweep** via `benchmarkSignal` — the sweep
  mutates quality overrides, which would otherwise trip `QualityController`'s
  auto-downgrade.
- **A sweep step disables its effect via a quality override OR a store patch.**
  Not every expensive thing is a `QualitySettings` key — fixture lights are a
  user switch (`lightsMode`) — and an effect the sweep can't reach stays
  invisible in the one report anyone reads. Add store-level inputs to
  `SweepStorePatch`; the engine restores every patched field between steps and
  skips a step whose patch already matches live state (a guaranteed-0 ms row is
  noise, not data).
- **`runCostBreakdown(onProgress, { quick: true })`** trades sample count for
  wall-clock: a full sweep is `(settle + sample) x (1 + steps)` driven frames —
  720 at the default counts, which is minutes on a slow GPU (and doesn't finish
  at all under a headless software rasteriser). Quick mode ranks the effects;
  use the full run for close-together rows.
- **Pure logic is unit-tested** (`costBreakdown.ts`, `objectBreakdown.ts`,
  `profilerBridge.ts`); the live glue (`profilerEngine.ts`, probe, window, UI) is
  verified by running the app.
- **No colour literals** in the UI — inherit cloned app token classes.
