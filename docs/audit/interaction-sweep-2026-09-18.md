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

## Findings

| id | clip | arm | frames | symptom | evidence | probable subsystem | sev | known? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | `walk-into-wall-slide` / `walk-phone-into-wall-slide` | desktop + phone Metal | 32–168 / 1–388 | Walking up to the living-dining window fills the entire frame with a uniform near-255 white field — no exterior, no sky gradient, no highlight rolloff; only the mullion grid reads. | `walk-into-wall-slide/sheet.png`, `phone…/worst/POP-3.png` | window glazing material + exterior/backdrop (`src/apartment/Window.tsx`, `src/materials/…windowGlassPhysical`, backdrop dome) | **high** | no |
| S2 | `orbit-tier-change-mid-drag` | desktop Metal | 47–92 | Changing the quality tier while a rotate gesture is held replaces the whole viewport with the boot splash ("Sofa So Good / Applying Realistic quality…") twice, ~2 s each, with rAF stalls of **2 167 ms** and **983 ms** and +23 / +15 program compiles. | `orbit-tier-change-mid-drag/worst/FLASH-78.png`, `STUTTER-52.png` | tier-change remount path (`src/state/slices/uiSlice.ts:534` `setQualityTier` → Canvas/Effects remount + boot overlay) | **high** | no (adjacent to GPU-STARVE; the 2 167 ms frame is above the ~2 s watchdog GPU-STARVE-1 exists to stay under) |
| S3 | `orbit-reversals` | desktop Metal | 2–43 | Rapid rotate reversals strobe: the wall-reveal fade flips a near wall between "solid dark slab over a third of the frame" and "gone" in a single frame, 8 times in 2.9 s, whole-frame mean jumping up to **54 counts**. | `orbit-reversals/worst/FLASH-4.png`, `FLASH-31.png` | wall reveal (`src/apartment/walls/wallReveal.ts`, `diffuseColor.a` fade — `src/scene/CLAUDE.md:198`) | ~~**high**~~ **REATTRIBUTED — fixed v0.35.5.0** | the stated mechanism was WRONG: see the S3 note below |
| S4 | `walk-kitchen-to-yard-door` | desktop Metal | 112–322 | Stepping out into the service yard, the exterior is a featureless pastel gradient: no neighbouring blocks, no ground, no site context — the same context orbit mode renders in full — and the parapet reads near-white. | `walk-kitchen-to-yard-door/sheet.png` | site context / backdrop visibility gating per camera mode | med-high | no |
| S5 | `orbit-pitch-limits` | desktop Metal | 120–220 | Dragging past the polar limit at a short dolly distance parks the orbit camera **inside** the flat, near-plane-slicing opaque walls, with no wall-reveal fade and no recovery from the reverse drag — 100 frames end-on into a kitchen cabinet. | `orbit-pitch-limits/sheet.png` | `src/scene/cameras/OrbitCamera.tsx` polar/min-distance clamps | ~~med~~ **FIXED v0.35.5.0** (ORBIT-SHELL-CLAMP) | no |
| S6 | all gesture clips | desktop Metal | — | `getPixelRatio()` drops 1 → **0.5** for the duration of every rotate/pan/dolly on a DPR-1 desktop (20 toggles / 23 clips) — half-resolution during every camera move. On the phone arm the same code degrades only 4 times in 15 clips, because the MOBILE-POLISH floors put `degradedDpr >= effectiveDpr`. | `events-summary.json` both arms | `src/scene/interactiveDegrade.ts:degradedDpr` + `MIN_DEGRADED_DPR` | med | by design, but the desktop/phone asymmetry is a product call |
| S7 | walk clips | all | — | `beginCameraGesture`/`endCameraGesture` are wired **only** to OrbitControls (`src/scene/cameras/OrbitCamera.tsx:821-822`), so `isCameraGestureActive()` is false for the entire walk mode — GPU-STARVE-1's gesture degrade never engages while walking, only its long-frame hold can. | `src/scene/cameraMotionSignal.ts`, walk `clip.json` DPR series | `cameraMotionSignal` wiring | med | no |
| S8 | `walk-orbit-switch-mid-gesture` | desktop + phone | ~90–200 | Flipping `cameraMode` under a live drag costs 4 FLASH, 2 RECOMPILE and 2 STUTTER (>120 ms) per switch; the gesture is not cancelled, it simply retargets. | `walk-orbit-switch-mid-gesture/events.json` | `src/state/slices/cameraSlice.ts:148` | low-med | no |
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

2. **S2 — tier change shows the boot splash for 2 s (`orbit-tier-change-mid-drag`).** A 2 167 ms
   rAF gap is not a stutter, it is the whole app unmounting and remounting: `setQualityTier` changes
   props the `Canvas`/`EffectComposer` memo keys depend on, the boot overlay re-arms, and 23 programs
   compile from cold. GPU-STARVE-1 exists precisely to keep frames under the ~2 s OS watchdog, and
   this path walks straight through it. Hypothesis: the tier switch should be a *material/pass*
   update, not a remount — freeze the composer's structural inputs the way `Effects.tsx` already
   freezes `multisampling` in a ref (the z22 fix), and gate the boot overlay on first paint rather
   than on "quality is being applied". Cheapest partial win: pre-warm the destination tier's programs
   before swapping, so the visible gap is the resize and not the compile.

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
