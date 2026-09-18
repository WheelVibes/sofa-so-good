# Interaction sweep — recorded clips + automated triage

A recording harness that drives the app with **real input** (mouse, wheel, keyboard,
CDP touch points) through a catalogue of realistic and adversarial gestures, captures
every rendered frame via CDP `Page.startScreencast`, and flags candidate visual defects
for a human to look at — a *shortlisting* tool: it decides which frames are worth your
eyes, not whether a frame is wrong.

## Run it

```
npx vite --port 5200 --strictPort &          # the harness targets :5200 (SWEEP_URL overrides)

node scripts/dev-probes/sweep/record.mjs --catalogue scripts/scenarios/sweep/orbit.json \
  --arm desktop-metal --out /tmp/sweep/desktop-metal
node scripts/dev-probes/sweep/record.mjs --catalogue scripts/scenarios/sweep/walk.json \
  --arm desktop-metal --out /tmp/sweep/desktop-metal
node scripts/dev-probes/sweep/analyse.mjs --in /tmp/sweep/desktop-metal
```

Arms (`--arm`): `desktop-metal` (1200x900, DPR 1, mouse, deviceClass `capable`),
`phone-metal` (390x844, `deviceScaleFactor: 3`, touch, `weak`), `desktop-swiftshader`
(same as desktop but software WebGL — **structural checks only**, motion feel is
meaningless there). `--only a,b,c` selects clips; `scripts/scenarios/sweep/reduced-swiftshader.json`
lists the 10-clip software subset. Runs are **sequential** — one browser at a time.

Setup per run: `hdb_onboarded` seeded, prompts dismissed, tier `realistic`, **device class
pinned** (setter replaced with a no-op, per the adaptive-ladder gotcha in
`visual-verification-playbook.md`), `interactiveDegrade` left **ON** — seeing the DPR
toggle act is part of the point.

**The clock is now pinned per clip (SWEEP-CLOCK-PIN).** `applyPose` calls
`setTimeMode('manual')` + `setManualHour(clip.hour ?? 12)` and reads both back — a clip
whose own `setup` ops set the hour again (a dawn/lights-on clip) wins, last write. Before
this, `timeMode` stayed `'system'` for the whole sweep: every clip rendered at the
wall-clock hour while `clip.json` claimed a fixed one it never enforced, so an
absolute-brightness comparison across two recording SESSIONS (not within one) is suspect
for anything recorded before this line existed. `clip.json.timeMode`/`manualHour` record
what actually applied.

## Clip catalogue

`scripts/scenarios/sweep/{orbit,walk}.json`. A clip is
`{ name, mode, arms?, pose?, setup?, ops[], tailMs? }`. `pose` is the ONLY place camera
state is written directly (`__three.controls` / `window.__walkLook`); everything in `ops`
is real input. Ops: `drag` (`button`, `hold`, `ease`),
`mouseUp`, `mouseMove`, `click`, `clickSelector`, `wheel`, `key`/`keys` (held for `ms`),
`press`, `tap`, `doubleTap`, `touchDrag`, `pinch`, `twoFingerRotate`, `twoFingerDrag`,
`viewport`, `store`, `ramp`, `eval`, `wait`, `wheelTicks` (per-tick timestamps) and `parallel`
(runs sub-ops truly concurrently — a held key *while* the store changes, a held drag *while* the
hour ramps). Every clip starts only once `sceneReady && !loading.active && !#boot-loader` plus a
settle window (`settleMs`, default 1200 ms); the wait is recorded as `clipWaitMs`, never as frames.

## Outputs

Per clip, under `<out>/<clip>/`:

| file | what |
| --- | --- |
| `0000.png…` | every screencast frame (PNG, `everyNthFrame: 1`; ~50 fps, ~330 MB per 5 s clip) |
| `clip.json` | frame index↔timestamp map, `bootWaitMs`/`clipWaitMs`, an `opLog` of every op's start/end, and a 100 ms sample series: `gl.getPixelRatio()`, `gl.info.render.frame`, `renderer.info.programs.length`, rAF deltas as `[t, dt, glFrame]`, `cameraMode`, tier/device class/lights/hour, camera position + orbit target, walk yaw/pitch, console `error`/`warning` |
| `clip.webm` | 12 fps VP9 assembly — only when `ffmpeg` is on PATH (never installed by the harness) |
| `metrics.json` | per-frame mean luma, mean-abs-diff to the previous frame, near-black (<8) / near-white (>247) fractions, a diagonal-region edge-stepping score, worst 64 px-equivalent tile delta |
| `events.json` | flagged events (below) |
| `sheet.png` | contact sheet, 8 columns, frame index + event tags burned in |
| `worst/<TYPE>-<frame>.png` | triptych: frame before / flagged frame / frame after (capped at 6 per type per clip) |

`<out>/events-summary.json` aggregates the per-clip counts for the arm.

`--wall-trace` adds `clip.json.wallTrace` — `[rAF t, gl frame, { wallId: opacity }]` per RENDERED
frame, read from the DEV-only `window.__wallOpacities()` (`apartment/walls/wallReveal.ts`). The
100 ms sampler is far too coarse to tell a one-frame reveal flip from a smooth ease; this is what
refuted finding S3's stated mechanism. Off by default (it is a page `evaluate` per frame).

**`clip.json.poses` (SWEEP-POP-GATE, always on, cheap).** A per-rAF `[relMs, glFrame, x, y, z,
yaw|null]` series — position always, yaw/azimuth when the mode exposes one (`__walkLook.getYaw()`
in walk, `controls.getAzimuthalAngle()` in orbit). `relMs` is on the SAME clip-relative axis as
`frames[].relMs` (both Node-side `Date.now()` anchors — no cross-clock conversion needed, unlike
the rAF-argument `t`, which is page-side `performance.now()`). Reuses the already-running rAF tick
(the same loop `--wall-trace` hooks), so it costs one position read + one trig call per frame. A
clip recorded before this existed has no `poses` field; `analyse.mjs` falls back to the legacy
gate automatically for it (logged once per clip).

`--mask-selectors "sel1,sel2"` (optional, **default off**) excludes DOM callouts — the
"Walking through" onboarding card, the Measure pill, any fixed-position overlay sitting ON TOP
of the canvas — from `analyse.mjs`'s crop metrics. `record.mjs` captures each matched element's
`getBoundingClientRect()` once per clip (after settling, in device px) into `clip.json.maskRects`;
a catalogue clip can add its own via `maskSelectors: [...]`, unioned with the CLI flag.
`analyse.mjs` rescales those rects into its analysis width and excludes them from whole-frame
luma/black/white/diff and from the POP tile scan — a clip with no `maskRects` (the default, and
every clip recorded before this existed) is unaffected.

## Events and how to read them

`BLACK_FRAME` (>60 % near-black when the previous frame was <20 %) · `FLASH`
(whole-frame mean jumps >25 counts) · `POP` (a tile changes >40 counts while the camera
moved <0.35 m/s and <0.25 rad/s) · `STUTTER` (rAF delta >120 ms) · `DPR_TOGGLE`
(`getPixelRatio()` changed) · `RECOMPILE` (`programs.length` grew) · `GL_ERROR`
(console error/warning during the clip).

**Expected, not defects:** `DPR_TOGGLE` on every gesture (that IS `interactiveDegrade`,
GPU-STARVE-1); `RECOMPILE` on a lights toggle (known item z16); `FLASH` during the
`setManualHour` ramp and the lights clips; `STUTTER` on the first frames after a tier
change or a viewport swap. Screencast delivery itself drops frames under load, so a
single large `diff` with no event is usually a dropped frame, not a pop. Always confirm
a candidate on the triptych before writing it up.

**POP's camera-speed gate (SWEEP-POP-GATE).** "The camera moved <0.35 m/s and <0.25 rad/s" above
now reads `clip.poses` (per-rAF) through a `POP_POSE_WINDOW_MS`-wide (50ms) centred window
(`scripts/dev-probes/sweep/popGate.mjs:motionAtPoses`), not the 100ms `clip.samples` series
(`motionAt`, kept as the LEGACY gate). The 100ms sampler is an INDEPENDENT timer, not
synchronised to the camera's own motion, so two samples 100ms apart can straddle an entire
swing-and-return and read near-zero net speed even though the camera moved fast for the whole
window — measured up to 59deg/100ms in `orbit-reversals` — aliasing a real motion-driven content
change into a false POP. A bare adjacent-pose bracket (no window) overcorrects: CDP's dispatched
pointer-move lands a real delta only every `stepMs` (~12ms), so ONE rAF tick between two
dispatches can read near-zero even mid-drag at several m/s — measured directly, 0.32 m/s on a
16ms bracket at a point a 101ms legacy bracket read 5.0 m/s. The 50ms centred window is the
documented middle ground: far finer than the phase-independent 100ms sampler, wide enough to
smooth that single-tick input-dispatch noise. `--legacy-pop-gate` (analyse.mjs) forces the old
samples-based gate for an A/B on identical recorded frames, and is also the automatic fallback for
a clip recorded before `clip.poses` existed. `scripts/dev-probes/sweep/popGate.test.mjs`
unit-tests the aliasing case directly (a synthetic swing-and-return the legacy gate reads as
"still" and the windowed gate does not) alongside the input-quantisation and genuinely-still
cases. Re-recorded (fresh, since the archived `final2` clips predate `clip.poses`) and analysed
both ways on identical frames: `orbit-reversals` (desktop-metal, 120 frames) POP 1 -> 1 on this
run (the fresh recording's reversal didn't happen to alias this time; the unit test is the
controlled proof of the mechanism); `walk-phone-into-wall-slide` (phone-metal, 310 frames) POP
136 -> 155 — consistent with the audit's own N5 finding that this clip's POPs are genuine
lit-window parallax at a walking speed near the 0.35 m/s threshold, not a gate artefact, so a
modest count MOVE near that boundary is expected and the fan-driven POPs elsewhere are untouched
(the change only rewrites the camera-speed ESTIMATE; tile-delta computation and thresholds are
unchanged, so a genuinely-stationary-camera pop scores identically either way).

**A `waitFor` step needs a bounded, realistic timeout — it is a deadline, not a promise of
progress.** `scripts/lib/interact.mjs:waitForCondition` polls until `step.timeout` (default
15000ms) elapses, then throws; it does not hang forever, but a step that waits on a predicate
which never flips (a typo'd store path, a feature permanently gated off, a genuinely-missing
readiness signal) reads as "the harness is stuck" for the whole timeout window. Size the timeout
to the SLOWEST expected real case (this repo's own boot can take >20s on a cold Vite dev-server
compile — see AO-DIR-FALLBACK below, which measured 25-26s baseline `sceneReady`), not to the
common case, and give the step a `failMessage` that names the predicate so a genuine stall is
diagnosable from the harness's own error rather than a bare "timed out".

**AO-DIR-FALLBACK: `?aoDir=<nonexistent>` was suspected of hanging `shot.mjs`; reproduced
directly and found NOT to.** `SHOT_URL='http://localhost:5200/?aoDir=nope'` against a `waitFor
{store: "state.sceneReady === true"}` step (60000ms timeout) resolved in ~26s — byte-for-byte the
SAME as a control run with no `aoDir` param at all — with zero page errors either way.
`VisibilityLightmaps.tsx`'s alternate-set fetch (now extracted to `scene/lightmapIndex.ts:
fetchLightmapIndex`) already wrapped both the `fetch()` and the `res.json()` call in one
try/catch, so the dev server's SPA fallback (an unmatched `/assets/<dir>/index.json` still
returns 200 `text/html` — `index.html` — so `res.ok` is true and `res.json()` REJECTS on the HTML
body) was already caught and degraded silently, exactly as the feature is documented to. A real
404 (`!res.ok`) and a hard network failure both take the same `null` return. `sceneReady`
(`scene/Scene.tsx:SceneReadySignal`) is driven only by a frame counter + drei's global
`useProgress().active`, and a failed index fetch never calls `TextureLoader.load()` at all (that
only happens after a successful parse), so it was never in a position to leave anything
registered with drei's progress tracker either. `fetchLightmapIndex` is unit-tested
(`scene/lightmapIndex.test.ts`) against the SPA-fallback shape, a real 404, a network failure and
a malformed-but-valid-JSON body, locking this in against a future refactor reintroducing a throw
or a dangling rejection on the same seam.

Findings from the first run: `docs/audit/interaction-sweep-2026-09-18.md`.
