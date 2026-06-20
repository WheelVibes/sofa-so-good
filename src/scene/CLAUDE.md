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
- **Materials**: pass a real three `Material` to `material=`, never a props object.
- **Mount expensive controllers once**; collapse repeat geometry via `InstancedBoxes`.
  `ContextLossGuard` must stay mounted in **both** Canvases (main + room editor).
- The room editor uses a **separate lightweight Canvas** with none of the sun/Effects
  systems — keep that boundary; don't leak heavy systems into it.
- **Zero artifacts.** Realism work must introduce **no z-fighting or clipping**: offset
  coplanar overlays off the surface (e.g. floor decals at +~0.005 m, `depthWrite` off,
  `transparent`), keep parts from intersecting, and orbit to a side/profile angle to confirm
  contact (top-down hides float/sink). Visually verify per the playbook — green tests are
  not proof the render is right.
