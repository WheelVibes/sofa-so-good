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
- **The sweep's ABSOLUTE numbers are unreliable — treat the report as a RANKING and never
  quote a row's milliseconds (PROFILER-UNSTABLE-BASELINE).** Measured headlessly on the
  default flat at Maximum/21:00 via `scripts/dev-probes/profiler-frame.mjs`, the baseline
  frame for the SAME scene at the SAME settings came out **34.92 / 42.59 / 12.73 / ~26 /
  33.56 ms** across five runs — a 3.6x swing. The arithmetic consequence is visible in the
  report itself: with a low baseline several independent effects each appear to save ~70% of
  the frame, and with a high one **five of eight effects come out with NEGATIVE cost**
  (disabling contact shadows "costing" 14.58 ms), which is impossible.
  **The instability is in the MEASUREMENT, not the machine.** Plain submit-time cost over the
  same sessions is flat: 10.6-11.4 ms before a sweep and 11.0-11.3 ms after it, every time.
  · **Therefore Maximum MEETS the 60 fps budget on this hardware**, and the **34.54 ms figure
    quoted in the fixture-light commit should not be relied on** — it is one draw from this
    distribution, not a stable reading. The 11 ms submit figure is corroborated by
    `night-lights.mjs` (11.7 ms p50) and by every sweep row that lands low (~10-12 ms).
  · **Two fixes were built, measured and REVERTED — do not re-attempt either without first
    fixing the cause below.** (1) Warming the pipeline before the first measurement, on the
    theory that `settleUntilStable` settles on a cold-but-briefly-stable slow speed: a run
    WITHOUT it read 12.73 ms and a run WITH it read 33.56 ms, so the warm-up does not
    determine the outcome and the apparent cold/warm effect was variance at n=1. (2) A PAIRED
    per-step baseline (re-measure the baseline immediately before each step, so both arms see
    the same machine state) — structurally right for a drifting benchmark, but it doubled the
    runtime and left three deltas still negative, because the variance is finer-grained than a
    pair can cancel.
  · **The prime suspect is the settle predicate, and the decisive test has not been run yet:
    measure the baseline N times in a row with NO override at all.** If it alone swings
    12<->46 ms, the settle is the bug and the sweep steps are innocent. `settleUntilStable`
    only asks whether the render time has stopped CHANGING, and quick mode accepts a SINGLE
    window of 6 frames within 5% — while applying an override re-renders React, recompiles
    materials and reallocates render targets, so two consecutive batches can easily agree
    within 5% while both still pay for that rebuild.
  · Harness note: `runCostBreakdown` is ONE long `evaluate` call, so a headless driver needs
    `protocolTimeout` raised well above puppeteer's 180 s default — otherwise it dies mid-sweep
    with a `ProtocolError` that reads like a page crash. And never edit a source file while a
    sweep is running: Vite HMR reloads the page and the run dies with "Execution context was
    destroyed".
- **`runCostBreakdown(onProgress, { quick: true })`** trades sample count for
  wall-clock: a full sweep is `(settle + sample) x (1 + steps)` driven frames —
  720 at the default counts, which is minutes on a slow GPU (and doesn't finish
  at all under a headless software rasteriser). Quick mode ranks the effects;
  use the full run for close-together rows.
- **Pure logic is unit-tested** (`costBreakdown.ts`, `objectBreakdown.ts`,
  `profilerBridge.ts`); the live glue (`profilerEngine.ts`, probe, window, UI) is
  verified by running the app.
- **No colour literals** in the UI — inherit cloned app token classes.
