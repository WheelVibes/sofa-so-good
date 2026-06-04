# Rendering & scene

`src/scene/` holds the R3F `<Canvas>` and its systems.

## Lighting & time of day

SunCalc drives sun altitude → `lighting/altitudeCurve.ts` → a directional sun +
hemisphere fill + IBL intensity + sky (`lighting/Lighting.tsx`, `Sky.tsx`,
`SceneEnvironment.tsx` — a procedural Lightformer IBL probe at `resolution={64}`,
not a network HDR). `FurnitureLights.tsx` emits capped, day-gated point lights at
night; fixture shades glow via the shared `fixtureGlow` module signal. Tone
mapping is **ACES filmic**; exposure is driven per-frame from sun altitude.

## Effects & quality

`Effects.tsx` adds bloom + SMAA (+ AO) at higher tiers. Two axes:

- **`RenderTier`** — Performance / Medium / High / Maximum (`quality.ts`).
  **Performance is the default for everyone** (flat, IKEA-style: no shadows, no
  IBL, no post, DPR 1) so first load is instant. Higher tiers are opt-in.
- **`AssetTier`** — low/medium/high(=Original) GLB LOD, follows the render tier
  by default (`null` = Auto) but pinnable independently; immune to FPS
  auto-downgrade.

`QualityController.tsx` samples FPS and only ever steps the render tier **down**
to hold 30 fps, disabling itself once the user pins a tier.

## Render-on-demand

The main Canvas runs **`frameloop="demand"`**. `RenderPump.tsx` is one always-on
rAF loop that calls `invalidate()` only when a frame is wanted — continuously
while something animates (walk, turntable, tour, recording, shadow accumulation,
a drag, a spinning fan registered via `animatedSources.ts`, boot, asset
streaming) and for a short settle tail after any discrete store change; idle
scenes draw ~0 frames, a hidden tab draws none. `renderDecision.ts` is the pure
(unit-tested) decision logic; `renderPumpSignal.ts` gates `QualityController`'s
FPS sampling to continuous spans so sparse idle frames can't trigger a spurious
downgrade; `Lighting` holds the loop open while its day/night tween settles.

## Other systems

`ContextLossGuard.tsx` (WebGL context-loss safety net), `ScreenshotController.tsx`
(PNG export + a reusable hi-fi capture via `captureCanvas.ts`),
`RecordController.tsx` (.webm), cameras (`cameras/OrbitCamera`,
`FirstPersonCamera`), selection (outline/hover/marquee), `ShowcaseController`
(AccumulativeShadows when parked).
