# P1 trace — attributing the walk-mode lights-on frame drop (review area 5 follow-up)

Date 2026-09-25 · branch `feat/photoreal-round7` · ships **v0.35.12.3** · dev server
`http://localhost:5200/` (`vite --port 5200 --strictPort`, this worktree) · default 4-room
Serangoon North Vista flat · one-off probe `scripts/dev-probes/perf-trace-oneoff.mjs`
(deleted after use, same convention as every other one-off census script in that directory) ·
raw captures under `/tmp/p1{,b,c}/` (`trace.json` ≈ 69 MB each, `summary.json`).

Closes the attribution half of **P1** in [`perf-2026-09-19.md`](./perf-2026-09-19.md) — "main
thread drops from 60 Hz to ~42 Hz for several seconds after the lights switch … needs a real
Chrome trace to attribute" — and lands two bounded fixes the trace supports.

## Method

One browser, one session, one arm — `desktop-metal` as `sweep/record.mjs` defines it
(1200×900, DPR 1, `--use-angle=metal`, device class **pinned** `capable` with `setDeviceClass`
replaced by a no-op after one call, the standing adaptive-ladder gotcha). Clock **pinned**
(`timeMode: 'manual'`, `manualHour: 21`) and read back before measuring; camera mode read back
as `firstPerson`; **explicit pose** `xz [11, 7.0], yaw 0.07, pitch 0` — the same pose the
sweep catalogue's `walk-lights-mid-walk` clip pins, set through `window.__walkLook`.

Three instruments run together:

- `raf` — `requestAnimationFrame` timestamp spacing (`p50/p90/p99/max` ms, plus the achieved
  `rafHz`). Under `frameloop="demand"` this is the tick cadence the browser actually delivers.
- `render` — a wrap around `gl.render` (CPU submit cost only; it returns before the GPU is done).
- `longtask` — a `PerformanceObserver` on `longtask`, i.e. main-thread tasks over 50 ms.
  **This is the number that matters here**: it counts what `render` structurally cannot see,
  the work that happens *beside* `gl.render` on the same thread.

Plus a CDP `Tracing` capture across the switch: `Tracing.start` with
`transferMode: 'ReportEvents'`, `recordMode: 'recordAsMuchAsPossible'` and the categories
`devtools.timeline`, `disabled-by-default-devtools.timeline{,.frame,.stack}`,
`disabled-by-default-v8.cpu_profiler`, `v8`, `v8.execute`, `blink.user_timing`, `toplevel`,
`gpu`, `viz`, `latency`. `ProfileChunk` `nodes`/`samples`/`timeDeltas` are reassembled into a
self-time flame profile; `nodes[].parent` (not `children`) gives the call chain.

## 1. The repro, measured (before)

| window | rafHz | raf p50/p90/p99/max ms | render p50/p90/p99/max ms | long tasks | long-task ms |
| --- | --- | --- | --- | --- | --- |
| lights **off** baseline (6 s) | **60.2** | 16.7/16.7/16.8/16.8 | 0/0.5/7.1/8.6 | 0 | 0 |
| lights **on**, across the switch (9 s) | 33.4 | 16.7/66.7/83.4/**716.6** | 0/0.5/7.4/726.3 | 81 | 6765 |
| lights **on**, steady state (8.5 s) | **33.5** | 16.7/66.7/83.4/83.4 | 0/0.6/8.2/10.1 | 72 | **5302** |

This is P1, reproduced and then some: the 2026-09-19 pass measured 42.3 Hz, this pass measures
33.5 Hz on the same arm at the same tier/hour/mode (the earlier pass sampled a kitchen-centre
pose, this one the sweep's living-room pose — more of the lit scene on screen). Two facts fix
the shape of the problem before any trace is read:

- `render` (CPU submit) stays at 8–10 ms throughout. The cost is **not** inside `gl.render`.
- **5302 ms of long tasks in an 8.5 s window** — 62 % of wall-clock time is spent in main-thread
  tasks over 50 ms. It is not a GC tail, not a settle transient, and not the switch itself: it is
  a steady state that persists for as long as the lights are on.

## 2. What the trace blames

Main thread (`CrRendererMain`), 9 s window around the switch: 2537 `RunTask`s totalling 8839 ms,
**79 of them over 16 ms summing to 6346 ms**. One task of 730 ms (the switch), one of 320 ms,
and then a *recurring* ~88 ms task at ~10 Hz. Expanding one of the recurring ones:

```
RunTask                                       85.3 ms
└ ProxyMain::BeginMainFrame                   85.3
  └ PageAnimator::serviceScriptedAnimations   85.2
    └ FireAnimationFrame / FunctionCall       85.1   (react-three-fiber loop)
      └ RasterImplementation::ReadbackImagePixels   76.1   ← 89 % of the task
        └ ImplementationBase::WaitForCmd            76.1
          └ CommandBufferProxyImpl::WaitForGetOffset 76.1
```

The V8 CPU profile over the same capture (10.27 s of samples) ranks self time:

| self ms | share | frame |
| --- | --- | --- |
| **4631** | **45.1 %** | `getImageData` |
| 1347 | 13.1 % | `(idle)` |
| **683** | **6.7 %** | `getProgramInfoLog` |
| 309 | 3.0 % | `tick @ src/ui/NavCluster.tsx:50` |
| 222 | 2.2 % | `three … updateMatrixWorld` |
| 214 | 2.1 % | `three … WebGLRenderer.renderBufferDirect` |
| …    | | (the rest is the ordinary three.js render path, none above 210 ms) |

The call chain for the `getImageData` node, read off `nodes[].parent`:

```
getImageData
 ← sampleCanvasTopHex @ src/scene/lighting/statusBarTint.ts:46
 ← updateStatusBarTint @ src/scene/lighting/statusBarTint.ts:116
 ← (anon) @ src/scene/lighting/Lighting.tsx:220        (the Lighting useFrame)
 ← react-three-fiber update/loop
```

### P1 is a synchronous GPU→CPU readback on the render thread

`statusBarTint.ts` keeps `<meta name="theme-color">` matching the top of the rendered frame so a
mobile address bar / iOS standalone status bar blends into the scene. It does that by
`drawImage(webglCanvas, …)` into a 1×1 scratch 2D canvas and `getImageData`. That pair is a
**pipeline sync**: Chrome must finish everything queued for the accelerated canvas and read it
back (`RasterImplementation::ReadbackImagePixels` → `WaitForGetOffset`). Its cost is therefore
**the depth of the GPU queue at the moment it runs, not the one pixel it returns**:

| lights | measured readback cost |
| --- | --- |
| off | ~0.2 ms (invisible — the 2026-09-19 pass, and the baseline row above, are clean at 60 Hz) |
| on (19 fixture point lights, `realistic`) | **~76 ms** |

The existing PERF-MAX-2 throttle caps the sampler at one readback per 100 ms. Ten readbacks a
second × 76 ms = **~760 ms of every wall-clock second**, which is precisely the 72 long tasks /
5302 ms per 8.5 s measured above, and precisely why `render` stayed in budget while `raf` did
not — the stall sits *beside* `gl.render`, in the same rAF callback. A rate limit is not a cost
limit when the cost is not constant.

This also explains P1's puzzling "phone is milder": the phone content set queues less GPU work,
so the same readback is cheaper there.

### Second finding: `getProgramInfoLog` is the z16/z17 stutter mechanism

683 ms (6.7 %) of the capture sits in `getProgramInfoLog`, the second-largest entry, concentrated
in the 730 ms and 320 ms tasks at the switch. three r184 links programs and then validates them
lazily in `WebGLProgram.js:onFirstUse`:

```js
gl.linkProgram( program );
function onFirstUse( self ) {
  if ( renderer.debug.checkShaderErrors ) {
    const programInfoLog = gl.getProgramInfoLog( program ) || '';   // ← blocking round-trip
    …
    if ( gl.getProgramParameter( program, gl.LINK_STATUS ) === false ) { … }
```

`getProgramInfoLog` / `getProgramParameter(LINK_STATUS)` are synchronous queries: they block the
main thread until the driver has finished linking. **This, not the compile itself, is what turns
a program burst into a visible stutter** — which is the standing z16 (lights toggle, +25/+31
programs) and z17 (first orbit↔walk switch, ~333 ms) finding. three's own `WebGLRenderer.debug`
documentation, verbatim: *"It may be useful to disable this check in production for performance
gain."*

## 3. Research consulted (2026-09-25)

Checked before touching code; exact signatures relied on:

- `WebGLRenderer.compile( scene : Object3D, camera : Camera, targetScene : Scene ) : Set.<Material>`
  and `WebGLRenderer.compileAsync( scene, camera, targetScene ) : Promise` —
  [three.js docs](https://threejs.org/docs/pages/WebGLRenderer.html). `compileAsync` "makes use of
  the `KHR_parallel_shader_compile` WebGL extension", returning a Promise that resolves "when the
  given scene can be rendered without unnecessary stalling due to shader compilation".
  **Not used here** — the trace does not blame compilation latency, it blames the *validation
  query*, and the previous `gl.compile()` pre-warm for z16 was already tried and reverted
  (Δ0 in orbit, unchanged in walk).
- `KHR_parallel_shader_compile` ([Khronos registry](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile)) — provides
  the non-blocking `COMPLETION_STATUS_KHR` poll so link status can be queried *without* incurring
  a stall. three uses it inside `compileAsync`; it does **not** change what `onFirstUse` does.
- Light counts are part of every three.js program cache key, so mounting/unmounting lights
  recompiles ([mrdoob/three.js#11341](https://github.com/mrdoob/three.js/issues/11341)); the
  community fix is to keep a constant light count and vary intensity instead. Recorded as an
  option for z16, **not** taken here (19 always-mounted point lights cost every fragment a BRDF
  even while off — the wrong trade for this app's default state).
- CDP `Tracing` domain + category set for a main-thread flame chart
  ([chromedevtools.github.io/devtools-protocol/tot/Tracing](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/)).

Verified in the tree, not assumed: `three@0.184.0`; `compileAsync` and
`debug.checkShaderErrors` both exist in the installed build
(`node_modules/three/src/renderers/WebGLRenderer.js:182`,
`node_modules/three/src/renderers/webgl/WebGLProgram.js:862`).

## 4. What changed

Two flags, both `default: true`, both `tier: 'simple'`.

**`statusBarTintBudget`** — `src/scene/lighting/statusBarTint.ts` (STATUS-TINT-READBACK):

1. *No readback where the tint paints nothing.* `<meta name="theme-color">` tints browser/OS
   chrome on mobile browsers and installed standalone PWAs only; desktop browsers render no such
   band. Gated on `(pointer: coarse) || (display-mode: standalone) || (display-mode: fullscreen)`,
   cached after the first query. Desktop now does **zero** canvas readbacks and takes the
   analytic eased sky colour instead (which is what the meta tag already fell back to before the
   first readable frame).
2. *A duty cycle, not a fixed rate.* Where the tint IS visible, the sampler measures its own
   cost and sets the next interval to `clamp(100 ms, cost × 50, 2000 ms)` — so the readback can
   never take more than ~2 % of wall time however deep the GPU queue gets. At the measured 76 ms
   that is one sample every 2 s instead of ten a second.

With the flag off, both bounds are skipped and the pre-fix path runs verbatim (the in-session
A/B control below).

**`skipShaderLinkChecks`** — `src/scene/RendererTierController.tsx` (SHADER-LINK-CHECK): sets
`gl.debug.checkShaderErrors = false`, removing the blocking link-status query on each program's
first draw. Kept as a runtime-flippable flag rather than a build-time constant so a developer
chasing a genuinely broken shader can turn the reporting back on in one click. A broken shader
still fails to render — it just no longer announces itself in the console.

## 5. After — same session, in-session flag-off control

Same browser, same pose, same pinned clock, lights already on; the flags are toggled live
through `setFeatureFlag` and each arm measured over 8.5 s. (No comparison against any stored
number from another run.)

| arm | rafHz | raf p50/p90/p99/max ms | render p50/p90/p99/max ms | long tasks | long-task ms |
| --- | --- | --- | --- | --- | --- |
| lights off (reference) | 60.2 | 16.7/16.7/16.8/16.8 | 0/0.5/7.6/9.4 | 0 | 0 |
| **flags OFF** (pre-fix path) | 34.1 | 16.7/66.7/83.4/83.4 | 0/0.6/8.8/11.8 | **71** | **5118** |
| **flags ON** (shipped) | **38.6** | **33.3/33.4/33.4/33.4** | 0/0.6/8.8/11.5 | **0** | **0** |

Across the switch itself (the 9 s trace window), flags OFF → ON:

| | flags OFF | flags ON |
| --- | --- | --- |
| worst rAF gap | **716.6 ms** | **283.3 ms** |
| long tasks / ms in the window | 81 / 6765 | **2 / 505** |
| main-thread `RunTask` > 16 ms | 79 (6346 ms) | **2** (327 + 212 ms) |
| `getImageData` self time | 4631 ms | **0** |
| `getProgramInfoLog` self time | 683 ms | **0** |
| main thread `(idle)` | 1347 ms (13 %) | **5565 ms (54 %)** |

**Headline: main-thread long-task time in steady state goes 5118 ms → 0 ms per 8.5 s window, and
the worst switch-frame gap is cut 2.5× (717 → 283 ms).** The main thread is now idle for 54 % of
the capture instead of 13 %.

Visual verification (walk mode, 21:00, lights on, `realistic`, same pose): lamp pools, the lit
pendant, the night estate through the window and every material render exactly as before —
screenshot reviewed, no black/unlit material, i.e. disabling link-error *reporting* has not
disabled any shader. `<meta name="theme-color">` still tracks the sky on the desktop arm (via
the analytic path).

## 6. What remains open

**The frame rate with the lights on is still 30 Hz, and it is now GPU-bound, not main-thread
bound.** Post-fix the main thread is idle 54 % of the time with two long tasks in nine seconds,
yet `raf` sits at a flat 33.4 ms — a clean every-other-vsync cadence, the signature of a frame
the GPU cannot finish in 16.7 ms. `render` (CPU submit) is 8.8 ms, so the submit is not the
limit either. The cause is the obvious one and is *not* a defect: 19 forward point lights on the
`realistic` tier cost every shaded fragment 19 extra BRDF evaluations. Options if this is worth
taking further — merging coincident emitters more aggressively (`mergeCoincidentLights` already
exists per tier), a light-count cap at `realistic`/walk, or clustered/deferred shading — are
architectural and are **not** decided here.

Two side observations, recorded but not chased:

- `gl.render` is called **~22 times per rAF tick** in this configuration (7314 wrapped calls over
  330 rAFs), each ~0 ms, with `gl.info.render.calls` reading 1 at rest — consistent with the
  post-processing chain running ~20 single-quad passes per frame. If the residual GPU cost above
  is worth attacking, that pass count is the first place to look.
- The console emits `GL Driver Message … GPU stall due to ReadPixels` during boot (the
  `backdrop-warmup` path), unrelated to the sampler fixed here.

**Method gap, stated rather than glossed:** a DPR A/B (halve the drawing buffer with the lights
on, to test whether the residual is fill-bound) was attempted and is **void** — r3f re-applies the
Canvas `dpr` prop, so `gl.setPixelRatio(0.5)` was stomped back to 1 and `gl.getPixelRatio()` read
1 in every sample. No conclusion about fill rate should be drawn from those two rows in
`/tmp/p1c/summary.json`. A valid version would have to drive the store's own DPR path.

**z16 / z17 are not closed by this.** The program *counts* are unchanged (+26 on the toggle in
this session's capture); what is removed is the blocking validation query that made the burst
visible. Both remain maintainer calls in
[`docs/open-graphics-decisions.md`](../open-graphics-decisions.md).
