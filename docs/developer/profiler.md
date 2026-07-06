# Performance profiler (dev-only)

A detached-window, "DevTools-style" performance profiler for the 3D viewport.
It lives entirely in `src/dev/profiler/` and never ships to production — see
[Dev-only guarantee](#dev-only-guarantee) below.

## What it is

Three views of runtime rendering cost, in a separate popup window so it
doesn't compete for screen space with the app:

- **Live** — a rolling metrics dashboard (FPS, frame time, draw calls,
  triangles, resident geometries/textures, JS heap, light count) sampled every
  frame from the main Three.js renderer.
- **Cost** — an on-demand sweep that toggles each render-quality effect
  (post-processing, shadows, SSAO, bloom, …) off and back on, measuring the
  frame-time delta, so you can see which effect is expensive **at the current
  render tier**.
- **Objects** — a per-furniture-item GPU breakdown (triangles, mesh count,
  material count), ranked so the heaviest items surface first; clicking a row
  selects that item in the main window.

## How to open it

1. Run the app in dev (`npm run dev`) and switch to **Pro mode** (the
   `profiler` flag is `tier: 'pro'`, so it's hidden in Simple mode).
2. `⌘K` (or `Ctrl K`) → **"Open profiler (dev)"**.

This opens a real `window.open()` popup (allow popups for the dev origin if
the browser blocks it) and clones the parent document's stylesheets + theme
attributes into it so the profiler UI is themed consistently with the main
app (light/dark + the 5 app themes) without a build step of its own. Re-running
the command re-focuses the existing window instead of opening a second one.

## The three tabs

### Live

Subscribes to a throttled snapshot stream (`profilerBridge`) fed by a probe
mounted inside the R3F `<Canvas>`. Because the canvas runs
`frameloop="demand"` (frames only render on state changes/interaction, not a
free-running loop), the FPS reading reflects that:

- While you're orbiting/dragging/animating, samples are `continuous: true`
  and FPS is a real instantaneous frame rate.
- The moment nothing is invalidating the canvas, the last sample goes stale
  and the tab shows **"idle"** instead of a fake near-zero or stuck FPS
  number. This is expected — it does not mean rendering has stopped or that
  something is broken; there's simply nothing new to draw.

### Cost

Click **"Run cost breakdown"**. This drives its own `requestAnimationFrame` +
`invalidate()` loop (bypassing the demand scheduler) so it can force
continuous frames while it measures, then walks each effect: disable it,
measure average frame time, restore it, measure baseline, and record the
delta. Results are ranked by `deltaMs` (ms/frame the effect costs) with an
equivalent FPS-gain figure.

**Caveats:**

- **The viewport visibly flickers** while the sweep runs — each effect is
  really toggled off and on in the live scene, not simulated. This is
  expected; don't interrupt it by navigating away mid-sweep.
- The FPS guard (`QualityController`'s auto-downgrade-on-low-FPS logic) is
  suspended for the duration of the sweep via `benchmarkSignal`, because the
  sweep's synthetic quality overrides would otherwise look like a real
  performance drop and trigger an unwanted tier downgrade.
- Results are tier-relative: on **Performance** tier most optional effects
  are already off, so the ranking is dominated by whatever's left; raise the
  render tier to **High** (Graphics panel) first if you want to see
  post-processing/shadows show up meaningfully.

### Objects

Click **"Scan scene objects"** to walk the current scene graph and rank
furniture items by triangle count. Rows are clickable — clicking one calls
back into the main window's `selectItem` action, so you can jump straight to
the heaviest item in the outliner/inspector.

## Dev-only guarantee

The profiler is gated **twice**, at every wiring point, so it tree-shakes out
of a production build even if the flag resolution logic is ever wrong:

1. The `profiler` feature flag (`src/features/featureFlags.ts`) is
   `devOnly: true` and `tier: 'pro'` — forced off in any non-dev build and in
   Simple mode.
2. Every import site additionally checks `import.meta.env.DEV` before the
   dynamic `import()` that pulls in the profiler module graph
   (`src/App.tsx` for `installProfilerApi`, `src/ui/CommandPalette.tsx` for
   `openProfilerWindow`). Because both the flag check and the dynamic import
   are dead in a prod build, Vite/Rollup drop the entire `src/dev/profiler/`
   module graph from `dist/` — verified by grepping the built bundle for
   `installProfilerApi`/`profilerBridge`/`ProfilerApp` (task 10 verification;
   also worth re-checking after any change to the wiring).

## Cross-realm architecture note

The popup window is a **separate module realm** — importing `profilerBridge`
directly from inside `ProfilerApp.tsx` would get a different singleton
instance than the one the main window's Canvas is feeding. Instead, the main
window installs its live API on `window.__profiler`
(`installProfiler.ts`), and the popup reaches back across the window
boundary via `window.opener.__profiler`. See
`src/dev/profiler/CLAUDE.md` for this and other path-scoped rules.

## Related tests

The pure logic is unit-tested directly: `costBreakdown.test.ts`,
`objectBreakdown.test.ts`, `profilerBridge.test.ts`,
`benchmarkSignal.test.ts`, `profilerFlag.test.ts`. The live glue
(`profilerEngine.ts`, the probe, the detached window, and the React UI) is
verified by running the app per the steps above — it isn't practical to unit
test a real `requestAnimationFrame`/WebGL-driven sweep.
