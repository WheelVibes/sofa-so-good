# src/scene — R3F rendering rules

Area rules for the 3D scene. System details in `docs/ARCHITECTURE.md`.

- **The main Canvas is `frameloop="demand"`** — never assume a continuous render loop.
  Anything that animates must keep `RenderPump` open (`renderDecision.ts`
  `shouldRender`/`isContinuous`/`settleTailMs`, all pure + unit-tested) and call
  `invalidate()` on change; a discrete store change already gets a short settle tail.
  Continuous-span FPS sampling is gated by `renderPumpSignal.ts` — don't sample raw frames.
  For DOM overlays that only need to appear/disappear (e.g. `FinishDragOverlay`) use a
  module-level signal (`finishDragSignal.ts` pattern: `useSyncExternalStore` subscriber +
  pure set/notify) — this avoids routing through the Zustand store and triggering
  `subscribe(markDirty)` on every drag event.
- **Asset streaming ending is itself a reason to draw (FINISH-DEFER).** `RenderPump` grants a
  short dirty tail on the FALLING edge of drei's `useProgress().active`
  (`renderDecision.ts:assetsSettleDirtyUntil` / `ASSETS_SETTLE_TAIL_MS`, pure + unit-tested): a
  surface that SUSPENDED on its textures commits its loaded material *after* the loading manager
  goes idle, so the last continuous frame predates the commit and demand mode would otherwise
  leave the new content undrawn until some unrelated change requested a frame. Any future
  load-then-commit path gets this for free — don't hand-roll a second edge detector.
- **Fixture lights are budget-capped in BOTH view modes** (`lighting/FurnitureLights.tsx` +
  pure `lighting/chooseEmitters.ts`, PERF-002). Real point/spot lights from emitting furniture
  are ranked nearest-to-camera and capped to the tier's `maxFixtureLights`: walk to N, orbit to
  `N * ORBIT_BUDGET_MULTIPLIER`. Never light every emitter (a night home reaches 30–50 — linear
  per-fragment fill cost). The pick is gated off the per-frame path (camera-move threshold +
  items-identity + mode change); keep new emitter logic going through `chooseEmitters` so the cap
  stays tier-aware and the scene never goes dark (ambient/fill + emissive materials remain).
- **Tier-gate GPU cost.** Read `RenderTier`; **Performance is the default for everyone**
  (flat: no shadows/IBL/post, DPR 1). Heavy effects (real mirrors, post stack) are
  High/Maximum only (`mirrorReflectorConfig(tier)` is the pattern).
- **Orbit + the room editor run the full walk-mode lighting simulation** (ORBIT-CEILING,
  replaces the retired ORBIT-DOLLHOUSE flat-fill). The graded sun, PCF sun shadows, day/night
  exposure grading, and day-ramped bloom apply in every view mode at every tier (still gated by
  the tier's `shadowMapSize`/`postprocessing`). Orbit culls the real ceiling so you can see in;
  an invisible shadow-casting **virtual ceiling** (`apartment/ceiling/CeilingOccluder.tsx`, planes
  from the pure `occluderRects.ts:occluderRectsForPlan`) blocks the sun from flooding in through
  the open top, so interiors are lit through windows/open doors — mounted in BOTH `Scene.tsx` and
  `RoomEditorScene.tsx`, present in walk mode too for consistency. The occluder material writes no
  colour/depth (invisible to the camera) but `castShadow` with `shadowSide: DoubleSide`. There is
  no `dollhouse.ts` module and no dollhouse module-signal anymore — do NOT reintroduce a per-mode
  lighting suppression. (The unrelated orbit *camera-framing* "dollhouse" in `OrbitCamera.tsx`/wall
  reveal is a different concept and stays.)
- **The sun shadow map is FROZEN when nothing that shapes it changes (PERF-MAX-1).** The
  directional shadow frustum is centred on the plan, NOT the camera, so a pure camera orbit /
  turntable auto-rotate / walk produces an identical depth map every continuous frame —
  re-rendering the up-to-4096² map (Maximum; 2048² High, 1024² Medium) each frame is pure waste
  (sun shadows are the profiler's #2 cost). `Lighting.tsx` sets the sun light's
  `shadow.autoUpdate = false` and only sets `shadow.needsUpdate = true` when the map can actually
  change: the day/night tween is easing (`!settled`), the light just (re)mounted, boot/warmup
  (`!sceneReady`), or the shared **shadow-refresh signal** (`shadowRefreshSignal.ts`) is active.
  That signal is pulsed (a) by `RenderPump.markDirty` for its whole settle tail — so EVERY
  discrete store change (furniture move/add/remove, plan edit, orientation, door toggle, finish,
  quality-tier remount) refreshes the map — and (b) each frame by a continuously-animating shadow
  caster (`pulseShadowRefreshForMotion` in `CeilingFan`/`StandingFan`/`Curtain`/`RollerBlind`).
  **Do NOT key the refresh off `animatedSourceCount()`** — it also counts wall-reveal fades, which
  change only opacity (three's shadow map ignores `opacity`) and fire on every orbit frame, which
  would defeat the freeze during the exact scenario it targets. Camera-only motion writes no store
  and pulses no signal, so the frozen (byte-identical) map is reused — zero visual change. Any new
  shadow-casting furniture that animates its transform without a store change must call
  `pulseShadowRefreshForMotion()` each moving frame, exactly like the fans/blinds.
- **No frame may approach the OS GPU watchdog (GPU-STARVE).** At High/Maximum a pan frame
  (DPR 2 × full-res N8AO × bloom × SMAA × transmission) can hit seconds on an iGPU; frames
  crossing the watchdog (~2 s Windows TDR) reset the driver → WebGL context loss → the canvas
  blanks white ("white flash while panning"). Two mechanisms, keep both intact:
  (1) `InteractiveDprController` (both Canvases, `interactiveDegrade` flag) halves the pixel
  ratio while a camera gesture is held (`cameraMotionSignal.ts` ← OrbitControls
  `onStart`/`onEnd`) and for 3 s after any >250 ms rendered frame (pure, unit-tested decision
  in `interactiveDegrade.ts`; never during recording; a long-frame delta is only trusted when
  the PREVIOUS frame was also continuously driven — the first gesture frame's dt spans the
  idle demand-mode gap and recorded phantom long frames). New camera-control surfaces must
  publish their gestures to `cameraMotionSignal`. (2) `ContextLossGuard` (both Canvases)
  rebuilds after a restore: shadow-refresh pulse (the frozen map would stay stale forever) +
  `contextRestoreSignal` bump (`SceneEnvironment` keys `<Environment>` on it —
  render-target-only resources don't survive a loss) + a frame-COUNTED pump hold (≥8 frames
  AND ≥1.5 s; a timed hold can elapse before a slow renderer's bake frame ever runs). Guard
  scenario: `scripts/scenarios/context-restore-rebuild.json`. Any new render-target-backed
  bake (probes, PMREM, accumulation) must subscribe to `contextRestoreSignal` or it will come
  back black.
- **Every drawing-buffer resize must repaint in the SAME task, and the interactive degrade is
  raw-GL-only (GPU-STARVE-3).** Resizing the drawing buffer (any `gl.setSize`/`setPixelRatio`,
  including r3f-internal ones) CLEARS it; in demand mode the scheduled invalidate renders on the
  NEXT rAF, so the browser composites a blank page-white canvas in between — at Maximum the
  first full-res frame after a restore takes hundreds of ms, so every degrade/restore toggle,
  tier switch, and DPR stomp flashed white ("white flickering in orbit/room editor at
  Maximum"). Three rules, probe-verified (`scripts/scenarios/interactive-dpr-seamless.json`,
  microtask-vs-frame-count probe — a microtask scheduled inside a resize runs before that
  task's composite):
  · Any code that resizes the buffer must synchronously `advance(performance.now(), true)`
    afterwards (guard: `!document.hidden && gl.domElement.isConnected`, try/catch) —
    `InteractiveDprController.apply` and `QualityController`'s clamp (a `useLayoutEffect`, NOT
    `useEffect` — plain effects run one composite late) are the two models.
  · The interactive degrade goes through **raw `gl.setPixelRatio`, never r3f `setDpr`**, plus
    the same-value r3f `setSize` nudge (`@react-three/postprocessing`'s composer only re-sizes
    its buffers on a `size` identity change and re-reads the drawing buffer; the nudge skips
    the GL resize for identical values so the raw ratio survives). Reason: r3f's root
    `configure()` re-runs on EVERY Canvas commit and calls `setDpr` whenever the `dpr` prop
    VALUE differs from `viewport.dpr` — a degrade held in r3f state was stomped back to full
    (buffer clear, no repaint, then a heal re-resize) by any store-driven Canvas re-render
    mid-gesture. Keeping `viewport.dpr` at the full clamp makes `configure()` a no-op.
  · The Canvas `dpr` prop (memoised `[1, dprMax]`) must always evaluate to the same value as
    `QualityController`'s `setDpr(min(devicePixelRatio, dprMax))` clamp, or `configure()`
    stomp-resizes on every commit (bites on hi-DPI devices if the prop is dropped — r3f's
    default is `[1, 2]`).
- **The post stack owns the view transform; the tiers below it use `gl.toneMapping` (TONE-POST).**
  three applies `renderer.toneMapping` **only when `_currentRenderTarget === null`** (straight
  from `WebGLRenderer.getProgram`: `if (material.toneMapped) { if (_currentRenderTarget === null
  || isXRRenderTarget) toneMapping = _this.toneMapping }`). Under `<EffectComposer>` the scene
  renders into an off-screen HalfFloat target and `postprocessing`'s `EffectMaterial` sets
  `toneMapped: false`, so High/Maximum ran with **no view transform at all** — raw linear HDR
  straight to the display, and `Lighting`'s per-frame `gl.toneMapping`/`gl.toneMappingExposure`
  writes (the entire `grade()` + user-exposure + `toneExposureBias` model) were dead code on
  exactly the tiers meant to look best. Measured at 13:00 on a Mac mini M4, fraction of
  pure-white pixels: Performance/Medium 3.4% vs High/Maximum **31.8%** — the reported
  "lighting is too aggressive on the higher tiers", and why the best tiers looked *less* real
  than the flat one. `EffectsImpl` therefore mounts a `<ToneMapping>` effect
  (`toneMappingPost.ts` maps the pure `ToneMappingMode` → the `postprocessing` enum, the twin of
  `toneMappingThree.ts`), driven by the **same** `resolveToneMapping` call `Lighting` uses so the
  look doesn't jump across the tier boundary. Exposure needs no new plumbing: the effect's shader
  `#include`s three's `<tonemapping_pars_fragment>`, whose operators all multiply by the
  `toneMappingExposure` uniform the renderer already uploads. **Effect order is load-bearing** —
  AO / DoF / Bloom are scene-referred and must come BEFORE the tone mapper; HueSaturation /
  ChromaticAberration / Vignette / Noise / SMAA are display-referred and must come AFTER.
  `postStackGuard.test.ts` pins both the presence and the ordering.
- **`<Bloom mipmapBlur>` is banned — it blanks whole frames on ANGLE/Metal (BLOOM-MIP-FLASH).**
  Its `MipmapBlurPass` rebinds a chain of ~15 differently-sized half-float render targets every
  frame; on Apple silicon that intermittently leaves the combined `EffectPass` shader sampling an
  unready blur texture, and since the composer's final blit runs regardless, the garbage lands on
  the default framebuffer and the WHOLE canvas goes blank. With `alpha: true` (r3f's default,
  which the orbit view relies on to show the page background around the model) that reads as the
  light page colour — the reported **"white flashes when rotating the view in orbit mode"** on
  the higher tiers. Blank frames per 78 captured during a real orbit drag at Maximum: full stack
  **4/78** (7/78 at night), Bloom alone **5/78**, everything-except-Bloom **0/78**, Bloom with
  `mipmapBlur={false}` **0/78**. Performance/Medium never flashed — they mount no composer, which
  is why the report was tier-specific. Ruled out first, so don't re-litigate them: WebGL context
  loss (`webglcontextlost` never fired), drawing-buffer resizes / the DPR degrade (no
  `setSize`/`setPixelRatio` anywhere near a blank frame, and turning `interactiveDegrade` OFF made
  it *more* frequent), `EffectPass` rebuilds (`EffectsImpl` re-renders 0 times during an orbit),
  every other pass individually, mip `levels` 5/6/7, and `alpha: false` (which only changed the
  flash colour to black). Bloom also only MOUNTS when `bloomActiveForDay(dayLevel)` — in daylight
  the ramp has zeroed its intensity, and an intensity-zeroed Bloom is not inert (its blur texture
  is still sampled by the combined shader). Repro/verify: `node scripts/dev-probes/blank-cause.mjs`.
- **Curtains dim the FILL, never the sun (KEY-FILL-BALANCE).** `curtainLightEffect` used to
  multiply the sun `DirectionalLight`'s intensity by `sceneAttenuationFactor` — the scene-wide
  AVERAGE curtain transmission. Two problems: that light *is* the sun (so one drawn bedroom
  curtain darkened the building's exterior too), and it is the **only shadow-casting light in the
  scene** — everything else (hemisphere, ambient, the IBL probe) is non-directional fill that
  casts nothing. On the default furnished 4-room flat at 09:00/Maximum that left sun 0.41 against
  ~1.10 of fill: a key:fill ratio of **0.37:1**, at which a cast shadow can only remove a small
  fraction of a surface's light and reads as a faint tint or not at all. (An earlier revision of
  this note cited "0.47% of pixels" for the shadow map's contribution; that figure came from a
  probe whose "shadows on" arm cleared the override by writing `undefined`, which SETS
  `shadowMapSize` to undefined and turns shadows off — so both arms were shadowless and the
  difference was noise. See QUALITY-OVERRIDE-UNDEF. Re-measured properly, the conclusion holds:
  see the feature-pricing bullet below.) The attenuation now
  rides the fill (`Lighting`'s hemisphere + ambient via `fillScale`, and
  `SceneEnvironment`'s `scene.environmentIntensity`) through the pure `look.windowFillAttenuation`,
  which is the light curtains actually block — diffuse skylight through the glass. Same magnitude,
  correct light: contrast (pixel σ) rose ~21% at Performance and ~10% at Maximum for a ~2-point
  mean-brightness cost. Measure with `node scripts/dev-probes/shadow-contribution.mjs`.
- **Re-pick the fixture lights when the TIER changes, and INVALIDATE when the set changes
  (LIGHT-BUDGET-REPICK / LIGHT-SET-INVALIDATE).** `FurnitureLights` gated its nearest-N re-pick on
  items / camera-mode / mood / camera-moved — but NOT on `maxLights`, the tier's
  `maxFixtureLights`. So a tier change left the OLD tier's light count mounted until the camera
  next moved. Measured switching to Performance: **18 point lights stayed live** (medium's 6x3
  orbit budget) and only dropped to Performance's 6 on the first camera gesture — which recompiled
  every lit material in one **150 ms** frame, because three bakes the light count into each
  material's program cache key. Two bugs in one: the tier's perf budget was not being honoured, and
  the scene was over-lit by 3x until the user happened to move.
  Separately, the live set lives in REACT state, so `RenderPump`'s `subscribe(markDirty)` never saw
  it change — under `frameloop="demand"` a newly-mounted light requested no frame at all, so three
  never saw the new count and the compile was deferred to whatever rendered next (the user's first
  gesture). Both fixed: `maxLights` is in the change check, and `invalidate()` is called whenever
  the set changes. Measured across all three tiers, worst frame during a gesture:
  Performance **150.6 → 11.7 ms**, High **142 → 22.4 ms**, Maximum **213 → 17.7 ms**; programs
  compiled per gesture 25–29 → **1**; zero spikes over 25 ms anywhere; p50/p90 unchanged. The
  visual side-effect is a real correction, not a regression: Performance's contrast rose 27.2 → 36.8
  and its mean fell 237.4 → 233.4 once it stopped rendering three times its light budget. Medium and
  Maximum are byte-identical. Any future per-frame pick that depends on a tier value needs the tier
  in its change check, and any React-state scene change needs an `invalidate()`.
- **Never let the LIGHT COUNT change during interaction (LIGHT-COUNT-STABLE).** three bakes the
  number of point/spot lights into every lit material's program cache key, so adding or removing a
  single light recompiles EVERY lit material. `FurnitureLights` re-picks the live emitter set
  whenever the camera moves past a threshold, so a ±1 change is routine while orbiting — and it
  cost **204–214 ms on the first frame of the first camera gesture, compiling +29 programs**
  (`scripts/dev-probes/frame-spikes.mjs`). Steady state either side of that frame was ~11 ms, so
  this single stall WAS the defect: invisible to a p90, and landing exactly when a user forms an
  impression. Diffing the program cache keys named it precisely — all 29 differed in one field,
  `18 -> 19`, a light count incrementing.
  The fix is `chooseEmitters.ts:lightSlotCount`: render a QUANTISED number of slots
  (`LIGHT_SLOT_STEP` = 4) and pad the spares with zero-intensity point lights, which three counts
  regardless of intensity (`WebGLLights.setup` increments `pointLength` unconditionally). Measured
  after: programs compiled during a gesture **29 → 1**, worst frame **213 → 32 ms** (and 13.5 ms in
  a later run), p50/p90 unchanged within noise, and the rendered image byte-identical (medium
  236.29/27.89/6.85%, maximum 223/29.56/1.49% — same as before the change). Do NOT pad to the full
  tier budget (up to 36 slots in orbit at Maximum): that makes the count perfectly stable but forces
  the shader to evaluate every slot per fragment for the whole session, trading a one-off compile
  for a permanent cost. Any future feature that varies a light count at runtime needs the same
  treatment.
  Ruled out along the way, don't re-investigate: the mirror gate (0 of ~1480 orbit frames granted a
  reflection); wall-reveal material CLONES (a census showed +0 materials across the gesture, so
  nothing is being created); and `material.transparent` flipping (it IS in the cache key via
  `opaque`, and pre-warming the opposite variant compiled 15 extra programs at boot but moved the
  spike not at all — the remaining 29 were the light count).
- **`ShaderWarmup` pre-compiles the transparent variant at boot.** It flips every scene material to
  `transparent: true`, compiles, and restores — all in ONE task, so no frame renders in the flipped
  state. This is a smaller win than LIGHT-COUNT-STABLE and was kept because the reveal genuinely
  does flip `transparent` on ~15 materials' worth of programs. An earlier version that called
  `compileAsync` in the CURRENT state was reverted for doing nothing: warming the variant already
  being rendered is by definition warming the one already compiled.
- **Ambient occlusion is available BELOW the post tiers (TIER-AO).** `QualitySettings.ao` is
  separate from `postprocessing`: `medium` has `ao: true, postprocessing: false`, which mounts a
  MINIMAL composer — N8AO + the tone mapper + HueSaturation and nothing else. This matters because
  `medium` is the tier the adaptive ladder auto-selects for most browsers, and because interiors
  here are fill-lit, so AO is the only pass that gives a room corners or grounds furniture on the
  floor. Measured at Medium (`feature-price.mjs`, idle, 09:00): **2.2 ms for pixels>8 = 25.81% /
  meanAbsDiff 12.94** against a ~0 noise floor — the best value-per-millisecond of anything in the
  stack by a wide margin (post stack 5.7 ms for 7.35, IBL 2.2 ms for 3.16, sun shadows 2.9 ms for
  0.61). Medium sits at 8.4 ms p90, half the 16.67 ms budget, still 59.9 drawn fps. Two traps when
  touching this path:
  · **The tone mapper is mandatory in AO-only mode.** Mounting ANY composer disables three's own
    view transform (TONE-POST), so an AO-only path without `<ToneMapping>` would blow Medium's
    highlights exactly the way High/Maximum used to.
  · **Antialiasing must be REPLACED, not dropped.** The Canvas is created `antialias: true`, but a
    composer renders into its own off-screen target so that MSAA stops applying. SMAA belongs to
    the full stack, so the AO-only path sets `multisampling={4}` on the composer instead —
    otherwise adding AO would visibly WORSEN Medium's edges, shipping a regression as a feature.
  `postStackGuard.test.ts` pins both.
- **What actually suppresses interior cast shadows — measured, and it is NOT what it looked like
  (INTERIOR-SHADOW).** Run `scripts/dev-probes/interior-shadow.mjs`, an isolating ladder that
  toggles the occluder's `castShadow` live (occluder meshes are identifiable at runtime: theirs is
  the only material with `colorWrite: false` AND `opacity: 0`) and forces the frozen shadow map to
  rebuild. At Maximum, 09:00, ORBIT, against a 0.18 meanAbsDiff noise floor:

  | comparison                                   | pixels>8 | meanAbsDiff |
  | -------------------------------------------- | -------- | ----------- |
  | sun shadows, WITH sun reaching the interior   | 8.31%    | 3.17        |
  | what the ceiling occluder blocks              | 3.94%    | 2.51        |
  | frozen map vs forced-fresh map                | 0.02%    | 0.18        |

  Three conclusions, two of which kill earlier theories:
  · **PERF-MAX-1's frozen shadow map is CORRECT.** Forcing `shadow.autoUpdate = true` changes the
    image by 0.02% / 0.18 — i.e. nothing. The suspicion that the map was captured before furniture
    finished streaming and then never refreshed is disproved; don't re-litigate it.
  · **The CeilingOccluder is not the main villain.** It blocks a real but modest amount (3.94% /
    2.51), and disabling it does NOT produce furniture-on-floor cast shadows — A and B are
    near-identical by eye. It is also self-limiting by geometry: it only blocks rays arriving
    steeply from above, so it matters most near solar zenith and little at low sun.
  · **The residual flatness is NOT the key:fill ratio either.** An earlier revision of this note
    said the sun was "~0.99 against ~1.1 of fill" — that was wrong, and wrong in an instructive
    way: it quoted the PRE-KEY-FILL-BALANCE fill numbers next to a POST-fix sun. Measured live
    (`scripts/dev-probes/light-balance.mjs`): sun 0.985–1.000 against fill 0.455–0.457, i.e.
    **2.17–2.19:1 in daylight** — a healthy photographic ratio that KEY-FILL-BALANCE already
    achieved. Pushing it further would only risk the blown highlights fixed in v0.31.0.0. The
    reason interiors stay flat is simpler: indoors the sun reaches almost nothing (real ceiling in
    walk, occluder in orbit, walls everywhere), so the ratio has nothing to act on and interiors
    are effectively fill-ONLY. The only thing that shapes fill-only lighting is ambient occlusion
    — see TIER-AO below.
  · **In WALK mode this ladder is uninformative** — the REAL ceiling exists there (only orbit culls
    it), so disabling the virtual occluder changes nothing and every comparison sits at the noise
    floor. Run it in orbit.
- **Sun-shadow map resolution tracks TEXEL DENSITY, not the tier (SHADOW-TEXEL).**
  `Lighting` no longer uses `quality.shadowMapSize` literally — that value is now the CEILING, and
  the actual size comes from `lighting/shadowFrustum.ts:shadowMapSizeForExtent(halfExtent, tierMax)`,
  which targets a constant ~20 mm world-space texel (`SHADOW_TEXEL_TARGET_M`) over the plan-fitted
  frustum. A fixed per-tier number meant the same setting gave wildly different quality depending on
  plan size: 4096 over the default flat is 4.6 mm/texel, the same 4096 over a 40 m custom plan is
  19.5 mm/texel. Now the default flat resolves to 1024 at every tier and a 40 m plan scales up to
  its tier ceiling. Justification is measured, in WALK mode at 09:00 standing next to furniture —
  the viewpoint where a contact shadow is actually judged — sweeping 4096/2048/1024/512
  (`scripts/dev-probes/walk-shadow.mjs`): living-room meanAbsDiff **0.43 / 0.21 / 0.43 against a
  0.35 noise floor**, with NO monotonic degradation (512 was no worse than 2048). Two reasons it
  doesn't show: Medium+ run VSM with `radius: 6`/`blurSamples: 12`, a blur wide enough to discard
  the extra texels; and the virtual ceiling occluder leaves interiors lit almost entirely by
  non-shadow-casting fill, so there is very little cast shadow indoors to resolve at all. Re-verify
  with `walk-shadow.mjs` before touching the target density. **Verified saving** (idle machine,
  `with-server.sh frame-time.mjs`, p50/p90): Maximum 11.1/11.7 → **9.0/10.1 ms** and its worst
  frame 21.9 → **16.8 ms**, i.e. back inside the 16.67 ms budget instead of over it; High 8.1/8.9 →
  8.1/8.7 (it only went 2048 → 1024, so a smaller win); Performance and Medium unchanged as
  expected. All four tiers now hold ~59.8 drawn frames/s.
- **Surface materials are NOT broken — measured, don't re-audit (MATERIAL-AUDIT).**
  `scripts/dev-probes/material-audit.mjs` walks the live scene graph and reports which PBR maps are
  actually bound, classified GEOMETRICALLY (r3f meshes carry no `name`, so a name-based classifier
  reports everything as "other"). At Medium, after texture streaming settles: walls 114 meshes with
  25 albedo / 59 normal / 51 roughness; large floors 4 with 1 / 3 / 1; furniture+other 962 with
  169 / 312 / 215. **`aoMap` is bound on ZERO materials** at any tier. Zero failed non-font
  requests, anisotropy up to 16, 138 textures uploaded at 1024². So most walls are flat near-white
  solids by AUTHORING (a solid albedo plus a subtle normal/roughness is a defensible model for
  painted plaster), not by a load failure — and the missing `aoMap` matters much less now that
  screen-space AO runs from Medium up (TIER-AO). Changing the default flat's wall finishes to
  textured plaster is a CONTENT decision, not a bug fix; don't file it as one.
  Two follow-ups measured the same walls further, and both landed against the obvious guess:
  · **The wall's responsive channel is the NORMAL, not the albedo** (`wall-detail.mjs`). The
    prediction was the opposite: since interiors are fill-lit and `AmbientLight` is perfectly
    direction-independent, a normal map "should" be invisible indoors. Measured at walk/Medium/
    09:00 against a 0.80 meanAbsDiff noise floor: `normalScale` x6 moved the image **6.21**
    (20.4% of pixels), removing the normal map entirely moved it **1.86**, and adding a subtle
    albedo mottle moved it **2.31 but with only 0.64% of pixels past the threshold** — i.e. a
    broad ~1% darkening rather than visible detail. So the plaster normal IS doing work (the IBL
    probe is directional enough to reveal it) and there is no missing-albedo problem to fix. x6
    is also plainly gaudy on inspection — popcorn-ceiling stucco — so the shipped strength is
    about right. Don't "add an albedo texture to the walls"; it buys a tint, not detail.
  · **What DID read as cartoon was a colour cast, and it came from ONE default finish.** See
    WARM-WALL-CAST in `src/materials/CLAUDE.md`, plus the two probes that found it:
    `chroma-audit.mjs` (raycast a screen grid, rank materials by coverage x saturation — the
    rendered frame carried mean chroma 0.206 while every high-coverage albedo sat at ≤0.22) and
    `warm-cast.mjs` (separates the illuminant's share from the finish's; the illuminant owned
    0.003 of it). `pick-surface.mjs` resolves an NDC point to a furniture `defId` + its exact
    material values, which is how "those two saturated orange blocks" became "dining-chair
    backrests at 1.75 m". Prefer these to eyeballing a still.
- **Price a render feature in BOTH currencies, and against a measured noise floor**
  (`scripts/dev-probes/feature-price.mjs`). It applies one `qualityOverrides` change at a time and
  reports p90 frame cost in ms alongside two visual metrics. Measured at Maximum, 09:00, DPR 2,
  `interactiveDegrade` pinned off:

  | feature removed        | Δ p90    | pixels>8 | meanAbsDiff |
  | ---------------------- | -------- | -------- | ----------- |
  | sun shadows (4096 → 0) | −2.9 ms  | 0.84%    | 0.61        |
  | post stack             | +5.7 ms  | 20.0%    | 7.35        |
  | IBL probe              | +2.2 ms  | 10.2%    | 3.16        |
  | *baseline repeated*    | ±1.3 ms  | 0.12%    | 0.27        |

  The repeated baseline IS the noise floor — quote it, or a 0.6 reading looks meaningful when it is
  barely 2x noise. On that basis **the sun shadow map is the worst value-per-millisecond feature in
  the stack** (and 09:00 is its best case; at 13:00 the near-zenith sun is fully blocked by the
  virtual ceiling occluder). At 13:00, `shadowMapSize` 1024 and 2048 were both visually
  indistinguishable from 4096 (0.07% pixels) while ~3 ms cheaper — a resize is the obvious next
  move, but it must be verified in WALK mode first, since these numbers are all orbit-only and map
  resolution buys sharpness exactly where a close-up contact shadow is judged.

  Four ways this probe lied before it was trustworthy — check all of them in any new one:
  · **Clear overrides with `resetQualityOverrides()`, never by writing `undefined`** (see
    QUALITY-OVERRIDE-UNDEF) — otherwise every case after the first silently ran with shadows and
    the whole post stack disabled.
  · **Reset the camera to a fixed pose before every capture.** Diffing stills taken from wherever
    the previous case's orbit ended reported 48–70% "pixels changed" for every feature, including
    ones that barely touch the image.
  · **Pin `interactiveDegrade` off.** It halves DPR during a gesture but only at the post tiers, so
    the moment a case flips `postprocessing` the comparison is between two different resolutions —
    which measured "turning post off costs +7.6 ms".
  · **Discard a warm-up pass and repeat the baseline at the end.** The first measured case pays
    shader compilation: the baseline read 16.8 ms first and 12.0 ms warm, making every later case
    look ~3 ms cheaper than it was.
- **The tier is chosen by MEASURING FRAMES, not by detecting hardware (TIER-ADAPTIVE).**
  This replaces both the old unconditional `performance` default and the capability-detected
  default that briefly followed it. Rationale in `adaptiveTier.ts`; the short version is that in
  a browser the hardware isn't legible — `WEBGL_debug_renderer_info` is deprecated in Firefox and
  slated for removal, disabled by `privacy.resistFingerprinting`, farbled by Brave, and generic on
  Safari — and hardware identity is the wrong KIND of signal anyway (the thing actually capping the
  post tiers was a mirror's extra scene pass, a *content* cost, and 7x the viewport pixels moved
  the frame budget by ~9%). `quality.ts:capabilityCeilingTier` survives only as a best-effort
  **veto** (software rasteriser / phone / no-WebGL2 / <4 cores → `performance`; everything else →
  `high`, meaning "no opinion"). First visit boots `initialAutoTier` (conservative `medium`);
  `QualityController` then walks the ladder both ways and the settled tier persists, so a repeat
  visit skips the ramp (`qualityAutoSettled` stops the boot pick stomping it).
- **The ladder's signal is frame COST in ms, never frame RATE (`scene/frameCost.ts`).** This Canvas
  is `frameloop="demand"`, so rate measures how often the pump chose to draw, not how fast the
  device can draw: measured 59.7 rAF/s against **30.5 actual renders/s while each frame cost
  5.7 ms**. A rate-based guard reads that as "30 fps, failing" and demotes a scene using a third of
  its budget — the first cut of this ladder did exactly that, walking Medium down to Performance on
  hardware with two tiers of headroom. Rate is equally useless upward because vsync clamps it
  (Performance and Medium both report exactly 60). True p90 cost per displayed frame on the M4
  reference machine at 2560x1600: performance 4.7 ms / medium 6.0 / high 8.9 / maximum 11.7,
  against a 16.7 ms budget. The meter wraps `renderer.render` and **SUMS every call inside one
  animation frame** — the post stack issues ~18 SIBLING render calls per frame, so per-call timing
  reports the parts and inflates the apparent rate to ~1000/s. Because an idle demand-mode frame
  renders nothing and therefore contributes no sample, cost-based sampling also removed the need
  for the old `isRenderingContinuously()` gate. Any future adaptive-quality logic must read cost,
  not rate. Verify end-to-end with `scripts/dev-probes/tier-ladder.mjs` (add `CPU=6` to throttle
  and exercise the DOWNWARD half) and `frame-time.mjs`.
- **Promotion is a PROBE with a LEARNED CEILING.** Cost tells you what the current tier uses, not
  what the next one would cost (the step between rungs is content-dependent), so the ladder steps
  up on evidence and steps back if it doesn't hold. Oscillation is therefore the real risk, and it
  is prevented by `autoMaxTier` — the rung that FAILED, persisted per device and never retried —
  **not** by a wider threshold. `autoMaxTier` must never be set on the way UP: conflating "highest
  reached" with "learned ceiling" caps the ladder at the rung it just reached, so `performance`
  would climb to `medium` and then never to `high`. `maximum` is never auto-selected. Verified:
  unthrottled boots `medium` → promotes to `high` at ~11 s and holds; at `CPU=6` it demotes to
  `performance` at ~8 s, learns the ceiling and holds; both survive a reload.
- **The adaptive FPS guard is deaf during boot warm-up (`FPS_GUARD_WARMUP_MS`, 5 s after
  `sceneReady`).** It samples only while the pump renders CONTINUOUSLY — and boot is exactly
  that (loader overlay, asset streaming, shader compilation, the first shadow/IBL bakes), at the
  least representative moment there is. This never mattered while everyone booted at Performance
  (no tier to step down from); the moment TIER-AUTODETECT landed, the guard walked the detected
  tier straight back down during warm-up and capability detection looked broken. Gate is the pure
  `shouldSampleFps(sceneReady, msSinceReady)`.
- **Bloom only blooms genuine HDR emitters, never broad daytime surfaces** (RD-409). The
  Bloom `luminanceThreshold` (`look.BLOOM.luminanceThreshold`, 1.35) sits **above** sunlit
  white walls/ceilings under the day IBL + ~1.2 graded exposure and **below** the night
  light-fixture emissive peaks (`lighting/fixtureGlow.ts` — shade ~1.6 / strip ~1.8 / bulb
  ~2.05). A lower threshold (the old 1.05) smeared a milky white veil across the whole
  High/Maximum frame in daylight. Orbit now runs this same full graded simulation + virtual
  ceiling (ORBIT-CEILING) rather than a flat dollhouse fill, so the threshold applies
  identically in every view mode. The two live in lock-step: the `fixtureGlow` test asserts
  `BLOOM_LUMINANCE_THRESHOLD === look.BLOOM.luminanceThreshold` and that every emitter peak
  clears it with margin — **raise/lower one and you must move the other**, or daytime blooms
  again or fixtures stop glowing.
- **No `AccumulativeShadows` ground catcher** (RD-410, retired). It assumed one hero object
  over an empty floor; for a whole apartment (own floor + real PCF sun shadows + contact
  shadows + corner AO) its 19 m catcher plane caught the building silhouette and drew a large
  dark rectangle on the ground, bigger than the footprint. `ShowcaseController` renders
  nothing and pins `showcaseAccumulating=false`; the `showcase` quality flag is `false` on
  every tier. Grounding comes from the cues above — don't reintroduce a scene-wide
  shadow-catcher plane.
- **Cheap baked AO on the flat tier.** With no SSAO on Performance/Medium, grounding is
  faked with shared-texture alpha decals: `ContactShadow.tsx` (under-furniture blob, RZ1; also a
  fainter/tighter **surface decal under small decor** resting on a table/shelf — PC2-CONTACT-AO-DECOR,
  qualified by the pure `furniture/surfaceDecal.ts` and rendered from `furniture/Furniture.tsx`).
  One shared `CanvasTexture`, a single transparent plane each, `depthWrite:false` +
  `polygonOffset` + small `+Y`. When adding a new baked-AO cue, follow this pattern (shared
  texture, tier-gate off where real AO runs) — never per-instance textures. The wall/floor
  **corner-AO strip is retired** (RD-403, removed v0.23.1.11): from a top-down/plan camera the
  0.32 m gradient read as a hard black outline hugging every wall base, and it only ever ran on
  the tiers with no SSAO — don't reintroduce a baked wall-base darkening decal.
- **Tone mapping is context-aware** (`toneContext.ts`, pure + unit-tested). The stored user
  setting is `ToneMappingSetting` (`auto` | filmic | agx | neutral); `Lighting` resolves the
  concrete operator each frame via `resolveToneMapping(setting, ctx)` — never read `st.toneMapping`
  raw for the renderer. An explicit pick wins; `'auto'` picks Neutral while previewing finishes,
  AgX for a photo context, else filmic. Keep `look.ts` pure (no three) — the three constant comes
  from `toneMappingThree.ts`.
- **The orbit surround is an ANALYTIC sky with no ground (SKY-ANALYTIC-ORBIT) — the drei `<Sky>`
  dome it replaced was blown out to a colourless white (SKY-BLOWN, resolved v0.31.5.19).** Worth stating because it is easy to assume the opposite in both directions. It is
  NOT a flat gradient or the page background: `lighting/Sky.tsx` mounts drei's `<Sky>` — a Preetham
  atmospheric shader fed by `altitudeCurve.ts:skyFromAltitude` — and it responds to the clock
  (sampled at the dollhouse background, luma 81 at 06:00 and 21:00 against ~232 at 13:00).
  But at 13:00 its ZENITH measures rgb 229/232/233, HSV saturation **0.017**, and is
  indistinguishable from the horizon (0.017 vs 0.021) when Preetham should show a strong blue
  gradient between them.
  · **Not the tone curve.** The zenith is washed out under all three operators — filmic **0.008**,
    AgX 0.017, Khronos Neutral 0.073 — so AgX is actually the best of them and TONE-CURVE-CHOICE is
    not implicated.
  · **Not the scattering parameters either, and this is the counter-intuitive part.** Sweeping the
    live shader uniforms (`scripts/dev-probes/sky-tune.mjs`), raising `rayleigh` — the BLUE
    scattering term — from the shipped 1 through 2 / 3 / 4 made it monotonically WORSE
    (sat 0.017 → 0.008 → 0.004 → 0.004), because more scattering means more total radiance and the
    dome climbs further onto the operator's shoulder. Every arm sat at luma 234–237, pinned near the
    top of the range. `turbidity` 3 changed nothing.
  · **And the radiance is not the lever either — the dome emits genuinely WHITE light.** Scaling
    `toneMappingExposure` live (`sky-tune.mjs EXPOSURES=`) is monotonic but far too weak: a **4x**
    cut (x0.25) lifts zenith saturation only 0.017 → **0.041**, with luma still 193. If the sky were
    a saturated blue merely rolled off by the operator, dimming would reveal the blue. It does not,
    so the shader's per-channel ratio is ≈1:1:1 before any transform.
  · **Not a near-sun aureole either.** Preetham is legitimately white close to the sun, and Singapore
    at 13:00 has the sun near the zenith — but measured across altitudes the zenith saturation is
    0.027 / 0.024 / 0.017 / 0.014 / 0.007 at 08:00 / 10:00 / 13:00 / 16:00 / 18:00. Never above 0.03,
    so there is no hour at which this sky is blue.
  · **A FIFTH attempt was made and REVERTED: painting the in-repo analytic equirect as the orbit
    `scene.background`.** `lighting/skyGradient.ts` is the right colour source — sampled headlessly
    it gives zenith saturation 0.54–0.68, a pale horizon (0.09–0.23) and a warm low-sun horizon
    (0.63), all in a controlled LDR range. But `paintSkyEquirect` fills the **lower hemisphere with
    a ground tint**, and the orbit camera looks DOWNWARD at the dollhouse, so the visible background
    is mostly below the horizon: the flat rendered on a dull brown-grey (zenith sample 175/165/152,
    warm r>g>b) which is worse than the white it replaced. An equirect built for a walk-mode WINDOW
    view is the wrong shape for a top-down orbit. Whatever replaces the dome must be sky-only, or
    must orient/clamp so the camera never sees the ground half.
    · Two gating traps found on the way, both worth remembering: the first attempt gated the orbit
      surround on the `proceduralSky` flag and measured BYTE-IDENTICAL, because that flag is
      `tier: 'pro'` and **Simple mode — the app default — forces pro flags off**. Anything that
      changes the DEFAULT look must not sit behind a pro-tier flag. And `Sky.tsx`'s dome is what
      actually fills the orbit background, not the page behind the alpha canvas: hiding it changes
      the sampled pixels from 231.9/235.0/236.0 to the page's warm 234/219/209.
  **Five hypotheses tested and rejected: the tone curve, the scattering parameters, the global
  exposure, the sun-angle, and reusing the walk-mode equirect. Do not re-test them.**
  **RESOLVED** by `lighting/skySurround.ts` + a rewritten `lighting/Sky.tsx`: a `BackSide` sphere
  mapped with a small (256x128) equirect baked from `paintSkySurround`, which is `skyRadiance` above
  the horizon and a DIMMED CONTINUATION of the horizon below it (never a ground tint), re-baked
  debounced through the same `shouldRebuildSky` predicate the walk backdrop uses. Verified: the
  interior is **byte-identical** — an interior-only region at orbit/Medium/13:00 reads mean 191.43,
  sigma 36.43, clipped 1.124%, chroma 0.162 both before and after — which is the safety property
  claimed above (background only, no `scene.background` / `scene.environment` writes). Frame cost
  unchanged (4.5/4.8, 8.4/9.0, 10.4/10.9, 11.4/12.0 ms p50/p90). Night is the biggest visible win:
  a deep dark surround with the lit flat glowing against it, instead of the old flat grey.
  · **It is not blue, and should not be.** The orbit camera is pitched ~25 degrees DOWN, so every
    visible background direction is at or below the horizon, where a real sky IS pale. Sampling the
    top of the frame is sampling the horizon, not the zenith — an earlier round mislabelled it.
  · Two bugs the unit tests caught, both worth keeping in mind for any similar spherical sampling:
    passing `[v.x, EPS, v.z]` as a "horizon" direction does NOT give a constant elevation, because
    `v` is a unit vector whose horizontal length shrinks as it tilts — the effective elevation drifts
    into Perez's steep near-horizon region and the surround came out non-monotonic. And at the exact
    nadir the azimuth is undefined, where a `|| 1` divisor fallback collapses the sample to the
    ZENITH, making the underside the BRIGHTEST part (0.552 against 0.370). What remains is that the app's exposure (1.38)
  is tuned for interiors and this dome's absolute output is simply in a different range — which means
  a fix is a DESIGN change (render the sky through its own exposure / replace the drei dome with the
  in-repo analytic `lighting/skyGradient.ts` painted at controlled values, as the walk-mode `sky`
  backdrop already does), not a parameter tweak. Two rounds went into parameter tweaks; start from
  the design if this is picked up again.
  · One probe note worth keeping: `sky-tune.mjs` re-asserts its uniforms INSIDE a wrapped
    `renderer.render`, because `<Sky>` is a React component and drei re-applies `rayleigh` et al.
    from props on every re-render — and the `setManualHour` nudge used to force a frame IS a store
    change. The corrected sweep reproduced the naive one exactly, so that race did not bite here,
    but the pattern is the same one that invalidated `warm-cast.mjs`'s first illuminant arm.
  **The safety fact that makes such a change cheap:** this dome is purely visual. `Sky.tsx` renders
  geometry and writes neither `scene.background` nor `scene.environment` — the IBL is the separate
  procedural Lightformer probe in `SceneEnvironment.tsx`. So dimming it cannot disturb interior
  lighting, the key:fill ratio, or the bloom lock-step (RD-409); only the background pixels move.
- **Backdrops paint `scene.background` only — never `scene.environment`.** Walk-mode
  surroundings (`SceneBackdrop.tsx`) bake an equirect into `scene.background`; the static photo
  presets (`backdropEquirect.ts`/`backdropHorizon.ts`) and the sun-driven `sky` (RD-412,
  `proceduralSky` flag) both follow this. The `sky` math is pure + headless
  (`lighting/skyGradient.ts` analytic Preetham, `lighting/skyRebuild.ts` rebuild predicate); the
  baker re-paints debounced when the sun crosses the threshold and **disposes the old texture**.
  The IBL/PMREM/bloom/exposure path is a **separate, tuned, real-GPU concern** — do NOT feed a
  backdrop into `scene.environment` or touch `SceneEnvironment.tsx`/`Lighting.tsx`/`look.ts` from
  the backdrop code (the bloom-threshold lock-step regresses, RD-409).
- **`scene.environment` IBL is the procedural Lightformer probe by default; a user-selected CC0
  HDRI replaces it (F3/R-HDRI · PHOTO-HDRI).** `SceneEnvironment.tsx` renders drei `<Environment>`
  with the procedural Lightformers UNLESS `s.hdriId` is set (+ `hdriEnvironment` flag + `quality.ibl`,
  i.e. Medium+), in which case it renders `<Environment files={hdri.url} background={false}>` — a real
  captured environment from the curated `lighting/hdriCatalog.ts` (Poly Haven CC0 `.hdr`, CORS-direct).
  The default (`hdriId === null`) keeps the exact procedural probe, so the out-of-box look never
  changes. The night-dim `environmentIntensity` ramp applies to both. (This is the sanctioned way to
  set `scene.environment` — distinct from the backdrop rule above, which forbids *backdrop* code from
  touching it.)
- **The orbit camera's projection/orientation may be corrected post-`OrbitControls.update()`,
  never fought with it (FEAT-D).** `cameras/verticalLock.ts` (`computeVerticalLock`, pure,
  no three.js import — dependency-free like `cameraLensSettings.ts`) computes a leveled look-at
  target + a vertical `camera.view.offsetY` shift from the live pose + FOV; `OrbitCamera.tsx`
  applies it in its OWN `useFrame` (default priority), registered textually *after* the component's
  existing fly/tour `useFrame`, so — because drei's `<OrbitControls>` runs its internal `update()`
  at priority **-1** and same-priority (0) subscribers fire in registration order — the correction
  always sees this frame's final pitched pose and applies last. It mutates only
  `camera.up`/`camera.quaternion` (via `lookAt`) + `camera.view`/projection matrix, **never**
  `camera.position` or `controls.target` — OrbitControls recomputes its own quaternion from
  spherical state + `object.up` each frame regardless of what a later callback did to
  `camera.quaternion`, so this can't feed back or drift. Assign `camera.view` directly (not
  `PerspectiveCamera.setViewOffset`, which also stomps `camera.aspect` via its `fullWidth/
  fullHeight` args) when you need a projection shift without touching the live aspect ratio R3F
  already maintains. Any future per-frame camera correction on the orbit camera should follow this
  exact pattern (pure math module + post-controls `useFrame`, position/target untouched).
- **The walk camera's FOV is aspect-aware, and its spawn is furniture-resolved.** three's
  `PerspectiveCamera.fov` is the VERTICAL angle, so `FirstPersonCamera` never assigns the
  `walkFov` slider value raw — it goes through `cameras/walkCameraSettings.ts:walkVerticalFov(fov,
  aspect)` (pure, unit-tested), which widens the vertical angle below `WALK_FOV_REF_ASPECT` (1.5)
  so a tall/narrow viewport keeps the HORIZONTAL view the slider promises instead of collapsing to
  tunnel vision (WALK-HFOV-FLOOR; a phone in portrait went ~43° → ~60° horizontal, and anything
  3:2-or-wider is unchanged). The FOV effect must therefore depend on the r3f `size`, not only on
  `walkFov`. Spawning is the mirror rule (WALK-SPAWN-CLEAR): every branch of the spawn effect picks
  a nominal point + a look target and then routes it through `cameras/walkSpawn.ts:resolveWalkSpawn`,
  which reuses the SAME `resolveCircleVsObbs` + `resolveMovement` solvers (and
  `WALK_PLAYER_RADIUS`) a normal step and the minimap teleport already use — never a hand-picked
  point applied raw, which is how the default flat ended up spawning the eye inside its dining
  table. A new walk entry point (a new plan kind, a new "walk here" affordance) must resolve through
  the same helper.
- **Materials**: pass a real three `Material` to `material=`, never a props object.
- **Mount expensive controllers once**; collapse repeat geometry via `InstancedBoxes`.
  `ContextLossGuard` must stay mounted in **both** Canvases (main + room editor).
- The room editor uses a **separate Canvas that mirrors the main orbit render stack**
  (`RoomEditorScene.tsx`): `frameloop="demand"` + `RenderPump`, the tier-driven shadow filter
  (VSM on Medium+, PCF on Performance — `RendererTierController` + the Canvas `shadows` prop),
  `Sky`/`SceneBackdrop`/`SceneEnvironment` (IBL), the graded `Lighting`, `FurnitureLights`, and the
  tier-gated `Effects` post stack + `QualityController` — so materials/finishes look identical to
  orbit at the user's quality tier (a glossy/metallic surface reflects the environment instead of
  rendering flat). Daytime lighting here is the same full graded simulation + virtual ceiling
  occluder as orbit (ORBIT-CEILING) — it is NOT the old "flat, no-sun/Effects" lightweight canvas
  anymore; keep it in
  lock-step with `Scene.tsx`'s render systems (add a new lighting/post system to BOTH). It still
  omits the whole-flat-only feature controllers (`RoomHoverHighlight`/`CommentPins`/`TapeMeasure`/
  `LuxOverlay`/`Panorama`/`Record`/`HqRender`/`SceneExport`) — those aren't rendering systems.
  Its walls fade with the
  **same camera-facing reveal as orbit** (ROOM-EDITOR-WALL-REVEAL): `RoomShell`/`PlanRoomShell`
  call the shared `apartment/walls/useWallReveal` hook, which reuses the pure angle-graded curve
  (`facingToward`/`revealStrength`, `wallRevealMath.ts`)
  + the `wallRevealStrength`/`wallReveal` settings (default fade 0.95) and fades a wall via a
  **per-mesh material clone** (the room's walls share one finish material, so mutating it in place
  would fade them all) + publishes `setWallOpacity` so the wall's windows/doors fade too.
- **The wall reveal is ANGLE-GRADED, not binary (WALL-REVEAL-ANGLE-GRADED).** This deliberately
  REVERSES the earlier WALL-REVEAL-BINARY-TARGET decision (binary settle + 0.35/0.65 hysteresis,
  now removed from `WallSegment` and `useWallReveal`): fade strength ramps with how much a wall's
  OUTWARD surface faces the camera — onset at `REVEAL_ONSET` (a slight angle past perpendicular),
  peak (`WALL_TRANSLUCENT_MIN`, a strong **0.05** — head-on near walls are barely an outline) head-on —
  and a wall **settles anywhere along that curve**. All four surfaces (`WallSegment`,
  `useWallReveal`, `PlanShell`, `PlanDoorLeaf`) share the pure
  `revealTargetOpacityForFade(fade, strength)` so the peak is identical everywhere.
  **Single fade-strength slider (WALL-REVEAL-STRENGTH):** one `wallRevealStrength` value (0..1,
  step 0.05, default `DEFAULT_WALL_REVEAL_STRENGTH` = 0.95) replaces the retired three-way
  translucent / auto-hide / opaque mode. It is the head-on opacity FLOOR expressed as fade depth:
  `0` = never fades (fully opaque, callers skip fading), `1` = fades fully hidden head-on, and in
  between the head-on opacity floor is `1 − fade` (so the default 0.95 → `WALL_TRANSLUCENT_MIN`
  0.05, the old default "translucent" look). The angle grading (`revealStrength`) is preserved
  across the whole range — the slider only scales how deep the peak fade goes — so unlike the
  retired `auto-hide` mode, even at 1.0 a grazing near wall settles partway and FAR walls stay
  opaque (strength 0). It still respects `wallRevealScope` (applied together with the fade). Rationale for the earlier binary→graded reversal: the binary target guarded against walls resting at a
  "washed" mid-band opacity, but the wall class that must never rest mid-band is the FAR/back
  walls (interior surface toward the camera) — and those are excluded *structurally* by the
  orientation check (`facingToward` ≤ 0 → strength exactly 0 → fully opaque), with or without a
  binary snap. NEAR walls (exterior toward the camera) are the intended graded surface and may
  rest at any partial translucency; keep the curve a gentle, honest smoothstep (no fast-ramp
  bias). Interior partitions in `wallRevealScope === 'all'` keep the flip-normal-toward-camera
  behaviour on the same curve. **Corner spread (WALL-REVEAL-CORNER-SPREAD):** a wall sharing a
  corner (endpoint, `cornerNeighbors`) with a wall fading by its OWN facing fades too —
  `cornerSpreadStrength` grades it by this wall's own facing on the spread curve
  (`SPREAD_ONSET`→`SPREAD_FULL`; a corner companion is near-perpendicular so its `toward` tops
  out ~0.3–0.5, hence the lower full-point), CAPS it at the strongest neighbour's own strength
  (the follower never fades deeper than its leader — without the cap a ~45° two-facade view
  would snap both walls near peak, defeating the graded look), and gates it *smoothly* on that
  neighbour strength (`SPREAD_GATE`→`SPREAD_GATE_FULL` ramp — a hard cut would pop with no
  hysteresis); final strength = `max(own, spread)`. Spread is strictly FIRST-degree: each wall publishes its
  own-facing strength (never its final strength) to the per-frame registry in `wallReveal.ts`
  (`setWallOwnStrength`), so spread can't cascade wall→wall→wall around the perimeter. All curve/adjacency math is pure in `wallRevealMath.ts`;
  `PlanShell`/`PlanDoorLeaf` (custom plans in orbit) share the same graded curve (corner spread
  there is deferred — `WallBox` carries no wall id yet, see TODO.md).
- **`depthWrite` stays ON through the whole wall/door/window fade (WALL-FADE-DEPTHWRITE).** Every
  reveal-fade site — `WallSegment`, `useWallReveal`, `PlanShell` (wall + trim), `PlanRoomShell`,
  `Skirting`, `Door`, `PlanDoorLeaf`, `Window` (incl. glass) — sets `material.depthWrite = true`
  regardless of opacity; only `transparent`/`opacity` change as it fades. Do **NOT** flip
  `depthWrite` with `transparent` (the old `!transparent` / `!fading` pattern): flipping it made a
  surface snap between a solid occluder and a see-through pane the instant it crossed the ~0.985
  threshold (visible *popping* while orbiting, + a 2D↔3D door/frame snap), and left faded surfaces
  (dw off) sorting inconsistently against glass/openings (dw on) so the backdrop bled through their
  overlap into a bright band. Constant depth-write = no occlusion pop, single-surface self-occlusion
  (no front/back double-blend), and consistent transparency sorting across every reveal surface.
- **Zero artifacts.** Realism work must introduce **no z-fighting or clipping**: offset
  coplanar overlays off the surface (e.g. floor decals at +~0.005 m, `depthWrite` off,
  `transparent`), keep parts from intersecting, and orbit to a side/profile angle to confirm
  contact (top-down hides float/sink). Visually verify per the playbook — green tests are
  not proof the render is right.
- **Every new orbit-camera retarget reuses the shared `startFly` tween, never a raw
  `camera.position.set`/`controls.update()` snap.** `OrbitCamera.tsx` funnels saved view,
  double-click focus, top-down, reset/home, and frame-selection (FEAT-A, `Z` — `scene/cameras/
  frameSelection.ts`) through one `fly` ref + `startFly.current(pos, target)`, so every retarget
  gets the same smoothstep ease, distance-aware duration (`cameraTween.ts` `flyDurationFor`), and
  spherical (not Cartesian) interpolation that avoids the TV-SNAP pole-instability bug. A new
  camera-framing feature adds a nonce + payload field to `cameraSlice` (mirror `frameNonce`/
  `frameBounds`) and a `useEffect` that calls `startFly.current(...)` — never a new ad-hoc tween.
  Keep bounds→distance math in a pure, three.js-free module (`fitDistanceForFov`/
  `clampOrbitDistance` in `frameSelection.ts`) so it stays unit-testable; `OrbitCamera.tsx` only
  supplies the live `camera.fov`/`aspect` and the current view angle.
- **A plain-object module signal is the sanctioned way for DOM UI outside the R3F tree to talk
  to a per-frame controller inside it**, in either direction — `cameraForward.ts`
  (`cameraForwardXZ`/`cameraPosXZ`) publishes OUT (written every frame, read by the minimap/
  arrow-key nudge); `cameras/walkTeleport.ts` (MINIMAP-JUMP) is the mirror-image IN: the minimap
  calls `requestWalkTeleport(x,z,yaw)` on tap, `FirstPersonCamera` polls
  `consumeWalkTeleport()` once per frame and clears it. Never round-trip a once-per-event signal
  like this through Zustand (a `subscribe(markDirty)` firing on every pointer event is wasted
  churn) — reserve the store for state that actually needs to persist/react beyond one frame.
- **A furniture drag is gated by `pointerId` (BUG-1).** `Furniture.tsx`'s `onPointerDown`
  records the initiating `e.nativeEvent.pointerId` into `placementSlice.startDrag(...,
  pointerId, ...)` (stored as `dragPointerId`) and best-effort `setPointerCapture`s it on the
  canvas (guarded — a stale/synthetic id throws `InvalidPointerId` on some browsers).
  `DragController`'s window-level `pointermove`/`pointerup`/`pointercancel` listeners gate every
  event through `dragHelpers.ts:isActiveDragPointer(state.dragPointerId, ev.pointerId)` before
  touching the drag — a second finger's independent pointer stream (its own `pointerId`) is a
  complete no-op: it can't move the item and it can't end the drag. Only the pointer that
  started the gesture drives `onMove` and commits/reverts on `onUp`. `endDrag` clears
  `dragPointerId`. Any new in-canvas drag/gizmo gesture that adds its own window-level
  pointermove/up listeners should follow the same pattern. **`RotateGizmo`/`ResizeGizmo`/
  `TiltGizmo` now comply (MOBILE-1)** — each records the initiating `e.nativeEvent.pointerId`
  into its own `gesture` ref (a per-gizmo field, not the store's `dragPointerId`, since a gizmo
  gesture is a distinct pointer stream from an item drag — the two are mutually exclusive via
  `!draggingItemId`/`!activeDefId` in each gizmo's `visible` check) + best-effort
  `setPointerCapture` (same guarded try/catch as `Furniture.tsx`), and gate their window
  `pointermove`/`pointerup`/`pointercancel` through `dragHelpers.ts:isActiveDragPointer`. Verified
  with a real two-pointer scenario (`scripts/scenarios/gizmo-rotate-multitouch.json`): grabbing the
  rotate ring with one pointer then driving a second pointer far away leaves the rotation
  untouched and the second pointer's `pointerup` doesn't end the gesture. `MarqueeSelector`
  (MOBILE-2) is gated the same way (a closure-local `activePointerId`, since it lives outside the
  Canvas with no per-gesture ref). Catalog placement-drag ghost (`src/ui/catalog/
  usePlacementController.ts`, MOBILE-3) is gated too, though it's outside `src/scene/` and a
  UI-owned surface: placement arms off-window (a catalog-card long-press timer fires before this
  hook's listeners exist), so there's no `pointerdown` to record the initiating id from — its
  `dragPointerId` is instead latched lazily onto the first pointer event the effect observes, reset
  on every concluding touch up/cancel (so a stamp/shift drop that keeps the same `activeDefId`
  armed re-latches per drop). Same `isActiveDragPointer` reuse, adapted for a hook that can't see
  the gesture's actual start.
- **Select-then-drag model (DRAG-SELECT-FIRST + bugs #11/#12).** `scene/touchGestures.ts`
  (installed once from `App.tsx`) counts active touch pointers on the window (capture phase, so
  it's current inside R3F handlers). `Furniture.onPointerDown` bails on a multi-finger touch
  (`activeTouchCount() > 1`) so a pinch/zoom never selects or moves a piece. A pointer-down begins
  a MOVE drag ONLY when the pressed piece was ALREADY selected before the gesture
  (`dragHelpers.ts:shouldBeginItemDrag`, pure + unit-tested) — on **both desktop and touch**. The
  FIRST press on an unselected piece never drags: selection is deferred to `onClick` (a clean
  click selects; a press-drag falls through to the orbit camera, so `draggingItemId` stays null
  and an immediate drag rotates the room view instead of moving the piece). This unifies desktop
  with the old touch-only rule (desktop previously selected AND started a drag on one
  pointer-down, so a first grab moved the piece). `Furniture.onClick` skips selection when
  `gestureIsMultiTouch()`, so a pinch's first finger landing on a piece still never selects it. A SECOND touch finger arriving mid-drag calls
  `placementSlice.cancelDrag()` (from `DragController`'s window `pointerdown`) — reverts the
  in-progress drag to its pre-drag snapshot + ends it — so a pinch that starts on an
  already-selected piece hands off to the (re-enabled) camera instead of dragging + swallowing
  the zoom.
- **The orbit camera freezes under any mobile overlay (bug #6).** `OrbitCamera`'s `controlsEnabled`
  adds `!(isMobile && (anyModalOpen || overlayOpen))` — a bottom-sheet (catalog / inspector /
  finish / wall-accent) or modal floating over the canvas must not let a swipe pan/orbit the scene
  behind it. `modalGuard` gained a reactive `useAnyModalOpen()` (`useSyncExternalStore`) for this;
  `overlayOpen` is `catalogOpen || selectedItem(s) || selectedRoomId || selectedWall`. Desktop is
  unaffected (docked side panels don't cover the canvas). This is in addition to the existing
  drag/rotate/placement freezes.
- **Alt/Option-drag duplicate (FEAT-B, `altDragDuplicate` flag, pro tier).** Starting a drag on
  an ALREADY-selected item while holding Alt clones it and drags the copy, leaving the original
  in place — the decision (`dragHelpers.ts:shouldDuplicateOnDragStart`, pure + unit-tested) is
  locked in at `Furniture.onPointerDown`, which passes the selection's ids as `startDrag`'s
  optional `duplicateSourceIds` instead of creating anything yet. That only arms
  `placementSlice.dragDuplicatePending` — the clone is created lazily, on the drag's FIRST real
  `pointermove`, via `resolveDragDuplicate()` (`DragController`'s `onMove`, before every other
  branch): it clones the source item(s) **in place** (`furniture/duplicatePlacement.ts:
  cloneItemsInPlace` — same clone shape as `planDuplicates`, no offset search since the copy is
  about to be dragged away) and repoints `draggingItemId`/`dragGroupOriginals` at the fresh
  clone(s), so every later `onMove`/`onUp` branch (collision, snug-stack, alignment guides, the
  BUG-1 pointerId gate) runs unmodified against the copy while the original sits as an ordinary
  static obstacle. This is why a plain Alt+click that never moves duplicates nothing (no
  pointermove ever fires) and can't collide with `selectItemGrouped`'s existing Alt-drill-in
  (that only runs when the pressed item ISN'T already selected — `shouldDuplicateOnDragStart`
  requires the opposite). A multi-selected drag clones the whole selection, re-grouping the
  copies under a fresh id only when every source shared one group (mirrors `duplicateAll`/
  `duplicateSelection`'s groupId rule) — a lone item's clone always drops the group, matching the
  single-item Duplicate button. `startDrag`'s one `pushHistory()` already covers "undo the
  duplicate + the move" in a single step (the clone itself is added via a plain `set`, no second
  push) — the one wrinkle is `dragIsDuplicate`/`dragDuplicateSourceIds` (set by
  `resolveDragDuplicate`, read + cleared by `onUp`): if the resolved copy ends up nowhere
  different from its source (an invalid drop auto-reverted, or a net-zero move), `onUp` restores
  the exact pre-duplicate items/selection snapshot instead of falling into the generic "no-op
  click" `dropRedundantHistory()` path, which would otherwise leave an orphaned, un-undoable
  duplicate stacked on the original (item-COUNT changes aren't visible to that path's
  position-only `changed` check).
