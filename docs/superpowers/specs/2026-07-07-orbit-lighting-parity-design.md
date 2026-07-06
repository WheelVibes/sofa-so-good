# Orbit / Room-editor lighting parity + virtual ceiling + lossless "Original" assets

Date: 2026-07-07
Status: Approved (design), pending implementation plan

## Problem

Three related issues, reported together:

1. **Shadows/effects only appear in orbit at night-with-lights.** In orbit and the
   room editor, sun shadows, day/night exposure grading, and bloom are suppressed
   during the day; they only "come back" when the interior lights are forced on at
   night. Walk mode always has the full simulation.
2. **Orbit's open top floods the interior with light.** Orbit culls the ceiling so
   you can see in, so the directional sun and sky pour straight down onto the floor —
   the reason the flat-fill "dollhouse" workaround exists today. The desired behavior
   is a *virtual ceiling*: light enters only through windows and open doors, as if a
   roof were there, while you still see into the rooms from above.
3. **"Original" asset quality should mean zero loss.** Selecting Original quality must
   render the model with no texture downscaling or mesh decimation — identically on
   mobile and desktop.

## Root cause (issue 1 & 2)

The single switch is **"dollhouse lighting"**
(`src/scene/lighting/dollhouse.ts` → `isDollhouseLighting`):

```ts
cameraMode === 'orbit' && sunAltitude >= 0 && lightsMode !== 'on'
```

When true, `src/scene/lighting/Lighting.tsx` zeroes the directional sun and its shadow
(`sunRef.current.intensity = 0`, `castShadow = false`), swaps to a flat uniform
hemi/ambient fill at a fixed (ungraded) exposure, and `EffectsImpl` zeroes bloom. So:

- Orbit + daytime + lights not forced on → dollhouse → no sun/shadows/bloom (flat fill).
- Orbit + night + lights on → *not* dollhouse → real sun/shadows/bloom return.
- Walk mode → never dollhouse → always the real simulation.

Additional facts confirmed during investigation:

- **Shadows are tier-gated** (`src/scene/quality.ts`). The default render tier for
  *everyone* (mobile + desktop) is **Performance**, which has `shadowMapSize: 0` — no
  shadows, IBL, or post — in *all* modes by design. Shadows/bloom exist only on
  **Medium+**. So walk↔orbit parity at a given tier is the goal; the Performance
  default is unchanged (user chose "parity only").
- **Ceilings don't cast shadows today.** `src/apartment/ceiling/RoomCeiling.tsx` (and
  the flat tiles in `src/apartment/Ceiling.tsx`) use a `BackSide` (down-facing) material
  and set no `castShadow`, so from an overhead sun they occlude nothing — in walk mode
  too. This is why removing dollhouse *without* a ceiling occluder would blow out orbit
  daytime.
- **The room editor already mirrors the orbit render stack** (`src/scene/RoomEditorScene.tsx`
  — shadows, `SceneEnvironment` IBL, the graded `Lighting`, `FurnitureLights`, tier-gated
  `Effects`), so it inherits any lighting change for free.

## Root cause (issue 3)

The asset-LOD path is *already* lossless for the `high` tier:
`src/furniture/gltf/lod.ts:resolveLodUrlSync` returns the base URL for `high`, and
`src/furniture/gltf/textureBudget.ts:applyTextureBudget` no-ops for `high`. The gap is
that on **Auto** (`assetTier === null`, the default), `effectiveAssetTier` follows the
render tier: `performance → low`, `medium → medium` — so the out-of-box Performance tier
silently downscales. There is no mobile-specific asset override in the resolution path.
The exact degradation the user perceives must be pinned before the fix (verify-first).

## Goals

- Orbit and the room editor run the **same lighting simulation as walk mode** at every
  tier (graded sun, PCF sun shadows, exposure grading, bloom) — no daytime suppression.
- A **virtual ceiling** blocks the sun from entering through the open top so interiors
  are lit through windows / open doors only, while the orbit camera still sees in.
- **"Original" asset quality is provably lossless**, identically on mobile and desktop.

## Non-goals

- Changing the default render tier (stays Performance — parity only).
- Forcing shadows on the Performance tier.
- Rendering a visible ceiling in orbit (the see-in dollhouse view is retained).
- Blocking sky-IBL ambient from above — IBL is not occluded in walk mode either, so
  matching walk means keeping full IBL ambient. Only the *directional sun* is occluded.

## Design

### Part 1 — Retire dollhouse lighting suppression

Remove the daytime-orbit suppression so orbit/editor always take the real path:

- `src/scene/lighting/Lighting.tsx`: delete the `dollhouse` computation, the
  `DOLLHOUSE_HEMI` / `DOLLHOUSE_AMBIENT` / `DOLLHOUSE_FILL` constants, and the
  flat-fill / fixed-exposure / sun-zero branches. Sun intensity, `castShadow`,
  exposure grading, and hemi/ambient fill always use the graded values (still gated by
  `shadowMapSize > 0`, i.e. Medium+, and by the existing IBL-overlap fill scaling).
- `EffectsImpl` (bloom): remove the dollhouse zeroing so bloom follows the normal
  day-ramped path in orbit.
- Delete `src/scene/lighting/dollhouse.ts` (the predicate + `get/setDollhouseActive`
  module signal) and its test file. The **only two functional readers** of the lighting
  predicate are `Lighting.tsx` and `EffectsImpl.tsx`. **Do not touch** the many unrelated
  `"dollhouse"` references elsewhere (`OrbitCamera.tsx`, `verticalLock.ts`,
  `frameSelection.ts`, wall-reveal, ceiling-cull comments) — those name the orbit
  *camera framing / wall-reveal*, a separate concept that stays.
- Docs: rewrite the **ORBIT-DOLLHOUSE** rule in `src/scene/CLAUDE.md` and the
  corresponding section in `docs/ARCHITECTURE.md` to describe the new
  virtual-ceiling model.

Must ship together with Part 2 (a standalone Part 1 blows out orbit daytime).

### Part 2 — Invisible shadow-casting virtual ceiling

New component `src/apartment/ceiling/CeilingOccluder.tsx`:

- Renders one horizontal plane per **non-external** room (reuse the `ROOMS` filter and
  the per-room ceiling-height resolution already in `src/apartment/Ceiling.tsx` —
  `planRoom?.ceilingHeight ?? r.ceilingHeight ?? floorPlan.ceilingHeight`, including the
  extension tile), positioned at that room's ceiling height and sized to the room
  footprint (+ a small margin so edges seal against the walls).
- **Shared occluder material**: `colorWrite: false`, `depthWrite: false`,
  `transparent: true` (invisible + non-occluding in the beauty pass so the orbit camera
  sees straight in), on a mesh with `castShadow = true` and `material.shadowSide =
  DoubleSide` (so the overhead sun's depth pass captures it). One shared material
  instance for all planes (mirrors the `CEILING_MAT` sharing pattern).
- **Cover both ceiling paths.** The default apartment draws ceilings from `ROOMS` via
  `src/apartment/Ceiling.tsx`; custom plans draw them per-room via `PlanShell` /
  `src/apartment/floor/PlanRoomCeiling.tsx`. The occluder must cover whichever is active
  so a custom plan is also roofed — either derive the occluder planes from
  `floorPlan.rooms` (the authoritative source both ceiling paths key off) so one occluder
  serves both, or add a matching occluder to each path. Prefer the single
  `floorPlan.rooms`-driven occluder to avoid drift.
- Present in **both** walk and orbit modes for uniform, physically-consistent behavior
  ("as if a ceiling were there" everywhere). Mounted from `src/apartment/Apartment.tsx`
  alongside the existing `Ceiling`, and included in the room-editor shell so the editor
  matches. No tier/device branch — identical on mobile and desktop. (It only affects the
  sun shadow map, which itself is a no-op when `shadowMapSize === 0` on Performance, so
  it costs one extra shadow-caster draw only where shadows already run.)
- Windows/doors: the occluder is horizontal only, so the sun still enters at low angles
  through the vertical wall openings — matching "light through windows and openings."

Verification checkpoint: confirm **walk mode does not regress** (interiors should read
as roofed — window light + IBL + fixtures, not direct sun rectangles on the floor). If
walk mode looks wrong, fall back to scoping the occluder to orbit + editor only.

### Part 3 — "Original" asset quality is lossless

- **Verify-first**: reproduce and pin the exact degradation (expected: default Auto →
  Performance → `low` variant with 512px textures + 50% triangles). Confirm on both a
  desktop and a mobile viewport.
- **Guarantee**: assert that selecting the "Original" asset tier (`assetTier === 'high'`)
  resolves to the base GLB URL with no texture budget applied and no LOD suffix, on both
  mobile and desktop. Audit the full render path (`GltfModel.tsx`,
  `gltf/lod.ts:resolveLodUrlSync`, `gltf/textureBudget.ts:applyTextureBudget`,
  `AnisotropyController`, any mip/texture cap) and guard off any residual downscaling for
  `high`.
- If the verify pass shows the default-Auto downscaling is the user's actual complaint,
  the fix stays scoped to making the explicit "Original" choice lossless (per the chosen
  answer) — not changing the Auto/Performance default. Document the Original guarantee in
  the Graphics-panel copy if it's unclear.
- Tests assert lossless resolution for `high` in both a mobile and a desktop context.

### Cross-cutting

- **Version**: bump the `build` in `src/version.ts` + mirror in `package.json`
  (`major.minor.patch` unchanged); the PR title states the shipped version.
- **CHANGELOG**: log the shipped work.
- **Docs in the same change**: `src/scene/CLAUDE.md` (ORBIT-DOLLHOUSE rewrite),
  `docs/ARCHITECTURE.md`, and `docs/visual-verification-playbook.md` (add the
  orbit-roofed-lighting check). Update user docs only if a user-facing label changes.
- **Feature-flag / tier rules**: this is a behavior change to existing rendering
  systems, not a new user-facing feature — no new `FEATURE_FLAGS` entry required. It
  respects the existing tier gates (`shadowMapSize`, `postprocessing`).

## Testing

- **Unit**: occluder geometry/height resolution is pure where possible; `high`-tier
  lossless resolution (mobile + desktop). Remove dollhouse tests; add/adjust
  `Lighting`-adjacent tests that previously asserted dollhouse suppression.
- **Visual verification** (`scripts/shot.mjs` scenarios, Medium+ tier), reviewed for
  artifacts:
  - Orbit, daytime: sun shadows present, interior roofed (no top-flood), see-in view
    intact.
  - Room editor: matches orbit.
  - Walk mode: no regression (roofed interior, window light).
  - Mobile viewport pass of the above.
  - Confirm no z-fighting / occlusion pop from the occluder plane.

## Risks

- **Walk-mode lighting change.** Making the roof occlude the sun in walk mode is more
  correct but *is* a visible change; the verification checkpoint gates it, with the
  orbit-only fallback if it regresses.
- **Shadow-only material portability.** `colorWrite:false` + `castShadow` must reliably
  cast on the target WebGL path; verify on the real render, not just headless.
- **Removing dollhouse touches documented behavior** (ORBIT-DOLLHOUSE) and multiple
  readers — the module signal must be fully removed, not left dangling.
