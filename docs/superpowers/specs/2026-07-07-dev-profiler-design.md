# Sofa Profiler — design

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan
**Scope:** A dev-only, detached-window performance profiler for the 3D app.

## Goal

Give a developer a Chrome-DevTools-style **separate window** that profiles the
running app and shows which graphic-heavy features are causing lag. Two modes,
combined:

1. **Live metrics dashboard** — real-time FPS, frame time, draw calls,
   triangles, geometries/textures in GPU memory, JS heap, active lights, and the
   current render tier, updating continuously.
2. **On-demand cost breakdown** — both:
   - an **effect-cost sweep** that toggles each render effect off, measures the
     frame-time gain, restores it, and ranks the effects by cost; and
   - a **per-object GPU breakdown** that ranks placed furniture items by
     triangles / mesh count / draw calls.

## Constraints & gating

- **Dev-only. Only `npm run dev` may spin it up.** Enforced two ways:
  - Feature flag `profiler` in `FEATURE_FLAGS` (`src/features/featureFlags.ts`):
    `{ default: false, devOnly: true, tier: 'pro' }`. `devOnly` forces it off in
    production via `resolveFlags`; `tier: 'pro'` hides it in Simple mode.
  - Every wiring point (probe mount, command registration, window opener) is
    wrapped in `import.meta.env.DEV`, so the whole `src/dev/profiler/` subtree
    tree-shakes out of any production/Docker/desktop build. There is literally
    nothing to open in prod.
- **Detached OS window** via `window.open` — keeps the 3D viewport unobstructed
  (the DevTools "undocked" model). Desktop-only by nature; that's fine for a dev
  tool.
- **No hardcoded colour** — the detached UI uses only the existing CSS token
  class vocabulary (`.panel`/`.btn`/`.toolbar`/…) so it renders in every theme.
- New code lives under `src/dev/profiler/` with its own path-scoped `CLAUDE.md`.

## Architecture — five units

### 1. `profilerBridge.ts` — the cross-window bridge (main window)
A dev-only singleton exposed as `window.__profiler` (under `import.meta.env.DEV`).
Holds references to the live `WebGLRenderer` (`gl`) and `Scene`, a fixed-size
metrics ring buffer, and a pub/sub. This is the only channel the detached window
uses; the child reads it via `window.opener.__profiler` (same origin).

Interface:
- `register(gl: WebGLRenderer, scene: Scene): void` — called by the probe.
- `pushSample(sample: MetricsSample): void` — called by the probe each sampled frame.
- `subscribe(cb: (snapshot: MetricsSnapshot) => void): () => void` — UI subscribes;
  returns an unsubscribe fn. Emits at ~10 Hz (throttled), not every frame.
- `getSnapshot(): MetricsSnapshot` — latest values + short history for the sparkline.
- `runCostBreakdown(onProgress): Promise<EffectCost[]>` — the effect sweep (§3).
- `getObjectBreakdown(): ObjectCost[]` — per-object scan (§4).

### 2. `ProfilerProbe.tsx` — in-scene sampler
A tiny component mounted inside the R3F `<Canvas>`, gated on
`import.meta.env.DEV && useFeature('profiler')`. On mount it grabs `gl`/`scene`
via `useThree()` and calls `bridge.register`. In `useFrame` it samples:
- FPS + frame time (rolling average from per-frame `delta`),
- `gl.info.render` — draw calls, triangles, lines, points,
- `gl.info.memory` — geometries, textures,
- `performance.memory.usedJSHeapSize` (Chromium only; `null` elsewhere),
- active fixture-light count (from store/scene).

R3F auto-resets `gl.info` each frame, so the probe reads the accumulated values
at the point its `useFrame` runs (representing the frame just rendered) and pushes
a `MetricsSample` into the bridge. Renders nothing.

### 3. `openProfilerWindow.ts` — detached window host
`window.open('', 'sofa-profiler', 'width=460,height=720')`. Then:
- Clone the parent's `<style>` and `<link rel="stylesheet">` tags from
  `document.head` into the child document head (so CSS tokens + theme classes
  resolve). **Known limitation:** cloned styles do not hot-reload in the child —
  editing profiler CSS requires reopening the window. Acceptable for a dev tool.
- Copy the theme attribute/class from the parent `<html>` onto the child `<html>`.
- Create a root div and mount `createRoot(div).render(<ProfilerApp />)`.
- Wire cleanup: child `beforeunload` → unmount the root; parent `beforeunload` →
  `close()` the child so it never orphans.

### 4. `ProfilerApp.tsx` — the detached UI
Subscribes to `window.opener.__profiler`. Three tabs, token-styled:
- **Live** — FPS + frame-time sparkline, draw calls, triangles, geometries,
  textures, JS heap, active lights, current render tier. ~10 Hz.
- **Cost** — a "Run" button → progress bar → a ranked bar list, e.g.
  "Post-processing: −6.2 ms/frame (+18 fps)". Explicit that running it briefly
  flickers the main viewport as effects toggle.
- **Objects** — a "Scan" button → per-item triangle/mesh/draw-call ranking;
  clicking an item selects it in the main window (via `window.opener.__store`).

### 5. Entry point (dev-only)
- A ⌘K command "Open Profiler", registered only under `import.meta.env.DEV`,
  present in `COMMAND_FLAGS` mapped to the `profiler` flag.
- A keyboard shortcut to open it.
- No production toolbar/menu surface.

## Cost breakdown methodology (§3 engine — `costBreakdown.ts`)

Runs in the main window (owned by the bridge), triggered from the detached UI.
For each render effect in a defined list, sequentially:

1. Measure baseline average frame time over ~60 frames.
2. Apply a quality **override** that disables just that effect, via the store's
   existing quality-override setter in `uiSlice` (composes with the real render
   pipeline — not a fake).
3. Wait ~30 frames to settle.
4. Measure average frame time over ~60 frames.
5. Restore the override.
6. Record delta = baseline_ms − disabled_ms (the effect's per-frame cost).

Effects swept: sun shadows (`shadowMapSize → 0`), IBL, post-processing, contact
shadows, corner AO, DoF, fixture lights (`maxFixtureLights → 0`), geometry detail
(→ low), DPR (→ 1). Results ranked by ms/frame saved. Timing driven by `rAF`;
yields between steps so the UI stays responsive.

## Per-object GPU cost (§4 engine — `objectBreakdown.ts`)

Traverse the live `Scene`; for each mesh, walk up ancestors to find
`userData.itemId`, and group by item. Per item: sum triangles (from geometry
index / position count), count meshes (≈ draw calls), count unique
materials/textures. Rank heaviest-first; resolve the item id → def display name
from the store.

**Prerequisite:** the furniture item's root `Object3D` must carry
`userData.itemId`. Verify it exists in the item renderer; if not, add a single
assignment there.

## Testing

- **Unit tests** (Vitest, node env unless DOM needed):
  - Cost-breakdown ranking with an injected fake sampler/timer (deterministic
    frame times → assert ordering + deltas).
  - Object-breakdown traversal over a synthetic three.js scene (assert grouping,
    triangle sums, ranking).
  - Bridge pub/sub (subscribe/emit/unsubscribe, ring-buffer bounds).
- **Flag tested in BOTH modes** (`resolveFlags(..., 'simple')` vs `'pro'`, and
  prod vs dev): hidden in Simple and in prod; present in Pro + dev.

## Docs & versioning

- New `docs/developer/profiler.md` (what it is, how to open, how to read it).
- ARCHITECTURE.md: a dev-tooling entry pointing to it.
- `src/dev/profiler/CLAUDE.md`: path-scoped rules for the subtree.
- Bump `build` in `src/version.ts` + mirror `package.json`; CHANGELOG entry.

## Trade-offs accepted

- Cloned popup styles don't hot-reload (reopen window to pick up CSS edits).
- The cost sweep visibly flickers the viewport for ~10–15s while it toggles
  effects — inherent to measuring real cost; gated behind an explicit "Run".
- Detached window is desktop-only (popups are awkward/blocked on mobile) — fine
  for a dev diagnostic.
