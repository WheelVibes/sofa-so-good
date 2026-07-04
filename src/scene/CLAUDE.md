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
- **Orbit daytime is a flat dollhouse, not an exterior sim** (ORBIT-DOLLHOUSE,
  `lighting/dollhouse.ts`). The pure `isDollhouseLighting({cameraMode, sunAltitude, lightsMode})` is
  true in orbit + day + lights-not-forced-on; `Lighting` then zeroes the directional sun + its shadow
  and lights the scene with a bright neutral hemi/ambient fill at a fixed (ungraded) exposure, and
  `EffectsImpl` zeroes bloom. Walk mode + orbit-at-night keep the full graded simulation (sun curve,
  shadows, day-ramped bloom). **Don't** gate material-quality knobs (IBL/PMREM, sheen/clearcoat, PBR,
  anisotropy) on this — they must keep working in orbit per tier (a glossy surface stays glossy). The
  module signal (`get/setDollhouseActive`) lets a per-frame reader agree without a re-render; React
  consumers compute the predicate directly from store + sun for no frame lag.
- **Bloom only blooms genuine HDR emitters, never broad daytime surfaces** (RD-409). The
  Bloom `luminanceThreshold` (`look.BLOOM.luminanceThreshold`, 1.35) sits **above** sunlit
  white walls/ceilings under the day IBL + ~1.2 graded exposure and **below** the night
  light-fixture emissive peaks (`lighting/fixtureGlow.ts` — shade ~1.6 / strip ~1.8 / bulb
  ~2.05). A lower threshold (the old 1.05) smeared a milky white veil across the whole
  High/Maximum frame in daylight. The two live in lock-step: the `fixtureGlow` test asserts
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
  qualified by the pure `furniture/surfaceDecal.ts` and rendered from `furniture/Furniture.tsx`)
  and `CornerAO.tsx` `WallFloorAO` (wall/floor corner strip, RD-403). Both use ONE shared
  `CanvasTexture`, a single transparent plane each, `depthWrite:false` + `polygonOffset` +
  small `+Y`. Corner AO mounts inside the wall's local frame in `WallSegment.tsx` (follows
  wall edits) and is gated **on** for `performance`/`medium` only via the `cornerAo`
  `QualitySettings` flag (off on High+ so it never double-darkens the post stack's SSAO);
  sizing/gating logic is pure in `cornerAoMath.ts`. When adding a new baked-AO cue, follow
  this pattern (shared texture, tier-gate off where real AO runs) — never per-instance textures.
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
- **Materials**: pass a real three `Material` to `material=`, never a props object.
- **Mount expensive controllers once**; collapse repeat geometry via `InstancedBoxes`.
  `ContextLossGuard` must stay mounted in **both** Canvases (main + room editor).
- The room editor uses a **separate lightweight Canvas** with none of the sun/Effects
  systems — keep that boundary; don't leak heavy systems into it. Its walls fade with the
  **same camera-facing reveal as orbit** (ROOM-EDITOR-WALL-REVEAL): `RoomShell`/`PlanRoomShell`
  call the shared `apartment/walls/useWallReveal` hook, which reuses the pure `wallRevealFactor`
  + the `wallRevealMode`/`wallReveal` settings (translucent by default) and fades a wall via a
  **per-mesh material clone** (the room's walls share one finish material, so mutating it in place
  would fade them all) + publishes `setWallOpacity` so the wall's windows/doors fade too.
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
