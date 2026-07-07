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
- **Pure logic is unit-tested** (`costBreakdown.ts`, `objectBreakdown.ts`,
  `profilerBridge.ts`); the live glue (`profilerEngine.ts`, probe, window, UI) is
  verified by running the app.
- **No colour literals** in the UI — inherit cloned app token classes.
