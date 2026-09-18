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

Findings from the first run: `docs/audit/interaction-sweep-2026-09-18.md`.
