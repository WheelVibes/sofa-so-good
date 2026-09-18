# Interaction sweep — first triage (2026-09-18)

Recorded with `scripts/dev-probes/sweep/record.mjs` + `analyse.mjs` (harness and output format:
[`docs/interaction-sweep.md`](../interaction-sweep.md)) against the default 4-room Serangoon North
Vista flat on `feat/photoreal-adaptive-fallback` @ `fe284e00`, dev server `:5200`, tier
`realistic`, device class pinned, `interactiveDegrade` **on**, hour 12 unless a clip ramps it.

Evidence lives under `/tmp/sweep/<arm>/<clip>/` (frames, `clip.json`, `metrics.json`,
`events.json`, `sheet.png`, `worst/*.png`, `clip.webm`). It is **not committed** — ~30 GB of PNG.
Re-run the two commands in `docs/interaction-sweep.md` to regenerate it.

## Run matrix

| arm | renderer | viewport | input | clips | frames |
| --- | --- | --- | --- | --- | --- |
| `desktop-metal` | `ANGLE (Apple, ANGLE Metal Renderer: Apple M4)` | 1200×900 DPR 1 | mouse + wheel + keys | 23 | 5 008 |
| `phone-metal` (re-run) | same | 390×844 `deviceScaleFactor: 3`, touch | CDP touch points (1 + 2 finger) | 15 + 1 | 4 194 |
| `desktop-swiftshader` | `ANGLE (Google, Vulkan 1.3.0 SwiftShader)` | 1200×900 DPR 1 | mouse + keys | 4 of 10 planned | 378 |

`webm` clips exist for every clip (ffmpeg found on PATH; VP9, 12 fps).

**The SwiftShader arm is short.** Software rendering this scene at 1200×900 delivers **~1 screencast
frame per second** (a "3 s" clip takes 55–70 s of wall clock), and `orbit-pitch-limits` — which ends
up *inside* the flat, the most expensive view there is — did not finish in 25 minutes. The arm was
stopped after 4 clips. Software frames are for structural checks only, so this costs the sweep
nothing it was relying on; it does mean the 10-clip software subset in
`scripts/scenarios/sweep/reduced-swiftshader.json` is aspirational until someone gives it an hour.

### Event counts per arm

| arm | DPR_TOGGLE | FLASH | RECOMPILE | POP | STUTTER | BLACK_FRAME | GL_ERROR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `desktop-metal` | 20 | 26 | 9 | 43 | 5 | 0 | 0 |
| `phone-metal` (re-run) | 4 | 10 | 3 | 232 | 2 | 0 | 0 |
| `phone-metal` (first pass) | 3 | 11 | 4 | 245 | 3 | 0 | 0 |
| `desktop-swiftshader` | 1 | 3 | 3 | 34 | **257** | 0 | 0 |

SwiftShader's 257 STUTTERs are the renderer, not the app — at ~1 fps every rAF delta clears 120 ms.
The two phone passes agree to within a couple of events per type, which is its own small result: the
`REVEAL-EASE-ATTACHMENTS` change did not move any counter the sweep measures.

**Zero `GL_ERROR` and zero `BLACK_FRAME` in ~9 600 frames across three arms** — no `glBlitFramebuffer`
complaints, no lost context, no all-black frame reproduced (cf. z22, which the sweep therefore does
not advance).

## Code state during the recording — read this before comparing arms

A second agent's uncommitted `REVEAL-EASE-ATTACHMENTS` change (`src/apartment/Door|Window|Skirting|
Roof|PlanShell|PlanRoomShell|PlanDoorLeaf|fittings|Thresholds`) landed in the working tree, live in
the dev server, **while the sweep was running**:

- `desktop-metal` — recorded 16:17:08–16:21:53, i.e. **entirely before** the first edit (16:22:05).
  This arm is HEAD.
- `phone-metal` — the first pass straddled the edits, so the whole arm was **re-recorded** after
  they settled (`/tmp/sweep/phone-metal-rerun`, all 15 clips). Both passes are kept; the numbers
  in this document are the re-run.
- `desktop-swiftshader` — recorded entirely after the edits.

So the phone and software arms show **eased** door/skirting/window/plan-shell reveal fades, the
desktop arm shows HEAD's instantaneous ones. No clip shows a Vite full reload: `gl.info.render.frame`
is monotonic in every `clip.json` of every arm (a Canvas remount would zero it), and the only two
`programs.length` decreases are ordinary three.js disposals on a tier change. HMR *module* updates
leave no such trace, which is why the phone arm was re-recorded rather than argued about.

## ⚠️ EVERY WALK CLIP IN THIS SWEEP WAS RECORDED WITH THE ESTATE NOT MOUNTED (found 2026-09-18, fixed v0.35.6.0)

Read this before quoting any walk-clip number below.

`record.mjs`'s `applyPose` called `s.setCameraMode(clip.mode)`, and a walk clip's `mode` is the
string **`'walk'`**. The store's `CameraMode` is `'orbit' | 'firstPerson'` — **there is no
`'walk'`**. `scene/cameras/CameraRig.tsx` reads `mode === 'orbit' ? <OrbitCamera/> :
<FirstPersonCamera/>`, so the invalid value still produced a walking first-person camera and every
arm looked exactly as intended. What it silently turned off is everything that gates POSITIVELY on
`cameraMode === 'firstPerson'`:

- **`scene/estate/Estate.tsx`'s mount condition** is `firstPerson || orbit`, so the **entire HDB
  estate — neighbour blocks, ground, roads, trees, the own block's wings — was absent from every
  walk frame in all three arms**, ~9 200 frames.
- **`exteriorDayBoost`'s `inside`**, so the window blowout ran at `EXTERIOR_DAY_BOOST` 1.1 rather
  than the calibrated blown 8. The blowout the sweep set out to look at never applied.
- `state/editing.ts:isWalkMode` and every other `=== 'firstPerson'` consumer.

Verified from the artefacts, not inferred: `walk-kitchen-to-yard-door/clip.json`'s last sample is
`pos [4.905, 1.6, 8.0], yaw 1.5708` — standing in the service yard at the west half-wall looking
west, where the own block's `westWing` (x ∈ [−30, 0] × z ∈ [0, 9.375], full height) is a solid
facade 4.9 m dead ahead. Frame `0320.png` is a smooth 150–195-count blue→pink gradient with no
edge anywhere in the left two thirds: the sky dome, through geometry that should have been opaque.

**Fixed two ways in v0.35.6.0**, because a type could not have caught it (the caller was
`page.evaluate`'d JavaScript):

- `state/slices/cameraSlice.ts:setCameraMode` now rejects anything outside `CAMERA_MODES` with a
  `console.error` and **no state change** (unit-tested, including the literal `'walk'` case).
- `record.mjs` maps `walk → firstPerson` and then **reads `cameraMode` back**, failing the clip if
  it does not match.

### Consequences for the findings below

| id | status |
| --- | --- |
| S1 | **Evidence invalid; re-recorded, and the defect is REAL but SMALLER than reported.** The uniform white field was the sky dome through glass with NO estate behind it and the blowout at 1.1, not the blown 8. Re-recorded on the fixed harness: the estate is fully legible at every frame, and the residual defect is a *clipping* one — over the aperture the neighbour facade sits at 231 counts with **20–31 % of its pixels ≥240**, so the window grid clips away. ✅ **FIXED v0.35.6.0 (WINDOW-EXPOSURE)**, numbers below. |
| S4 | **Root-caused: this was the bug.** The yard opened onto nothing because `Estate` never mounted. With the harness fixed the yard sees the estate — but the own block's wing then stood as a blank blown slab 4.9 m dead ahead (centre region **79.7 % ≥240, sd 16.6**). ✅ **FIXED v0.35.6.0 (YARD-ESTATE)**: the service light well takes that to **62.6 % / sd 32.6** and puts a neighbour block, the road and trees through the opening. |
| S6 | **Needs re-evaluation.** The desktop/phone DPR-toggle asymmetry was counted over walk clips rendering a materially cheaper scene (no estate geometry, no estate materials, no lit-window emissive), so the long-frame half of GPU-STARVE-1's degrade had less to trip on. The gesture half is unaffected. |
| S2, S3, S5, S9 | **Unaffected** — orbit clips, where `cameraMode` was set to the valid `'orbit'`. |
| S7 | **Unaffected** — a source-level finding about `cameraMotionSignal` wiring, not about a recorded frame. |
| S8 ⚠️ | **Numbers inflated; needs re-evaluation.** Its inline `eval` flipped to the same invalid `'walk'` (`scripts/scenarios/sweep/walk.json`, fixed to `'firstPerson'` in v0.35.6.0), so the switch it timed **unmounted and rebuilt the whole estate** — which a real orbit↔walk switch does not do, since `Estate` mounts in both modes. The 4 FLASH / 2 RECOMPILE / 2 STUTTER per switch therefore include an estate teardown that is not in the user's path. The defect (the gesture is not cancelled, it retargets) still stands. |

The full sweep is **not** being re-run here — only the clips a fix is claimed against. A complete
re-record on the fixed harness is scheduled as a separate final pass.

### Re-recorded on the fixed harness (v0.35.6.0)

Baselines are the **fixed harness with both new flags OFF**, so the harness fix is not credited to
the fixes. Flag state is forced at boot with `?ff=` (`SWEEP_URL`), never `setFeatureFlag`, so no
post-boot race can contaminate an arm. Runs under `/tmp/sweep/s6-{off,on}-{desktop,phone,sw}`.

**S1 — `walk-into-wall-slide`, aperture crop (the central pane's facade band, 400×220 px), not the
whole frame.** The harness's own `white` metric is a >247 fraction over the ENTIRE 1200×900 frame
including UI and dark interior; it reads 0.4 % in both arms and cannot see this at all. Read the
aperture.

| arm | frame | facade mean | p95 | **≥240** | sd |
| --- | --- | --- | --- | --- | --- |
| desktop Metal, OFF | 294 (closest) | 230.4 | 242.9 | **30.7 %** | 15.2 |
| desktop Metal, ON | 294 (closest) | **212.2** | 230.9 | **0.32 %** | **20.4** |
| desktop Metal, OFF | 200 | 231.7 | 241.9 | 20.2 % | 11.5 |
| desktop Metal, ON | 200 | 212.9 | 228.9 | 0.26 % | 16.0 |
| phone Metal, OFF | 300 | 226.4 | 240.9 | 12.2 % | 17.9 |
| phone Metal, ON | 300 | **207.0** | 227.9 | **0.26 %** | 21.6 |
| SwiftShader, OFF | 15 (last) | 232.8 | 241.9 | 31.6 % | 11.1 |
| SwiftShader, ON | 13 (last) | **219.0** | 235.1 | **2.7 %** | 13.2 |

The facade lands **212–219 counts**, inside the 200–230 the fix was asked for, with near-white
essentially gone (target was ≤60 %) and per-pixel contrast **up 39 %** on desktop (11.5 → 16.0) —
that rise IS the window grid resolving instead of clipping. SwiftShader's 2.7 % residual is the
0.3 s ease against a ~1.7 fps renderer, not a different verdict. **No pop**: sampled every 5th
frame through the approach, the largest step in facade mean is 8 counts over ~90 ms, and most of
that is the crop's own content changing as the camera walks.

**S4 — `walk-kitchen-to-yard-door`, the 350×360 px region the wing put dead ahead of the yard.**

| arm | mean | p05 | **≥240** | sd |
| --- | --- | --- | --- | --- |
| desktop Metal, OFF | 239.5 | 204.1 | **79.7 %** | 16.6 |
| desktop Metal, ON | 225.3 | 150.4 | **62.6 %** | **32.6** |

The `sd` doubling is the point: OFF is a flat blown slab, ON is a view. The after frame
(`/tmp/sweep/s6-on-desktop/walk-kitchen-to-yard-door/0300.png`) shows a neighbour block with its
facade grid, the access road with lane markings, trees and grass through the opening; the OFF
frame at the same index is a featureless white rectangle. **Honest residual:** the wing surfaces
still in frame remain at the blown boost, because the adaptive ramp is glazing-driven and the yard
has no glazing — 62.6 % is an improvement, not a clean result.

**Draw calls at the yard pose** (`(4.905, 8.0)`, yaw 1.5708, walk, realistic/capable, forced
`gl.render` after an `info.reset()`): **366 → 390 (+24, +6.6 %)**, `own-*` estate meshes **10 → 14**
(the +4 the split predicts), triangles 61 260 → 61 308.

**Byte-identity at the calibrated poses** — `scripts/scenarios/lightmap-night-floor-verify.json`
arm A, `SHOT_GPU=1` Metal, 390×844 touch, against `/tmp/photoreal-mobile/ab3/gpu/`:
kitchen **mean |Δ| 0.0026** (one stray pixel), living **0.8564 whole-frame / 0.0784 excluding the
ceiling fan**, against the < 0.5 bar. The diff heat map is the five fan blades and nothing else —
every flat surface is bit-clean. Coverage at that pose is 0.1175, below the 0.30 ramp start, so
the exposure scale is literally 1.

## Findings

| id | clip | arm | frames | symptom | evidence | probable subsystem | sev | known? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 ⚠️ | `walk-into-wall-slide` / `walk-phone-into-wall-slide` | desktop + phone Metal | 32–168 / 1–388 | Walking up to the living-dining window fills the entire frame with a uniform near-255 white field — no exterior, no sky gradient, no highlight rolloff; only the mullion grid reads. | `walk-into-wall-slide/sheet.png`, `phone…/worst/POP-3.png` | window glazing material + exterior/backdrop (`src/apartment/Window.tsx`, `src/materials/…windowGlassPhysical`, backdrop dome) | **high** | **EVIDENCE INVALID before the harness fix — estate unmounted.** Partially addressed v0.35.6.0 (WINDOW-EXPOSURE); re-record required |
| S2 | `orbit-tier-change-mid-drag` | desktop Metal | 47–92 | Changing the quality tier while a rotate gesture is held replaces the whole viewport with the boot splash ("Sofa So Good / Applying Realistic quality…") twice, ~2 s each, with rAF stalls of **2 167 ms** and **983 ms** and +23 / +15 program compiles. | `orbit-tier-change-mid-drag/worst/FLASH-78.png`, `STUTTER-52.png` | tier-change remount path (`src/state/slices/uiSlice.ts:534` `setQualityTier` → Canvas/Effects remount + boot overlay) | ~~**high**~~ **ADDRESSED v0.35.6.1 (TIER-GESTURE-END)** | ⚠️ two real switches → two overlays is CORRECT, not a defect; the recompile burst is accepted + masked, and the gesture is now ended — see below |
| S3 | `orbit-reversals` | desktop Metal | 2–43 | Rapid rotate reversals strobe: the wall-reveal fade flips a near wall between "solid dark slab over a third of the frame" and "gone" in a single frame, 8 times in 2.9 s, whole-frame mean jumping up to **54 counts**. | `orbit-reversals/worst/FLASH-4.png`, `FLASH-31.png` | wall reveal (`src/apartment/walls/wallReveal.ts`, `diffuseColor.a` fade — `src/scene/CLAUDE.md:198`) | ~~**high**~~ **REATTRIBUTED — fixed v0.35.5.0** | the stated mechanism was WRONG: see the S3 note below |
| S4 ⚠️ | `walk-kitchen-to-yard-door` | desktop Metal | 112–322 | Stepping out into the service yard, the exterior is a featureless pastel gradient: no neighbouring blocks, no ground, no site context — the same context orbit mode renders in full — and the parapet reads near-white. | `walk-kitchen-to-yard-door/sheet.png` | site context / backdrop visibility gating per camera mode | med-high | **ROOT-CAUSED: the harness set an invalid `cameraMode` and `Estate` never mounted.** Fixed v0.35.6.0, plus YARD-ESTATE for the residual |
| S5 | `orbit-pitch-limits` | desktop Metal | 120–220 | Dragging past the polar limit at a short dolly distance parks the orbit camera **inside** the flat, near-plane-slicing opaque walls, with no wall-reveal fade and no recovery from the reverse drag — 100 frames end-on into a kitchen cabinet. | `orbit-pitch-limits/sheet.png` | `src/scene/cameras/OrbitCamera.tsx` polar/min-distance clamps | ~~med~~ **FIXED v0.35.5.0** (ORBIT-SHELL-CLAMP) | no |
| S6 ⚠️ | all gesture clips | desktop Metal | — | `getPixelRatio()` drops 1 → **0.5** for the duration of every rotate/pan/dolly on a DPR-1 desktop (20 toggles / 23 clips) — half-resolution during every camera move. On the phone arm the same code degrades only 4 times in 15 clips, because the MOBILE-POLISH floors put `degradedDpr >= effectiveDpr`. | `events-summary.json` both arms | `src/scene/interactiveDegrade.ts:degradedDpr` + `MIN_DEGRADED_DPR` | med | by design, but the desktop/phone asymmetry is a product call — ⚠️ **counted on estate-less walk frames; re-evaluate after the harness fix** |
| S7 | walk clips | all | — | `beginCameraGesture`/`endCameraGesture` are wired **only** to OrbitControls (`src/scene/cameras/OrbitCamera.tsx:821-822`), so `isCameraGestureActive()` is false for the entire walk mode — GPU-STARVE-1's gesture degrade never engages while walking, only its long-frame hold can. | `src/scene/cameraMotionSignal.ts`, walk `clip.json` DPR series | `cameraMotionSignal` wiring | med | no |
| S8 ⚠️ | `walk-orbit-switch-mid-gesture` | desktop + phone | ~90–200 | Flipping `cameraMode` under a live drag costs 4 FLASH, 2 RECOMPILE and 2 STUTTER (>120 ms) per switch; the gesture is not cancelled, it simply retargets. | `walk-orbit-switch-mid-gesture/events.json` | `src/state/slices/cameraSlice.ts:148` | low-med | ⚠️ **cost inflated by an estate rebuild the invalid `'walk'` string caused; re-evaluate after the harness fix** |
| S9 | `orbit-hour-ramp-mid-drag` | desktop + phone | — | A 6→20 h scrub under a held drag recompiles 2 programs and produces 3–5 whole-frame luma steps; the ramp itself is the cause, the steps are its granularity, not a defect. | `orbit-hour-ramp-mid-drag/events.json` | — | info | — |

### S3 and S5, resolved (v0.35.5.0)

Both were re-recorded on the **deterministic chain** `orbit-zoom-through-wall → orbit-pitch-limits
→ orbit-reversals` (the missing link in the original write-up: `orbit-zoom-through-wall`'s 26 wheel
ticks are what leave the dolly at radius 5.96 m, and the two clips after it inherit that pose).
Baseline `/tmp/sweep/before`, fixed build `/tmp/sweep/after`, both `desktop-metal`,
`record.mjs --wall-trace` (new flag — a per-rAF dump of `window.__wallOpacities()` into
`clip.json.wallTrace`, because the 100 ms sampler cannot see a one-frame fade flip).

**S5 — ORBIT-SHELL-CLAMP, fixed.** The limit that traps the camera is the POLAR one, not
`minDistance`: at target `(6.36, 1, 4.69)` and radius **5.96 m** — well past the 3 m minimum —
`maxPolarAngle` puts the camera at `(10.56, 1.09, 8.91)`, i.e. 1.09 m off the floor inside the
kitchen of a 12.725 × 9.375 m flat. The reverse drag cannot recover because at that radius *every*
polar angle from 1° to 89° is still inside the shell (asserted in `orbitEnvelope.test.ts`); the
target was never dragged below the floor. Fixed by a geometric clamp
(`src/scene/cameras/orbitEnvelope.ts` + `OrbitCamera.tsx`, see `src/scene/CLAUDE.md`).
**Measured: 24 of 116 pose samples inside the shell → 0 of 118.** Six after-samples sit inside the
0.6 m padded envelope, which is the eased recovery in flight (≈10 frames / 167 ms). Sheets:
`/tmp/sweep/after/orbit-pitch-limits/sheet.png` — no frame is end-on into a cabinet from inside;
frames 130-220 look INTO the kitchen through the faded south facade from 0.6 m outside it, and
`orbit-reversals` then orbits normally instead of being stuck.

**S3 — REATTRIBUTED: the wall reveal was not strobing.** The finding's mechanism ("the fade flips a
near wall between an opaque dark slab and absent in a single frame") is refuted by the wall trace:
over the baseline `orbit-reversals`, each of the 24 walls crosses `REVEAL_TRANSPARENT_AT` **exactly
once**, the largest single-frame opacity step is **0.205** (a normal 0.2 s ease under a fast target
swing, not a flip), and all six FLASHes fall in the 105-805 ms window where the azimuth swings up
to **59° per 100 ms** — none occur after 900 ms, although the opacities are still converging. The
FLASHes are ordinary content change, and the reason they are so violent is S5: the camera was
parked *inside* the kitchen. FLASH is 6 before / 7 after and is expected to stay there — it is a
whole-frame-mean detector and this clip reverses the azimuth five times in 900 ms.
- **A real latent flip was found and fixed anyway (WALL-REVEAL-HYSTERESIS).** The single 0.985
  threshold also gates overlay visibility, the depth pre-pass and `renderOrder`. Measured on the
  same trace, walls DWELL in the 0.975-0.995 band: **28 visits, 16-18 rAF frames each, longest 29**
  — so any dither there flips the whole surface treatment per frame. `revealPhase` latches it and
  cuts render-state flips **63 → 52** over the identical trace.
- **SwiftShader confirmation (v0.35.5.1).** `orbit-reversals` on `desktop-swiftshader` (boot pose;
  the software arm still cannot afford the pitch-limits clip that sets up the inherited one — 48
  frames in 44.5 s): **0 FLASH**, whole-frame luma 158.5–178.7 with a largest single-frame step of
  **5.0 counts** against the 25-count flag threshold, and 0 samples inside the shell. Its 49-row
  wall trace is the cleanest demonstration of the latch: the bare 0.985 comparison flips the render
  state **8** times, `revealPhase` flips it **0**, because at ~1 fps every sparse sample lands
  inside the 0.975–0.995 band — exactly the dither the hysteresis exists for.
- **No dead band was added to the facing target** (hypothesis (a)): the trace shows no oscillation
  to damp, and a fix that moves no metric does not ship.

### Harness artefacts, explicitly NOT app defects

- **POP is dominated by the ceiling fan.** 43 desktop / 232 phone POP events; every triptych
  inspected (e.g. `phone-metal/walk-phone-into-wall-slide/worst/POP-3.png`) is the fan blade
  sweeping while the camera is still. The POP rule ("a tile changed while the camera did not") has
  no notion of scene animation. Read POP counts as "clips containing the fan", not as popping.
- **Clip-to-clip camera coupling.** A clip without an explicit `pose` inherits the previous clip's
  camera *and* store state in the same browser session — S5 starts from `orbit-zoom-limits`' close-in
  dolly, and `orbit-tier-change-mid-drag`'s "before" frame is at night because
  `orbit-hour-ramp-mid-drag` left the clock at 20 h. The states are all user-reachable, but they are
  not the boot framing.
- **The adaptive ladder is pinned**, so no demotion appears in any series (`deviceClass` is constant
  in every `clip.json`).
- **Screencast frame drops.** Delivery is ~50 fps on Metal but ~1 fps on SwiftShader; a lone large
  `diff` with no accompanying event is a dropped frame, not a pop.
- **`console` capture is `error`/`warning` only**, so Vite's `[vite] hot updated` (an `info` log)
  would not have been recorded — the code-state question above had to be settled from file mtimes
  and the `gl.info.render.frame` series instead. Worth widening if the sweep is repeated.

### What could not be emulated

- **Desktop mouse-look in walk mode.** It is gated on Pointer Lock, which headless Chrome does not
  grant; `walk-look-drag-while-moving` therefore records what a click-drag *without* the lock does
  (nothing to the heading). Walk look was exercised on the phone arm only, through real touch drags.
- **Inertia/flick fidelity.** CDP input events are dispatched on the Node event loop, so a "fast
  flick" is ~5 ms per step rather than a real trackpad's sub-ms stream; OrbitControls' damping tail
  is genuine, the throw velocity is approximate.
- **`clickSelector` releases a held mouse button** (Puppeteer's `elementHandle.click` is a full
  down/up), so `orbit-menu-mid-drag` opens the panel but ends the drag — "menu opened *during* a
  drag" is honest, "drag continues after the menu opens" is not tested.
- **No real OS compositor, no real display**: no vsync, no ProMotion, no thermal throttling, no
  Safari/WebKit. Nothing here can confirm or refute z21/z22, which need a device.
- **Orientation change** is a viewport swap, not a real `orientationchange` with the OS animation.

### Harness changes made mid-sweep (triage feedback)

- **Readiness gate.** `record.mjs` now waits for `sceneReady && !loading.active && !#boot-loader`
  plus a settle window before *every* clip (not only at boot) and records the wait as
  `bootWaitMs`/`clipWaitMs` in `clip.json`. Without it the first ~44 frames of the SwiftShader
  `orbit-slow-rotate` were the "Applying Realistic quality…" overlay, because `setQualityTier`
  raises that overlay (`src/state/slices/uiSlice.ts:565`) and a 2.5 s fixed sleep does not cover a
  1 fps renderer. The four SwiftShader clips in the table above predate the gate; the Metal arms
  were checked and do not show splash frames.
- **Cadence evidence.** The rAF series in `clip.json` is now `[t, dt, gl.info.render.frame]`, and
  every op (each wheel tick included, via `wheelTicks`) is timestamped into `clip.json.opLog`. The
  alternating duplicate-frame cadence seen on the software wheel clips (mean-abs-diff alternating
  ≈0 / ≈18) can now be attributed: a flat frame counter across two rAFs is the demand loop, an
  advanced counter with no delivered frame is a screencast drop.
- **Cross-arm twin for the wall crossing.** `orbit-zoom-through-wall` existed on desktop only;
  `orbit-phone-zoom-through-wall` was added and recorded (371 frames, phone Metal, DPR 3).
  **Result: the translucent diagonal bands do not reproduce.** The dolly crosses the shell and ends
  nose-to-nose with a bedroom wardrobe with clean, banding-free surfaces; the clip flags 3 POPs, all
  fan. Desktop Metal's twin flags only a `DPR_TOGGLE`. The banding is therefore attributable to the
  software rasteriser (and/or its 0.5-DPR dither), not to the app's wall-crossing path — consistent
  with z20's rule that software frames must not carry surface-level claims.
- **Gate verified on Metal** (`/tmp/sweep/gate-demo`): `bootWaitMs 6955`, `clipWaitMs 1281`, 274
  frames, first frame is the scene. The `opLog` (`[{op:'drag',start:0,end:3668}, …]`) and the rAF
  triples (`[15664, 16.6, 9745]`) are both present.
- **Phone frames are ~20 % UI.** The "Get started" checklist panel sits over the bottom of every
  390×844 frame; it is never dismissed by the setup. Worth adding to the boot sequence before the
  next sweep, since it eats the part of the frame where the floor is.
- `analyse.mjs` already writes `events.json` (and `sheet.png`, and the triptychs) at the end of
  **each clip**, inside the loop; only `events-summary.json` waits for the arm.

## Top 5, with a fix hypothesis each

1. **S1 — windows are a white void (`walk-into-wall-slide`).** For a "virtual showroom" this is the
   single loudest unreal cue: stand anywhere near the living-dining glazing and the frame is flat
   paper-white. The likely mechanism is that the glazing's transmitted term resolves to the
   backdrop/sky at an intensity the tone mapper cannot roll off (AgX compresses highlights but the
   input here appears to be clipped before it, i.e. the value reaching the composer is already at or
   past the mapper's shoulder), combined with no exterior geometry behind the pane at eye height —
   so there is nothing *in* the white to see. Two separable checks: (a) read the linear radiance of
   a pane pixel before tone mapping (`scripts/dev-probes/agx-parity.mjs`'s linear comparison is the
   right instrument) to see whether it is genuinely blown or merely mapped flat; (b) render the
   same pose with the context blocks forced visible to see whether the pane is transmitting the
   backdrop at all. If (a) says clipped, the fix is the window material's `transmission`/
   `envMapIntensity` at `realistic`, not the tone mapper.

2. **S2 — tier change shows the boot splash for 2 s (`orbit-tier-change-mid-drag`). ADDRESSED
   v0.35.6.1 (TIER-GESTURE-END) — re-recorded, numbers below.** The hypothesis above ("the whole
   app unmounting and remounting") was not quite right: the `Canvas` itself never remounts — the
   scenario's own `eval` op calls `setQualityTier('performance')` then, 1200 ms later,
   `setQualityTier('realistic')`, so **the clip does two real switches and the two boot-splash
   cycles are correct, not a duplicate-overlay bug.** The 2 167 ms/983 ms rAF gaps are one
   synchronous shader-recompile burst per switch (`postprocessing`/`ao`/`ibl`/`shadowMapSize` all
   flip at once, changing most lit materials' program-cache key), running inside `QualityController`'s
   `useLayoutEffect` **before the browser's next paint** — the overlay's DOM is already committed
   in the same commit, so no half-compiled frame is ever paintable. A `compileAsync`-based split was
   considered and rejected: it is the exact FIREFOX-TIER-SWITCH shape already reverted (uncatchable
   `TypeError` on any driver without `KHR_parallel_shader_compile`, specifically at tier switches).
   The one real defect: a camera gesture held across the switch left `InteractiveDprController`
   degrading for a tier configuration about to stop existing, thrashing the DPR (0.5→1 on the way
   down, 1→0.5 on the way back). Fixed by `setQualityTier` calling
   `cameraMotionSignal.ts:endAllCameraGestures()` before a real tier change.
   **Re-recorded** (`scripts/dev-probes/sweep/record.mjs`, same clip, desktop-metal,
   `/tmp/sweep/retest-desktop-metal/orbit-tier-change-mid-drag/`): worst rAF delta **2 167 ms → 983 ms**
   (both switches now land at ~983 ms — the extra ~1.2 s was the degrade fighting the switch, not the
   compile itself), FLASH events **7 → 2** across the clip (the mid-fade luma steps between the two
   splash cycles are gone), RECOMPILE unchanged in shape (**220→240→254→265→266**, four bursts, same
   as before) — the compile itself was never the target of this fix and is accepted as the mitigation
   the overlay exists for. A new sampled `gesture: {active, endedAt}` field (DEV-only
   `window.__cameraGesture`, `cameraMotionSignal.ts`) confirms `active` flips `true → false` in the
   very first 100 ms sample after each `setQualityTier` call and stays `false` for the rest of the
   clip, holding the drag op open the whole time.
   **SwiftShader confirmation.** `desktop-swiftshader` re-recorded too
   (`/tmp/sweep/retest-desktop-swiftshader/orbit-tier-change-mid-drag/`, 627 frames / 268 s wall
   clock — this renderer delivers ~1 screencast frame/s, so its STUTTER column (18 events, one
   **41 015 ms** rAF delta) is delivery cadence, not app signal, exactly as this doc's SwiftShader
   caveat already says; read it structurally only, per z20). The gesture probe still confirms the
   fix: `active` flips `true → false` in the sample immediately after the FIRST `setQualityTier`
   call (relMs 2701 → 2712) and never flips back true for the rest of the clip. RECOMPILE fires 7
   times (materials still recompile — the fix was never meant to touch that), and `console` is
   empty (0 errors) — no `GL_ERROR`/`BLACK_FRAME`, consistent with "zero across all three arms"
   elsewhere in this doc. One unexplained gap: `store.qualityTier`/`window.__cameraGesture` both
   read as absent for two samples around relMs 121–123k (a `page.evaluate` racing a
   multi-second-stall frame, not a new failure mode — nothing else in the clip corroborates a
   real state loss, and `cameraMode`/`tier` resolve correctly again one sample later).

3. **S3 — wall reveal strobes on direction reversal (`orbit-reversals`).** *(Hypothesis REFUTED in v0.35.5.0 — see "S3 and S5, resolved" above.)* Eight ±50-count
   whole-frame luma steps in 2.9 s of ordinary back-and-forth rotation; each is a near wall going
   from fully opaque dark slab to absent in one frame. The reveal is a per-frame alpha decision with
   no hysteresis, so a camera that oscillates across the decision boundary toggles every frame.
   The `REVEAL-EASE-ATTACHMENTS` work now in the tree eases the *attachments*; this finding says the
   **wall body's own fade needs the same treatment plus a dead band** — ease the alpha over ~150 ms
   and require the camera to cross the boundary by a margin before flipping back. Worth re-recording
   `orbit-reversals` on the eased build to see how much of the 8 survives.

4. **S4 — the service yard opens onto nothing (`walk-kitchen-to-yard-door`).** Orbit mode renders
   neighbouring blocks, a road and trees; walk mode from the same plan, standing in the yard, renders
   a pastel gradient. Either the context geometry is culled by a walk-mode-only frustum/visibility
   rule, or it is placed outside the walk camera's far plane, or it is gated on `cameraMode` outright.
   This is the cheapest of the five to diagnose (one `scene.traverse` at that pose, comparing
   `visible`/`frustumCulled` against the orbit pose) and one of the most valuable to fix: a showroom
   whose windows and yard look out onto void cannot feel like a flat in a real block.

5. **S5 — orbit can park the camera inside the flat (`orbit-pitch-limits`).** *(FIXED in v0.35.5.0; the hypothesis below named the wrong clamp — it is the POLAR one, not `minDistance`.)* At a short dolly
   distance the polar clamp lets the camera cross the shell; once inside, the reveal system (which
   assumes an exterior viewpoint) leaves walls opaque, the near plane slices them, and the reverse
   drag does not push the camera back out. Hypothesis: the min-distance clamp is a scalar on the
   target-to-camera distance, independent of pitch, so the swept volume at low elevation intersects
   the model. A pitch-dependent minimum distance (or a shell-aware clamp that pushes the camera to
   the first exterior intersection) would close it; a cheap mitigation is to raise `minDistance`
   enough that the camera cannot reach the interior at any polar angle.

## Suggested next steps

- Phase 2 fixes, in the order above; S4 first if a quick win is wanted.
- Add a scene-animation mask to `analyse.mjs`'s POP rule (exclude the fan's screen-space bbox) —
  POP is currently ~95 % noise.
- Give every clip an explicit `pose` so clips stop inheriting each other's camera and clock.
- Re-record `orbit-reversals` and the walk clips once `REVEAL-EASE-ATTACHMENTS` lands, and diff the
  FLASH counts — that is a ready-made regression metric for the easing work.

---

# Closing pass (HEAD `224c9d55`, v0.35.6.1)

Full re-record of the **entire** clip catalogue on the corrected recorder (`record.mjs` maps
`walk → firstPerson` and asserts `cameraMode` back; `--wall-trace` on every orbit clip; the
`gesture` sample from TIER-GESTURE-END). Three arms, all on HEAD, dev server `:5200`, tier
`realistic`, device class pinned, `interactiveDegrade` ON, no feature-flag overrides.
Evidence: `/tmp/sweep/final/<arm>/` (frames, `clip.json`, `metrics.json`, `events.json`,
`sheet.png`, `worst/*.png`, `clip.webm`, `events-summary.json`) — ~7 GB of PNG, not committed.
Contact sheets and triptychs were composited for review under `/tmp/sweep/final/mont/`.

**`cameraMode` is `firstPerson` in every sample of every walk clip on every arm** (asserted by the
recorder, re-verified from `clip.json`). The estate is mounted in all walk frames — visible in
`walk-into-wall-slide/sheet.png` (neighbour block, grass and road through the living-dining glass)
and `walk-kitchen-to-yard-door/sheet.png` (the service light well). The first pass could not
show either.

## Event counts per arm — closing pass beside the original sweep

| arm | pass | DPR_TOGGLE | FLASH | RECOMPILE | POP | STUTTER | BLACK_FRAME | GL_ERROR | clips | frames |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `desktop-metal` | original | 20 | 26 | 9 | 43 | 5 | 0 | 0 | 23 | 5 008 |
| `desktop-metal` | **closing** | **22** | **19** | **11** | **25** | **6** | **0** | **0** | **23** | **5 239** |
| `phone-metal` | original (re-run) | 4 | 10 | 3 | 232 | 2 | 0 | 0 | 16 | 4 194 |
| `phone-metal` | **closing** | **8** | **9** | **6** | **145** | **2** | **0** | **130** | **16** | **4 374** |
| `desktop-swiftshader` | original | 1 | 3 | 3 | 34 | 257 | 0 | 0 | **4 of 10** | 378 |
| `desktop-swiftshader` | **closing** | **2** | **8** | **8** | **78** | **418** | **0** | **0** | **10 of 10** | **527** |

Totals: **49 clips, 10 140 frames, 0 `BLACK_FRAME`, 0 `GL_ERROR` on both desktop arms.**

Read with the harness caveats, which are unchanged and still dominate three columns:

- **POP is still mostly the ceiling fan.** Every POP triptych on both Metal arms was inspected;
  the flagged tile is a fan blade, a lights toggle, or a screencast drop in all but the
  `walk-phone-into-wall-slide` cluster (new finding N5 below). Desktop POP halved (43 → 25) only
  because the walk clips now spend fewer frames in rooms with a fan in shot.
- **SwiftShader STUTTER is delivery cadence, not app signal** — 418 events over 527 frames at
  ~1 fps, worst rAF delta **41 565 ms** on `orbit-tier-change-mid-drag`. Structural checks only
  (z20). Its POP (78) is the same cadence read through a tile detector.
- **The software arm now completes all 10 clips** (the first pass managed 4 and abandoned
  `orbit-pitch-limits` after 25 minutes). `orbit-pitch-limits` finished in **72 s / 76 frames** —
  because ORBIT-SHELL-CLAMP (v0.35.5.0) keeps the camera outside the shell instead of parking it
  inside the kitchen, which is the expensive view. That is an independent confirmation of S5.
- **Phone frames are still ~20 % UI** (the "Get started" / "Walking through" panels are never
  dismissed), unchanged from the first pass.
- **FLASH fell 26 → 19 on desktop** with `orbit-reversals` at 4 (was 6–8) — consistent with
  ORBIT-SHELL-CLAMP + the reveal hysteresis, not with any change made for this pass.

## Finding closure, S1–S9

| id | status on HEAD | numbers |
| --- | --- | --- |
| **S1** | ✅ **CLOSED.** Re-recorded with the estate mounted and the calibrated blowout live. The window is no longer a white void: the neighbour block's facade grid, the grass and the access road all read through the glass on all three arms. | Aperture crop (400×220 px centre band, identical crop on both runs), `walk-into-wall-slide` frame 294: **mean 198.8, p95 232, ≥240 = 1.12 %, sd 22.2** on HEAD, against 230.4 / 242.9 / **30.7 %** / 15.2 for the v0.35.6.0 flag-OFF baseline. SwiftShader twin structurally clean. Evidence `/tmp/sweep/final/desktop-metal/walk-into-wall-slide/sheet.png`, `/tmp/sweep/final/desktop-swiftshader/walk-into-wall-slide/sheet.png` |
| **S2** | ✅ **CLOSED as scoped.** Two real `setQualityTier` calls → two overlay cycles, correct. The DPR thrash is gone. | `orbit-tier-change-mid-drag`: worst rAF **950 ms** (was 2 167 ms pre-fix, 983 ms at v0.35.6.1), FLASH **4**, RECOMPILE 4 bursts `223→243→257→267→269`, STUTTER 4. The `gesture` sample reads `active:false` for the whole post-switch tail. The compile burst is accepted and masked — unchanged. |
| **S3** | ✅ **CLOSED (reattributed).** The reveal does not strobe. `orbit-reversals` FLASH **4** across 122 frames; every flagged triptych is ordinary content change under a 5× azimuth reversal, with the near wall filling the frame as a lit surface, not flipping. | `/tmp/sweep/final/desktop-metal/orbit-reversals/worst/FLASH-{7,18,24,31}.png` |
| **S4** | ✅ **CLOSED with a stated residual.** The yard opens onto the service light well; the estate is there. | Yard crop (350×360 px), `walk-kitchen-to-yard-door` frame 300: **mean 213.1, ≥240 = 42.2 %, sd 39.5** on HEAD, against **70.9 % / sd 18.6** flag-OFF and 53.6 % / 33.4 at v0.35.6.0. The sd nearly doubling is the view arriving. **Residual: 42 % of that crop is still ≥240** — the wing surfaces run at the blown boost because the adaptive ramp is glazing-driven and the yard has no glazing. Carried forward as N4's sibling. |
| **S5** | ✅ **CLOSED.** No frame of `orbit-pitch-limits` on either arm is end-on into a cabinet from inside the flat; the clip orbits the shell throughout. Independently corroborated by the SwiftShader runtime collapse (>25 min → 72 s). | `/tmp/sweep/final/desktop-metal/orbit-pitch-limits/sheet.png`, `/tmp/sweep/final/desktop-swiftshader/orbit-pitch-limits/sheet.png` |
| **S6** | 🔄 **RE-EVALUATED on estate-bearing frames; the asymmetry is real and now larger.** Desktop **22** DPR toggles / 23 clips vs phone **8** / 16 — but the desktop figure now *understates* the degrade, because on 7 of 10 desktop walk clips the DPR never comes back up at all (N1). Counting duty rather than edges: desktop walk renders at DPR 0.5 for **100 % of frames** in `walk-look-drag-while-moving`, `walk-into-wall-slide`, `walk-kitchen-to-yard-door`, `walk-doorway-grazing`, `walk-into-furniture`, `walk-run-and-turn`, `walk-lights-mid-walk` and `walk-orbit-switch-mid-gesture`; phone walk floors at 1.5 and sheds to 1.5↔2 only during input. The product call (desktop degrades to half res, phone barely does) still stands and is now **blocked behind N1** — fix the leak before re-arguing the floor. | `events-summary.json` both arms; `clip.json.samples[].dpr` + `.gesture` |
| **S7** | ✅ **CLOSED as wired, ⚠️ REOPENED as leaking.** `beginCameraGesture` now reaches walk mode on both arms: the `gesture` sample goes `active:true` under held keys (desktop) and joystick/look-drag (phone), which the first pass could not show at all. But the desktop path never releases — see N1. | `clip.json.samples[].gesture` in every `walk-*` clip |
| **S8** | 🔄 **RE-SCOPED and RE-MEASURED without the estate rebuild. The cost did not go away.** A real orbit↔walk switch (no estate teardown) still costs, **per switch**: 1–2 FLASH, 2–3 RECOMPILE (`programs 331→335→336→337`, +6 over the clip), 1 STUTTER of **133–150 ms**, and a **full-screen branded overlay** ("Entering walkthrough…" / "Switching to overview…") that covers the viewport for ~0.4–0.6 s on desktop and longer on phone. Promoted to N3 as a defect in its own right; the original "the gesture is not cancelled, it retargets" observation also still stands. | desktop `4 FLASH-equivalent / 4 RECOMPILE / 2 STUTTER` over two switches; phone `3 / 2 / 2`. `/tmp/sweep/final/{desktop,phone}-metal/walk-orbit-switch-mid-gesture/worst/{FLASH,RECOMPILE,STUTTER}-*.png` |
| **S9** | ✅ **CLOSED as informational.** The hour ramp's luma steps are its granularity. FLASH 3 / RECOMPILE 1 desktop, RECOMPILE 1 phone. | `orbit-hour-ramp-mid-drag/events.json` |

## NEW FINDINGS — what the corrected walk clips reveal

Numbered N1…N7, ranked. Each was confirmed on a triptych or a sheet before being written up.

| id | clip / arm | symptom | evidence | subsystem (file:line) | sev |
| --- | --- | --- | --- | --- | --- |
| **N1** | `walk-look-drag-while-moving` onward, desktop Metal | ✅ **FIXED v0.35.7.0 (WALK-GESTURE-LEASE).** Pointer Lock is now a STATE and the look gesture a movement-driven LEASE (`scene/gestureLease.ts`, 250 ms idle expiry) with guaranteed ends on mouseup/pointerup/blur/hidden/`pointerlockerror`/unmount, plus a 10 s no-pose-change watchdog in `cameraMotionSignal`. Re-recorded `/tmp/sweep/n1n2/desktop-metal/`: DPR-0.5 samples **145/145 → 117/145** (28 back at DPR 1, degrade releasing at each clip's end), gesture-active samples in the idle tail **37/53/55 → 0/0/0**, `endedAt` **frozen 27677.6 → 17538.8 / 27204.5 / 37221.2** (advances per clip). Original finding: **The walk-mode camera-gesture ref-count leaks and never releases for the rest of the session.** From the first desktop walk look-drag, `window.__cameraGesture()` reads `{active:true, endedAt:27677.6}` and that `endedAt` never advances again — through **7 subsequent clips and ~2 100 frames**. DPR is pinned at **0.5** for every one of them: the desktop walk experience renders at half resolution permanently after the first click in the viewport, standing still included. | `/tmp/sweep/final/desktop-metal/walk-look-drag-while-moving/clip.json` (first sample already `active:true`, stale `endedAt`) vs `walk-strafe/clip.json` (clean `true→false` at 27677, DPR returns to 1 at 28114). Sheets `walk-doorway-grazing`, `walk-into-furniture`, `walk-run-and-turn` all `dpr=[0.5]` only. | `src/scene/cameras/FirstPersonCamera.tsx:359-402` (`lockGestureActive` / `onLockChange`) + `src/scene/cameraMotionSignal.ts:19` | **high** |
| **N2** | `walk-phone-look-only` (70), `walk-pitch-limits-phone` (60), phone Metal | ✅ **FIXED v0.35.7.0 (WALK-GESTURE-LEASE).** The look surface owns its touches: `touchAction='none'` set on the canvas by `FirstPersonCamera` + non-passive `touchstart`/`touchmove` with `e.cancelable`-guarded `preventDefault()` (Chrome 56 intervention, https://developer.chrome.com/blog/scrolling-intervention); `BEGIN_DEFER_MS` deleted. Re-recorded `/tmp/sweep/n1n2/phone-metal/`: GL_ERROR **70 → 0** on `walk-phone-look-only` and **60 → 0** on `walk-pitch-limits-phone` (`/tmp/sweep/n1n2/phone-pitch/`) — the whole 130, FLASH 0, yaw tracks from the first sample (0.07 → 0.1533 → **0.2367**, was 0.195 behind the defer). Original finding: **130 `GL_ERROR`s — the touchmove-cancel regression WALK-GESTURE-DEGRADE-TOUCH-FREEZE is still firing.** Every one is `Ignored attempt to cancel a touchmove event with cancelable=false… scrolling is in progress`. The `BEGIN_DEFER_MS = 120` mitigation shipped in v0.35.5.2 reduces the freeze but does not prevent the browser from refusing the cancel. Yaw *does* still sweep its full range (0.07 → 3.07 rad in `walk-phone-look-only`), so the drag is not frozen — but the app is losing `preventDefault` on a look-drag on every clip that uses one, and the first sweep recorded **zero** of these. | `/tmp/sweep/final/phone-metal/walk-phone-look-only/clip.json` `console[]`, `walk-pitch-limits-phone/clip.json` `console[]` | `src/scene/cameras/FirstPersonCamera.tsx:268-322` (`BEGIN_DEFER_MS`, `onTouchStart`) | **high** |
| **N3** | `walk-orbit-switch-mid-gesture`, all three arms | ✅ **FIXED v0.35.7.2 (MODE-SWITCH-CROSSFADE).** `setCameraMode` no longer raises the boot-brand `LoadingOverlay` — it bumps `cameraSlice.ts`'s `modeTransition`, rendered by `ui/loading/ModeSwitchCrossfade.tsx` as a short unbranded veil (behind `modeSwitchCrossfade`, default on; flag OFF reproduces the exact old splash, re-verified: `/tmp/sweep/mode-switch-crossfade/desktop-metal-ffoff/walk-orbit-switch-mid-gesture/0047.png`). Re-recorded all three arms (`/tmp/sweep/mode-switch-crossfade/`): desktop-metal FLASH 2 / RECOMPILE 5 / STUTTER 2 (both are ordinary content-change flashes on inspection, e.g. `0048.png`→`0049.png` dollhouse→interior — never the splash card); phone-metal DPR_TOGGLE 1 / FLASH 2 / STUTTER 2 / RECOMPILE 2; desktop-swiftshader FLASH 2 / STUTTER 41 (delivery cadence, read structurally only) / RECOMPILE 0. **Second switch of the session costs ~+1 program and one ~133 ms STUTTER on Metal (desktop `255→256` @2690ms, phone `211→212` @2581ms)** — the underlying compile is unchanged (this fix removes the splash, not the compile), but it is now genuinely masked by the veil instead of a 0.4–0.6 s brand card: frame `0119.png` (mid-fade, visibly hazy) → `0120.png` (clear) on desktop-metal shows the veil actually painting. `prefers-reduced-motion` (verified live via CDP `Emulation.setEmulatedMedia`) skips the veil entirely — instant cut, confirmed the veil element never mounts across two consecutive switches. ⚠️ **Residual, left open:** the FIRST switch of a fresh session can cost far more (desktop-metal measured `220→257`, +37 programs) than the second — three's `WebGLBackground` box/plane material (backing `SceneBackdrop.tsx`'s firstPerson-only `scene.background`) is built lazily inside an actual `render()` call, which `ShaderWarmup.tsx`'s existing `gl.compile()`-based pre-warm cannot reach (verified against `three/src/renderers/{webgl/WebGLBackground.js,WebGLRenderer.js}` — `background.render()` is called only from the render path, never from `compile()`). No pre-warm was written for it (would need a hidden forced `gl.render()`, unverified and the same manual-GL-outside-the-loop shape as GPU-STARVE-3/BLOOM-MIP-FLASH); documented in `ShaderWarmup.tsx`'s docstring and `src/scene/CLAUDE.md` as a citation-backed open item, not chased blind. | `/tmp/sweep/mode-switch-crossfade/desktop-metal/walk-orbit-switch-mid-gesture/{sheet.png,0048.png,0119.png,0120.png}`, `.../worst/{FLASH-49,FLASH-120,RECOMPILE-52,STUTTER-128}.png`; `/tmp/sweep/mode-switch-crossfade/phone-metal/walk-orbit-switch-mid-gesture/sheet.png`; `/tmp/sweep/mode-switch-crossfade/desktop-swiftshader/walk-orbit-switch-mid-gesture/sheet.png`; flag-off control `/tmp/sweep/mode-switch-crossfade/desktop-metal-ffoff/walk-orbit-switch-mid-gesture/0047.png` | `src/state/slices/cameraSlice.ts` (`setCameraMode` → `modeTransition`), `src/ui/loading/ModeSwitchCrossfade.tsx`, `src/ui/loading/modeCrossfadeTimeline.ts` | ~~**med-high**~~ **FIXED**, residual noted above |
| **N4** | `walk-pitch-limits-phone`, phone Metal | ✅ **FIXED v0.35.7.3 (CEILING-EXPOSURE)**, with a CONTENT residual stated. The ceiling is genuinely the brightest surface in a lit flat and that was never the bug: `#fafafa` albedo (linear ~0.947) seen at point-blank range, because every fixture hangs BELOW it — the default flat's `ceiling-light` bulb sits at **2.05 m** under a 2.6 m slab (a `flush` one at 2.50 m) and three's point light is a true point with `decay 2`, so irradiance at the slab is `9/0.55²` = **29.8** (`9/0.10²` = 900 flush) against `9/1.5²` = 4 at head height. What was missing is the CAMERA. `scene/lighting/ceilingCoverage.ts` estimates ceiling coverage on the CPU (the `occluderRectsForPlan` rectangles merged into one slab quad, through `apertureCoverage`'s clipper) and stops `toneMappingExposure` down by two stops above 0.60 coverage, eased and step-limited by the same pair the exterior ramp uses. A uniform multiplier cannot re-rank the frame, so the lamp pool stays the brightest region by construction. **⚠️ RESIDUAL, and it is not a lighting defect:** the frame is still FEATURELESS, because `ceiling/Ceiling.tsx` paints a flat `meshLambertMaterial` with **no map at all** — the one texture-less plane in the app (`src/scene/CLAUDE.md` PHOTO-GRAIN measures its high-frequency floor at 0.10 against photographic ceilings at 0.76 and 1.49). No exposure change can add detail that is not modelled; that is a ceiling-material content call. | Ceiling crop (full width, y 0.27-0.75, DOM callout excluded), `walk-pitch-limits-phone` frames 222-300 held at the clamp, flag OFF vs ON in the SAME session: **mean 221.6 → 183.4, ≥240 22.84 % → 0.03 %, ≥247 5.90 % → 0.03 %, sd 19.7 → 28.6** (the sd RISING is the lamp gradient coming back). Evidence `/tmp/sweep/pp2/phone-metal/walk-pitch-limits-phone/` vs `/tmp/sweep/pp2off/phone-metal/walk-pitch-limits-phone/`. **Measurement trap:** the first pass read **8.93 %** on a naive "top two-thirds" crop — the phone arm is ~20 % white DOM chrome (the "Walking through" callout, the `Measure` pill), which is not canvas and never responds to exposure. | `scene/lighting/ceilingCoverage.ts` + `lighting/Lighting.tsx` (flag `ceilingExposure`, simple, default on) | **med-high** 
| **N5** | `walk-phone-into-wall-slide`, phone Metal | 🔄 **REATTRIBUTED — the exposure ramp is NOT the cause — plus a real cadence fix shipped v0.35.7.3.** The POP tiles report deltas of **46-107 counts** while the WHOLE aperture ramp spans ~26 counts end to end, so it cannot produce them; the triptychs show the neighbour block's lit-window grid sliding behind the near mullions as the camera advances at 0.22 m/s, i.e. **parallax through a near occluder** — genuine content change of the same class as the fan exclusion already recommended for this detector. Measured directly, the facade exposure series (median of a fixed exterior crop, frames 30-180, clock pinned to 12:00) stepped at most **4 counts** BEFORE any fix, never the ±9-11 the first pass attributed to it. **What did ship, and why it still should:** `easeBlowout` is frame-rate independent in its TIME CONSTANT but not in STEP SIZE — one frame moves 5.5 % of the gap at 60 Hz and 79.7 % at 2 Hz, i.e. 0.52 counts against 10.8. `clampExposureStep` (`estate/apertureCoverage.ts`) caps each step in DISPLAY COUNTS, so the guarantee holds at any cadence and for a coverage TELEPORT as well as for the ease. | Facade step, same crop, both at a pinned 12:00: pre-fix **max 4, p95 3, steps>2 counts 11**; fixed **max 3, p95 2, steps>2 counts 2**. POP **136 → 127**, unchanged as predicted once the cause is parallax; desktop twin `walk-into-wall-slide` **POP 0**. Triptych `/tmp/sweep/pp2/phone-metal/walk-phone-into-wall-slide/worst/POP-58.png` (tile 9,11 delta 107 — a lit window crossing a tile edge). | `estate/apertureCoverage.ts:clampExposureStep` + `estate/Estate.tsx`; the POP residual belongs to `sweep/analyse.mjs`'s tile rule | **med** 
| **N6** | `orbit-phone-orientation-mid-gesture`, phone Metal | ✅ **FIXED v0.35.7.3 (`scene/ResizeRepaint.tsx`).** GPU-STARVE-3's rule applied to a resize the app does NOT initiate: r3f's own path is `ResizeObserver → setSize → configure() → gl.setSize() → invalidate()`, so the buffer is cleared synchronously and the repaint deferred to the next rAF — exactly the shape the rule forbids, and nothing in the app was listening for a resize it had not caused. The new component repaints TWICE and the order is load-bearing: a `useLayoutEffect` pass in the same task as the commit (this is the one that beats the compositor) and a `useEffect` pass after the composer's own `size`-keyed effect has re-allocated its targets. Mounted LAST inside both Canvases so that ordering holds. **Flag-free**: it adds renders that were already going to happen one rAF earlier and changes no pixel of any frame that would otherwise have been composited, so there is nothing for a flag to select between. | `orbit-phone-orientation-mid-gesture` re-recorded: **FLASH 4 → 0**, and ZERO events of any type over 221 frames. The sheet shows the 390x844 → 844x390 swap resolving with scene content in every frame (`/tmp/sweep/pp2/phone-metal/orbit-phone-orientation-mid-gesture/sheet.png`). Desktop twin `orbit-resize-mid-drag` shows no blank frame either; its 2 FLASH are ordinary content change under a fast drag (scene present in all three panels of `/tmp/sweep/pp2day/desktop-metal/orbit-resize-mid-drag/worst/FLASH-76.png`), the same reattribution S3 got. | `scene/ResizeRepaint.tsx`, mounted in `Scene.tsx` + `RoomEditorScene.tsx` | **med** 
| **N7** | `orbit-phone-two-finger-rotate`, `orbit-phone-double-tap`, phone Metal | **Two touch gestures register a camera gesture but move nothing.** Two-finger rotate: 17 of 32 samples report `gesture.active`, camera path over the clip is **0.02 m**. Double-tap: camera path **0.00 m** over 148 frames. The degrade engages for an input that has no effect. | `/tmp/sweep/final/phone-metal/orbit-phone-two-finger-rotate/clip.json`, `orbit-phone-double-tap/clip.json`, both `sheet.png` | `src/scene/cameras/OrbitCamera.tsx` touch mapping | **low** |

**Explicitly NOT findings (harness artefacts), restated for this pass:**
fan-driven POP on both Metal arms; SwiftShader's 418 STUTTER and 78 POP (≈1 fps delivery);
screencast drops showing as a lone large `diff` with no event; the pinned adaptive ladder
(`deviceClass` constant in every `clip.json`); clip-to-clip camera/clock inheritance (the desktop
walk clips inherit each other's pose, which is exactly how N1 became visible);
no Pointer Lock guarantee, no vsync, no real compositor.

## Recommended next fix round (max 3)

1. **N1 — release the walk-mode gesture.** `/tmp/sweep/final/desktop-metal/walk-look-drag-while-moving/clip.json`.
   Hypothesis: `FirstPersonCamera`'s `onLockChange` (`:374-386`) increments the shared count when
   Pointer Lock is acquired and only decrements on a `pointerlockchange` that says unlocked — but
   the acquire in this headless session is never followed by a release, and the effect's cleanup
   (`:398-402`) only fires on unmount, which never happens because walk mode stays mounted across
   clips. Either (a) treat "locked" as a *state*, not a gesture — drive the degrade from actual
   mouse movement with a release debounce, the way `endedAt` already works — or (b) add a
   watchdog in `cameraMotionSignal.ts` that force-releases after N ms with no camera delta. (a) is
   the honest fix: Pointer Lock held while the user stands still is not a gesture.
2. ✅ **N3 — DONE, v0.35.7.2 (MODE-SWITCH-CROSSFADE).** See the N3 row above for the full
   before/after. One correction to this hypothesis before it's fixed: the +6 (and, on a fresh
   session's first switch, far more) is **not** HUD/joystick/reticle materials — those are plain
   DOM, verified by grep (`WalkJoystick.tsx`/`Crosshair.tsx`/`WalkHud.tsx` carry no `<mesh>`/
   `material`). The real, verified candidate is `SceneBackdrop.tsx`'s firstPerson-only
   `scene.background` assignment, which forces three's `WebGLBackground` to build its box/plane
   material inside an actual `render()` call — a class of lazy-compile `gl.compile()` cannot
   reach, so it was left as a residual rather than "warmed at boot" as this entry originally
   proposed.
3. **N2 — the touch look-drag still loses `preventDefault`.**
   `/tmp/sweep/final/phone-metal/walk-phone-look-only/clip.json` console.
   Hypothesis: `BEGIN_DEFER_MS` moves the *gesture signal* out of the cancelable window but the
   canvas still does not claim the touch sequence — the fix belongs in CSS/listener setup
   (`touch-action: none` on the canvas plus a non-passive `touchstart` that calls
   `preventDefault()` immediately), not in the degrade's timing. That would also let the 120 ms
   defer be removed rather than tuned. Flagged in v0.35.5.2 as unverified on real hardware; this
   pass shows it is not verified on the harness either.

---

# PHONE-POLISH-2 verification pass (HEAD after `b800b345`, v0.35.7.3)

Arms recorded in one session on the same machine (Apple M4, ANGLE Metal / SwiftShader), dev server
`:5200`, tier `realistic`, device class pinned, `interactiveDegrade` ON.

| arm / clip | FLASH | POP | STUTTER | BLACK_FRAME | GL_ERROR | frames | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| phone `walk-pitch-limits-phone` | 0 | 2 | 0 | 0 | 0 | 310 | `/tmp/sweep/pp2/phone-metal/` |
| phone `walk-phone-into-wall-slide` | 0 | 128 | 0 | 0 | 0 | 303 | `/tmp/sweep/pp2/phone-metal/` |
| phone `orbit-phone-orientation-mid-gesture` | **0** | 0 | 0 | 0 | 0 | 221 | `/tmp/sweep/pp2/phone-metal/` |
| phone `walk-phone-into-wall-slide` @ 12:00 pinned | 0 | 127 | 0 | 0 | 0 | 306 | `/tmp/sweep/pp2day/phone-metal/` |
| desktop `walk-into-wall-slide` @ 12:00 | 0 | **0** | 0 | 0 | 0 | 296 | `/tmp/sweep/pp2day/desktop-metal/` |
| desktop `orbit-resize-mid-drag` @ 12:00 | 2 | 0 | 0 | 0 | 0 | 162 | `/tmp/sweep/pp2day/desktop-metal/` |
| SwiftShader, both clips @ 12:00 | **0** | 10 | 51 | **0** | **0** | 53 | `/tmp/sweep/pp2day/desktop-swiftshader/` |

SwiftShader's STUTTER/POP are the documented ~1 fps delivery cadence (15 frames in 8.3 s, 38 in
35.3 s), structural checks only; it is clean on the columns that matter (no blank frame, no GL
error, both clips complete).

## Byte-identity at the calibrated poses

`scripts/scenarios/lightmap-night-floor-verify.json` at the 390x844 phone viewport,
`?ff=ceilingExposure:off` against ON, **in the same session** — and against a twin-run noise floor
taken by recording the OFF arm twice, because the living/dining pose contains the animating ceiling
fan (`src/scene/CLAUDE.md`, BAKED-GI-DAY-LEVEL: "a whole-frame day diff is dominated by the CEILING
FAN's blade angle; localise one before believing it").

| pose | OFF vs ON (this change) | OFF vs OFF (noise floor) |
| --- | --- | --- |
| A 12:00 kitchen | **0 channels — BYTE-IDENTICAL** | **0 channels** |
| A 12:00 living | 1.35 %, max 69, meanAbs 0.039 | 9.15 %, max 156, meanAbs 0.751 |
| D 02:24 lights-on kitchen | **0 channels — BYTE-IDENTICAL** | **0 channels** |
| D 02:24 lights-on living | 8.79 %, max 141, meanAbs 0.356 | 7.99 %, max 114, meanAbs 0.321 |

Every fan-free pose is bit-for-bit identical; every pose with the fan in shot sits at or an order of
magnitude below the run-to-run floor. Byte-identity holds.

⚠️ **`/tmp/photoreal-mobile/ab3/gpu/` is STALE as a byte reference and should not be quoted again.**
Re-shot at its own viewport it differs from today's build by **80.6 %** of channels / meanAbs 14.60
(kitchen) and 73.9 % / 12.46 (living) — on the very pose that is byte-identical between this
change's two arms. The app has moved a long way since that set was captured, and the scenario's own
later arms have been renumbered (`05-C` is `06h-off` now, was `02h-on`). Use an in-session control.

## Two harness defects found, both of which invalidate cross-session comparisons

1. **`scripts/dev-probes/sweep/record.mjs` never sets `timeMode`.** It SAMPLES `st.manualHour`
   (12, the store default) and reports `hour: 12` in every `clip.json`, but nothing calls
   `setTimeMode('manual')` — so every clip renders at the **wall clock**. The closing pass was
   recorded in daylight; re-running the same clips at 19:40 gives a dusk frame with the estate's
   night emissive map, lit windows and a dark sky, while `clip.json` still says `hour: 12`. Any
   absolute-brightness comparison between two sessions is therefore confounded, and the first
   reading of this pass was nearly filed as a two-stop regression on that basis. Clips in this
   pass pin the clock through a local catalogue's `setup` (`{"op":"store","fn":"setTimeMode",
   "args":["manual"]}`); the fix belongs in the recorder's own setup.
2. **A phone crop is ~20 % DOM chrome.** The "top two-thirds" band the N4 numbers are quoted over
   contains the white "Walking through" callout and the `Measure` pill, which are DOM over the
   canvas and never respond to exposure. Masking them moved the post-fix ≥240 fraction from
   **8.93 % to 0.03 %** — the difference between "missed the target" and "beat it by 150x".
