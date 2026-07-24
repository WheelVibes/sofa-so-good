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
