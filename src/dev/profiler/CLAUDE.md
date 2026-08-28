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
- **The sweep measures FLAT-OUT THROUGHPUT, not per-frame budget — never compare its
  milliseconds to 16.67 ms, and never quote a single row's cost (PROFILER-THROUGHPUT-NOT-BUDGET).**
  `measureRenderMs` drives `advance(..., true)` in a tight batch of 10 with a `ctx.finish()`
  per batch. That is deliberate and it is the only way to get a GPU-inclusive number in
  WebGL — but it renders back-to-back with no vsync pacing, no CPU/GPU overlap and no idle
  recovery between frames, so it answers "how long does a render take with the GPU
  saturated", which is a different question from "does this frame fit in a 60 Hz budget".
  Measured on the default flat at Maximum/21:00, the two differ by ~4x: the primitive reads
  **30-47 ms** while paced submit-time cost over the same session is **10.6-11.4 ms**.
  · **Maximum MEETS the 60 fps budget.** The **34.54 ms figure quoted in the fixture-light
    commit is this throughput number**, not a frame time, and the app does not miss 60 fps
    at Maximum. Corroborated by `scripts/dev-probes/night-lights.mjs` (11.7 ms p50) and by
    plain submit cost measured before AND after a sweep in the same session.
  · **The primitive's NOISE swamps the effects it is meant to resolve, so the per-row deltas
    cannot be trusted at all.** `scripts/dev-probes/profiler-noise.mjs` repeats
    `measureRenderMs` verbatim N times with NO override applied and nothing else touched:
    10 identical iterations spanned **30.40-46.53 ms (1.53x)** at the quick sample count and
    **34.36-47.02 ms (1.37x)** at the full one — so more samples does NOT fix it. That is
    roughly +-8 ms of noise against real per-effect costs of 0.1-1.8 ms (`night-lights.mjs`
    measures the whole 19-fixture set at 0.1 ms on performance and 1.6 ms on maximum). The
    sweep can rank only very large effects; a row whose delta is under ~10 ms is noise, which
    is why five of eight effects have come out with NEGATIVE cost in real runs.
  · **This is NOT the settle predicate and NOT the sweep steps.** Both were suspected and the
    noise probe exonerates them: nothing changes between those N iterations — no override, no
    store write, no remount — so the spread is the measurement's own. Two fixes were built,
    measured and REVERTED before that was known; do not re-attempt either. (1) Warming the
    pipeline first: a run WITHOUT it read 12.73 ms and a run WITH it read 33.56 ms, so the
    apparent cold/warm effect was variance at n=1. (2) A PAIRED per-step baseline: structurally
    right for a drifting benchmark, but it doubled the runtime and left three deltas negative,
    because the variance is finer-grained than a pair can cancel.
  · **If per-effect cost is ever genuinely needed**, the honest route is to measure the app in
    its PACED state (wrap `renderer.render` and sum per animation frame, as `scene/frameCost.ts`
    does) with the effect toggled between two long runs — not to make this primitive quieter.
  · Harness notes: `runCostBreakdown` is ONE long `evaluate` call, so a headless driver needs
    `protocolTimeout` raised well above puppeteer's 180 s default or it dies mid-sweep with a
    `ProtocolError` that reads like a page crash; and never edit a source file while a sweep
    runs — Vite HMR reloads the page and the run dies with "Execution context was destroyed".
- **`runCostBreakdown(onProgress, { quick: true })`** trades sample count for
  wall-clock: a full sweep is `(settle + sample) x (1 + steps)` driven frames —
  720 at the default counts, which is minutes on a slow GPU (and doesn't finish
  at all under a headless software rasteriser). Quick mode ranks the effects;
  use the full run for close-together rows.
- **Pure logic is unit-tested** (`costBreakdown.ts`, `objectBreakdown.ts`,
  `profilerBridge.ts`); the live glue (`profilerEngine.ts`, probe, window, UI) is
  verified by running the app.
- **No colour literals** in the UI — inherit cloned app token classes.
