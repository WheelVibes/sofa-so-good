# Render fidelity (offline-still mode) + GLTF asset hardening — design

**Date:** 2026-05-30
**Status:** Approved (brainstorming)
**Milestone:** 1 of a multi-milestone program to make the HDB sandbox feel as
high-fidelity and professional as the IKEA Kreativ / Space planner.

## Goal & context

The IKEA planner reads as "professional" along four axes: photoreal render
fidelity, a branded app shell + guided flow, catalog depth, and AR/room
capture. The user wants all four eventually; this spec is the **first
milestone only**: render fidelity, plus the GLTF asset foundation that the
*next* milestone (a slot-based product configurator — mattress-on-frame,
modular sofa) will build on.

The existing render stack is already strong: ACES tone mapping, a one-shot
procedural IBL probe (`SceneEnvironment`), sun + hemisphere GI (`Lighting`),
PCF shadows, and an `N8AO + Bloom + SMAA` post stack on the High tier
(`EffectsImpl`). GLB import already exists too: `furniture/GltfModel.tsx`
(clone + bbox footprint cache + tint), `state/slices/userAssetsSlice.ts`,
IndexedDB blob storage (`IdbAssetStore`), and validation
(`furniture/upload/validate.ts`).

So this milestone is **calibration + hardening**, not a rewrite.

### Decisions locked during brainstorming

- **Render approach: B** — calibrated real-time polish *plus* an offline
  accumulation "still" mode for parked-camera hero shots. (Not path tracing —
  option C declined as overkill for a real-time sandbox.)
- **Asset licensing: local/personal import only** — build a first-class GLTF
  import path, but do **not** bundle IKEA-derived models in the repo. The repo
  stays CC0-clean per CLAUDE.md. Users load their own high-quality models.
- **First spec scope: render fidelity + GLTF hardening.** The slot-based
  configurator is a separate later milestone; unit 3's finish-target mechanism
  is the hook it will reuse.

## Architecture

Four independent, separately-testable units layered on the existing `scene/`
and `furniture/` code. No rewrites.

| Unit | Area | What it delivers |
|------|------|------------------|
| 1. Look calibration | `scene/lighting/`, `scene/EffectsImpl.tsx`, new `scene/look.ts` | Soft shadows, tuned IBL/AO, time-of-day exposure + white balance, vignette + tone curve |
| 2. Showcase still mode | new `scene/ShowcaseController.tsx`, `scene/ScreenshotController.tsx`, `scene/quality.ts` | Parked-camera progressive shadow accumulation; capture forces max settings |
| 3. GLTF fidelity hardening | `furniture/GltfModel.tsx`, new `furniture/gltf/` | Draco/KTX2/meshopt decoders, collision span from bbox, finish-swap/tint targets |
| 4. Imported-model catalog citizenship | `ui/catalog/`, `userAssetsSlice`, `furniture/upload/persist.ts` | Imported GLBs become first-class catalog cards with thumbnails + metadata |

Units 1–2 are the "approach B" render work. Units 3–4 are the GLTF
foundation the configurator milestone will build on.

## Unit 1 — Look calibration

New `scene/look.ts` is the single source of truth for the graded look (look is
data, not scattered magic numbers).

- **Soft shadows.** Canvas shadow map `PCFShadowMap` → `PCFSoftShadowMap`; tune
  `shadow-radius` / `shadow-normalBias` on the sun `directionalLight` so contact
  edges soften without acne or peter-panning. Cheap; every tier.
- **GI feel.** Enrich the `SceneEnvironment` Lightformer probe (more directional
  variation, warmer ground bounce) and retune `N8AO` (`aoRadius`, `intensity`,
  `distanceFalloff`) so corners/recesses darken like the reference. The existing
  day→night IBL-intensity ramp stays.
- **Time-of-day grading.** `look.ts` exports `grade(altitude) → { exposure,
  whiteBalance }`. A small `useFrame` (in `Lighting`, or a new tiny
  `LookController`) drives `gl.toneMappingExposure` and a subtle white-balance
  shift across the day, replacing the fixed `1.05`.
- **Finishing post.** Add `Vignette` + a gentle tone curve
  (`HueSaturation` / `BrightnessContrast`) to the High-tier `EffectComposer`,
  kept subtle so it reads "shot, not rendered".

**Testing:** `look.ts` pure functions unit-tested (monotonic exposure across
altitude, clamped ranges, AO/shadow param tables). Visual params checked via
`scripts/shot.mjs` before/after.

**Scope guard (YAGNI):** no per-room probes, no custom shaders, no LUT files —
calibrated built-ins only.

## Unit 2 — Showcase / accumulation still mode

New `scene/ShowcaseController.tsx` + drei `AccumulativeShadows` /
`RandomizedLight`.

- **Idle detection.** Watch the camera (reuse the camera-forward tracker /
  OrbitControls change events). After the camera is still ~400ms, enter
  *showcase accumulation*: mount `AccumulativeShadows` and accumulate soft,
  noise-free ground shadows over N frames. Any camera move resets accumulation
  and returns to the live look.
- **Rationale.** Accumulation converges to area-light-quality softness that
  single-pass PCF can't match — the "IKEA hero still" payoff of approach B. It
  costs nothing while moving (off) and only spends frames while parked.
- **Showcase capture.** Extend `ScreenshotController` (and the record path) so
  PNG / `.webm` export first forces max settings (full accumulation, High-tier
  post, top DPR), captures, then restores the live tier — wrapped in
  try/finally so settings always restore even if capture throws. A Low-tier
  user still exports a high-fidelity image. Focused change to the existing
  export event handler, not a new system.
- **Quality integration.** Add a `showcase` capability to `QualitySettings`;
  auto-enabled on medium/high, off on low (but forced on during capture).
  Overridable in the Graphics panel like every other setting.

**Testing:** idle state machine (still → accumulate → reset-on-move)
unit-tested with a fake clock; capture path asserts settings are restored after
export (including on throw); visual convergence checked via `shot.mjs` with a
wait.

**Scope guard:** parked stills only — not a continuous render mode, no path
tracing.

## Unit 3 — GLTF fidelity hardening

Hardens the **existing** `GltfModel.tsx` / upload pipeline; does not rebuild it.

- **Compressed-mesh decoders.** Register Draco, KTX2 (Basis), and meshopt
  decoders on the shared `useGLTF` loader, once at app boot, so compressed GLBs
  (how high-quality furniture ships) load and stay small in memory. Built-in
  and user URLs both benefit. Offline pre-compression is already covered by the
  existing `@gltf-transform` dev deps; the runtime side is decoder
  registration.
- **Collision from real geometry.** `GltfModel`'s bbox cache already computes
  `{w,d,h,ox,oz}` from visible meshes. Derive a `verticalSpan` + footprint for
  imported items so they collision-check and snap like primitives, including
  `mounted` / `noClip`-style flags surfaced in the import UI for wall-mounted or
  rug-like models.
- **Finish-swap / tint targeting.** Extend `GltfModel` beyond its current
  tint-multiply: an imported model's meshes/material groups become **named
  finish targets**. The import flow lists them; the inspector's existing
  `finish` dropdown (incl. `mat:<id>` CC0 DLC) re-skins a chosen group via the
  same mechanism primitives use through `getSurfaceMaterial`. This is the hook
  the milestone-2 configurator reuses for swappable parts.

**Testing:** decoder registration asserted at boot; footprint→span derivation
unit-tested against fixture GLBs (extend `validate.test.ts` /
`builtinAssets.test.ts` patterns); finish-target resolution unit-tested.

**Scope guard:** no automatic LOD generation, no server-side processing — local
import, client decode. IKEA models stay personal/local.

## Unit 4 — Imported-model catalog citizenship

Make imported GLBs indistinguishable from built-ins at the UI layer, reusing
existing catalog/upload plumbing.

- **Real catalog cards.** Surface `userAssetsSlice` `UserGltfDef`s in
  `ui/catalog/` as proper cards alongside built-ins — name, category, generated
  thumbnail (reuse `catalog/packs/thumbnail.ts`). The import dialog captures
  name + category + the collision flags from unit 3.
- **Consistent metadata.** Imported items carry the shape the catalog expects
  (footprint, span, finish targets) so search, placement, snap, budget, and
  report treat them as first-class with no downstream special-casing.
- **Persistence.** Defs in the store, blobs in IndexedDB (`IdbAssetStore`),
  blob URLs rehydrated on boot — already handled. Unit 4 ensures the new
  metadata (category, thumbnail, finish targets) round-trips through
  `persist.ts` and the save schema (`state/schema.ts`).

**Testing:** def→card mapping unit-tested; thumbnail generation smoke-tested;
persistence round-trip via existing hydrate tests.

**Scope guard:** no marketplace, no sharing, no cloud sync — local catalog
citizenship only.

## Error handling (cross-cutting)

- **Decoder/load failure** → existing placeholder + a non-blocking notification
  (`ui/notifications/`); never crash the scene.
- **Accumulation on weak GPUs** → gated by the quality capability; capture-time
  forcing is time-boxed and restores prior settings in a `finally` even if
  capture throws.
- **Oversized/invalid GLB** → existing `validate.ts` (25 MB cap, magic bytes,
  no external URIs) stays the gate; surface its reason in the import dialog.

## Testing strategy (overall)

Pure logic (look grading, idle state machine, footprint→span, finish-target
resolution, persistence) → Vitest units. Visual deltas → `scripts/shot.mjs`
before/after at a fixed camera + time of day. No new e2e framework.

## Out of scope (this milestone)

- Slot-based product configurator (mattress-on-frame, modular sofa) — **next
  milestone**; reuses unit 3's finish-target mechanism.
- Branded app shell / onboarding / guided room-type flow — later milestone.
- Catalog depth (real SKUs, retailer-grade range) — later milestone.
- AR / photo room capture — later milestone.
- Path tracing (option C).
- Bundling IKEA-derived or other non-CC0 models in the repo.
