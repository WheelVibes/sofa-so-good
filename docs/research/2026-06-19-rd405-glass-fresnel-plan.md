# RD-405 — Cheap glass fresnel + sky/environment reflection on all tiers

**Date:** 2026-06-19 · **Status:** design / implementer-ready · **Effort:** M · **Verify:** H
**Parent:** `docs/research/2026-06-19-photoreal-parity-deepdive.md` §2.5 (RD-405)
**Scope:** make windows + glass furniture read as *glass* (fresnel rim + a sky/environment
reflection) on **every** render tier — without paying for the real transmission render pass,
which stays High/Maximum only.

---

## 1. Current state — how glass renders today, per tier

### 1.1 Two separate glass paths exist (and they diverge)

There are **two unrelated implementations** of "glass", which is itself part of the problem —
a fix has to touch both:

**(a) Window panes — `src/apartment/Window.tsx`** (`WindowPane`, lines 122–138).
The pane is a hand-rolled inline `<meshStandardMaterial>`, *not* routed through
`getGlassMaterial`:

```
color="#bcd4e6"
emissive={GLASS_SKYCATCH_COLOR}      // '#cfe4f5'  (materialRealism.ts:84)
emissiveIntensity={0.4}
roughness={0.05}
metalness={0.1}
transparent
opacity={0.28}
```

Per-frame (`useFrame`, lines 75–104) it lerps the body colour `GLASS_DAY '#bcd4e6'` →
`GLASS_NIGHT '#20272f'` by the shared darkness signal `getFixtureGlow()` (1 night → 0 day),
sets `glass.emissiveIntensity = glassSkyCatchIntensity(1 - d)` (RZ2 "sky-catch"), and ramps
opacity up at night (`glassBase = 0.28 + d*0.45`). This is the **only** glass realism the flat
default gets: a flat emissive tinted rectangle. No reflection, no fresnel, no envMap. It runs on
**all** tiers identically (the window pane never gets transmission, even on High/Max).

**(b) Furniture glass — `src/materials/furnitureMaterials.ts:getGlassMaterial` (961–991)**
driven by `glassConfig` (`src/materials/materialRealism.ts:55–81`) and wrapped by
`src/furniture/primitives/GlassMaterial.tsx`. Consumers: `CabinetModule.tsx`, `Shower.tsx`,
`BarCart.tsx`. Tier split:

- **High / Maximum** (`transmissionTiers`, materialRealism.ts:25–27): real
  `MeshPhysicalMaterial` — `transmission` (0.55–0.98), `ior 1.5`, `thickness`, `roughness 0.04`,
  `metalness 0`, `envMapIntensity = GLOSSY_ENV_INTENSITY (1.3)`, `transparent:false`. Looks like
  glass because it refracts the IBL/env behind it.
- **Performance / Medium** (cheap branch, materialRealism.ts:77–80): a plain transparent
  `MeshPhysicalMaterial` — `{ transparent:true, opacity, roughness:0.05, metalness:0.1 }`.
  **No emissive, no envMap, no fresnel.** It is a semi-transparent flat tinted sheet.

### 1.2 Why flat (Performance) looks dull — the root cause

1. **No environment to reflect on Performance.** `SceneEnvironment.tsx` only builds the IBL
   probe when `quality.ibl` is true, i.e. **medium and up** (`quality.ts:78–95`,
   `performance.ibl:false`). On Performance, `scene.environment` is `null`, so every
   `envMapIntensity` in the codebase (the four furniture call-sites + the High glass branch)
   is multiplying by *nothing*. Cheap glass therefore has **no reflection term at all** on the
   default tier — it can only show its body colour + opacity. Real glass at a glancing angle is
   almost a mirror; ours never reflects anything.

2. **No fresnel.** A `MeshStandardMaterial` does compute a Schlick fresnel on its *specular*
   lobe, but with no env map and only the direct sun/ambient to reflect, there's nothing for the
   grazing-angle fresnel to *show*. The pane reads equally dull head-on and edge-on. The defining
   visual cue of glass — "bright/mirror-like at grazing angles, see-through head-on" — is absent.

3. **Window panes don't even use the cheap-glass helper.** They get a constant `emissive 0.4`
   (good — they never read black), but the emissive is *uniform* across the pane (no rim
   brightening) and there is no reflection of the backdrop, so a window reads as a glowing flat
   blue rectangle rather than a reflective sheet of glass.

4. **The backdrop is never used as a reflection source.** `SceneBackdrop.tsx` bakes a nice
   equirect sky/skyline and assigns it to **`scene.background`** — but **only in walk mode**
   (`isPhotoBackdropActive` requires `cameraMode === 'firstPerson'`, lines 27–36) and **only as
   the background, never as `scene.environment`**. So even the asset we already have that *should*
   be reflected in the windows isn't wired to reflect in them, on any tier, in orbit.

**Net:** Medium has an IBL probe (so glass *can* reflect a little), but Performance — the product
default for every user on first load — has flat, reflection-less glass and windows. That is the
gap RD-405 closes.

### 1.3 Mirrors (for reference — the tier-gate pattern to mirror)

`src/furniture/primitives/MirrorMaterial.tsx` — `mirrorReflectorConfig(tier)` gates the real
planar `MeshReflectorMaterial` to High/Max; the cheap branch (lines 44–53) fakes a mirror with
`roughness 0.07 / metalness 0.7 / envMapIntensity 2.0 / emissive '#b9c6d0' 0.16`. Same problem:
the `envMapIntensity 2.0` does nothing on Performance (no env). RD-405's cheap-reflection env
source (see §2) fixes mirrors as a free side-benefit, but mirrors are **out of scope** for the
shipped RD-405 tasks (don't change `MirrorMaterial` here; note the win for a follow-up).

---

## 2. Plan — a cheap, all-tier glass upgrade

Three additive layers, none of which require the transmission pass. **(A) and (B) are the core;
(C) is the gating discipline.**

### (A) A cheap reflection environment available on ALL tiers

The blocker is that `scene.environment` is null on Performance. Fix it with a **tiny, cheap,
shared PMREM-prefiltered env map** that exists regardless of tier, used *only* by the glass/mirror
materials' `envMap` (do **not** assign it to `scene.environment` on Performance — that would
silently re-light every PBR surface and change the whole flat look + cost a per-surface env lookup
on everything).

**Chosen reflection source — reuse the backdrop equirect, with a procedural-sky fallback.**

Source priority (cheapest correct option first):

1. **Reuse `bakeBackdropEquirect(kind)`** (`scene/backdropEquirect.ts`). It already paints a 2:1
   sky + horizon + skyline canvas, asset-free. Prefilter it **once** through a `PMREMGenerator`
   (`gl.pmremGenerator` / `new PMREMGenerator(gl)`) into a small env map and hand the resulting
   texture to the glass/mirror materials as `material.envMap`. PMREM of a tiny equirect is a
   one-time cost (a few render-target passes at build), **zero per-frame cost** — perfect for the
   flat tier. This makes windows reflect the *same* sky/skyline you see through them — the single
   most convincing cue.
2. **When no photo backdrop is active** (orbit mode, or `backdrop === 'none'`): bake a **cheap
   2-3 stop vertical sky-gradient equirect** (zenith → horizon → ground, reusing the active
   preset's `sky`/`ground` colours, or a neutral default) and PMREM that. This is the "procedural
   sky gradient cubemap" the brief mentions; it is a 4-line gradient canvas, far cheaper than a
   skyline. **If RD-412 ships first**, consume its Preetham/Hosek sky equirect here instead of a
   hand-baked gradient (see Dependencies §4) — same `scene.environment`/PMREM slot.

Implementation: a new small module `src/scene/lighting/glassEnvProbe.ts` (pure-ish helper +
a `GlassEnvProbe` controller component, or fold the controller into `SceneEnvironment`):

- Exposes the prefiltered env texture via a **module-level signal** (the `finishDragSignal.ts` /
  `proceduralSwapSignal.ts` pattern — `useSyncExternalStore` + pure set/notify), *not* a store
  slice (avoids re-rendering the R3F tree). `getGlassMaterial`/`GlassMaterial`/`WindowPane` read
  the current probe and set `material.envMap` + bump `material.needsUpdate` when it changes.
- **Tier behaviour:**
  - **Performance / Medium:** probe = PMREM of the backdrop equirect (or sky-gradient fallback).
    A *low* resolution is plenty for blurry glass reflections — reuse `quality.envResolution`
    (Performance 64, Medium 96) or a fixed 64–128. Cheap.
  - **Medium already has the Lightformer IBL** in `scene.environment`. For Medium+, prefer
    binding the glass `envMap` to the existing `scene.environment` probe if present (so glass
    reflects the *room* IBL, consistent with other PBR surfaces) and fall back to the backdrop
    PMREM only when `scene.environment` is null. (i.e. `material.envMap = scene.environment ??
    backdropProbe`.)
  - **High / Maximum:** real transmission already samples `scene.environment`; no change needed
    beyond ensuring it keeps its `envMapIntensity`.
- Rebuild the probe only when the backdrop `kind`/`customUrl` changes (effect dep), and dispose
  the old PMREM render target. Guard `gl`/`PMREMGenerator` absence (happy-dom tests) → probe stays
  null, materials fall back to no-env (current behaviour) — never throw.

### (B) Fresnel rim + sky-tinted reflectivity in the cheap glass material

Two cheap, additive cues on the **cheap** branch (Performance/Medium) — and on the **window pane**
material — so glass reads as glass even when the env probe is faint or absent:

**B1. Fresnel rim brightening (no extra texture).** `MeshStandardMaterial`/`MeshPhysicalMaterial`
already give a fresnel-shaped specular response; the issue is there's nothing to reflect. We make
the rim *self-evident* two ways, in order of preference:

- **Preferred (with the §A env probe):** simply having an `envMap` + a modest `envMapIntensity`
  (e.g. 1.3–2.0) on low-roughness glass yields a real grazing-angle fresnel reflection of the sky
  — this is the cleanest "free" fresnel and needs no shader injection.
- **Belt-and-braces, env-free fallback:** a tiny `onBeforeCompile` injection on the glass material
  that adds a view-angle term `pow(1 - dot(N, V), p)` (Schlick fresnel, `p ≈ 3–5`) into the
  *emissive* contribution (lift toward `GLASS_SKYCATCH_COLOR`). This guarantees a bright rim at
  grazing angles even on `backdrop:'none'` with no probe, with **zero render-target cost** (pure
  fragment math). Keep the injection minimal and unit-test the GLSL-free *parameters* (intensity,
  power, day/night scale) in `materialRealism.ts`. Put the math behind a pure function
  `glassFresnelParams(daylight)` returning `{ rimIntensity, rimPower, rimColor }`.

**B2. Daylight-driven sky-gradient reflection tint.** Reuse the existing `glassSkyCatchIntensity`
daylight input (and the `GLASS_DAY`/`GLASS_NIGHT` lerp already in `Window.tsx`) so the reflection
reads **cool-bright by day, dark-reflective by night**:

- Drive `envMapIntensity` (and the B1 rim intensity) **up by day, down at night** off the same
  `getFixtureGlow()` daylight signal the window already lerps on. Add a pure
  `glassReflectionIntensity(daylight): number` to `materialRealism.ts` (e.g.
  `0.15 + daylight * 1.6`) so by night the pane is a dark near-mirror and by day a bright
  sky-catching sheet — matching real behaviour and the existing day/night colour lerp.
- Cheap-tint the reflection toward the sky colour so even a gradient probe reads as "sky".

**B3. Faint env reflection on cheap glassware against the Medium IBL probe.** Per the brief: on
Medium (which *has* IBL but uses the *cheap* glass branch), wire `material.envMap =
scene.environment` + a small `envMapIntensity` into the cheap branch so vases/cabinet glass catch
the room probe. This is covered by §A's "Medium+ binds to `scene.environment`" rule — the cheap
branch must stop being env-less.

**Material-prop changes (cheap branch), `glassConfig` cheap return + `getGlassMaterial`:**
add `envMapIntensity` (daylight-scaled), keep `roughness` low, set `envMap` from the probe, and
(for the env-free fallback) the B1 fresnel emissive. Window pane (`Window.tsx`) gains the same
`envMap` + per-frame `envMapIntensity = glassReflectionIntensity(1 - d)` and the fresnel rim.

### (C) Keep true transmission High/Max-only — unchanged

`transmissionTiers` (High/Max) and the `GlassPhysical` branch are **unchanged**. The remaining
`KHR_materials_volume` (attenuationColor/thickness) work stays under PHOTO-GLASS, not here. On
High/Max the env probe simply isn't needed for glass (transmission samples `scene.environment`);
the §A probe only fills the gap on Performance/Medium.

### Files that change

| File | Change |
|---|---|
| `src/scene/lighting/glassEnvProbe.ts` (**new**) | Build + cache a PMREM env from the backdrop equirect (or sky-gradient/RD-412 fallback); expose via a module-level signal; dispose on change. Controller mounts in `Scene.tsx`. |
| `src/scene/backdropEquirect.ts` | (small) export a `bakeSkyGradientEquirect()` for the orbit / `none` fallback reusing preset sky/ground colours. |
| `src/materials/materialRealism.ts` | Add pure `glassReflectionIntensity(daylight)` and `glassFresnelParams(daylight)`; extend the `GlassCheap` interface with `envMapIntensity` (+ optional fresnel fields). Keep `transmissionTiers`/`GlassPhysical` untouched. |
| `src/materials/furnitureMaterials.ts` | `getGlassMaterial`: in the cheap branch set `envMap` from the probe signal (`?? scene.environment` on Medium), set daylight-scaled `envMapIntensity`, add the fresnel `onBeforeCompile` (env-free fallback). Subscribe to probe changes → `needsUpdate`. |
| `src/furniture/primitives/GlassMaterial.tsx` | Pass the probe/daylight through (it already reads `tier`); ensure the per-frame daylight scale reaches the material (small `useFrame` or reuse `getFixtureGlow()` like the window does). |
| `src/apartment/Window.tsx` | Set `envMap` from the probe; per-frame set `envMapIntensity = glassReflectionIntensity(1 - d)` + the fresnel rim alongside the existing `glassSkyCatchIntensity` line. |
| `src/scene/Scene.tsx` | Mount the `GlassEnvProbe` controller once (next to `SceneEnvironment`/`SceneBackdrop`). |
| Tests | `materialRealism.test.ts` (new pure fns, both-tier coverage), a new `glassEnvProbe.test.ts` (signal + graceful no-gl), `getGlassMaterial` prop assertions per tier. |

---

## 3. Sequence — agent-sized tasks

> **Conflict note (from the deepdive ladder).** RD-405 **shares `furnitureMaterials.ts` with
> RD-401 and RD-402** and must be **serialized after** them (materials chain RD-401 → RD-402 →
> RD-405). It does **not** conflict with the Scene.tsx pair (RD-403/RD-410) except for the single
> `GlassEnvProbe` mount line in `Scene.tsx` (trivial; coordinate the mount with whoever is in
> Scene.tsx). RD405-001 is **independent** of `furnitureMaterials.ts` and can start in parallel
> with RD-401/402.

| ID | One-line | Effort | Files | Conflict group |
|---|---|---|---|---|
| **RD405-001** | Build the cheap PMREM env probe from the backdrop equirect (+ sky-gradient/`none`/orbit fallback), exposed via a module-level signal; mount controller in `Scene.tsx`; dispose-on-change; graceful no-gl. | M | `scene/lighting/glassEnvProbe.ts` (new), `scene/backdropEquirect.ts` (add `bakeSkyGradientEquirect`), `scene/Scene.tsx` (mount) | Scene.tsx mount line only (coordinate w/ RD-403/RD-410). Independent of materials chain. |
| **RD405-002** | Pure params: `glassReflectionIntensity(daylight)` + `glassFresnelParams(daylight)`; extend `GlassCheap` with `envMapIntensity`/fresnel fields. Unit-test both tiers + day/night monotonicity + bloom-safe ceiling. | S | `materials/materialRealism.ts`, `materials/materialRealism.test.ts` | **Materials chain — after RD-401/RD-402.** |
| **RD405-003** | Wire the probe + daylight-scaled `envMapIntensity` + fresnel fallback into the **cheap** glass branch of `getGlassMaterial`/`GlassMaterial` (and bind to `scene.environment` on Medium). | M | `materials/furnitureMaterials.ts`, `furniture/primitives/GlassMaterial.tsx` | **Materials chain — after RD-401/RD-402; depends on 001+002.** |
| **RD405-004** | Apply the same env reflection + daylight reflectivity + fresnel rim to the **window pane** material in `Window.tsx` (alongside the existing sky-catch lerp). | S | `apartment/Window.tsx` | Depends on 001+002. Independent file (no materials-chain conflict). |
| **RD405-005** | Headless verification: scenario screenshots of a window wall + a glass coffee table/cabinet on **Performance** (day & night), visually review for fresnel rim + sky reflection; assert material props per tier in a unit test. | S | `scripts/scenarios/glass-fresnel-flat.json` (new), `materials/furnitureMaterials` prop test (new or extend `furnitureMaterialColorSpace.test.ts` neighbour) | Depends on 001–004. |

Suggested order: **001 ∥ (RD-401/402)** → **002** → **003** → **004** → **005**. (001 and 004
can land before 002/003 since they don't touch `furnitureMaterials.ts`, but 003 needs the chain
clear.)

### Headless verification detail (RD405-005)

- **Scenario** (model on `scripts/scenarios/plan-glass-skycatch.json`): force
  `qualityTier = 'performance'`, place/select a glass coffee table + a glass-door cabinet, set a
  city backdrop in walk mode, then shoot a window wall and the glass furniture at **hour 13
  (day)** and **hour 23 (night)**. Assert per the playbook: by day the panes show a bright
  cool sky reflection with a brighter rim at grazing angles; by night they go dark/near-mirror.
  Orbit to a profile angle (per `scene/CLAUDE.md`) so the grazing-angle fresnel is visible (a
  head-on shot hides it). **Real-GPU-pending** caveat applies to the exact reflection pixels —
  flag it like F1/G-tail.
- **Unit (both modes, both tiers):** assert `getGlassMaterial('performance', …)` returns a
  cheap material with `envMapIntensity > 0` and (after probe set) a non-null `envMap`, no
  `transmission`; `getGlassMaterial('high', …)` still returns `transmission > 0` and no reliance
  on the probe. Assert `glassReflectionIntensity` is brighter by day than night and stays under
  the bloom threshold (mirror the existing `glassSkyCatchIntensity` "stays below 1.05" test).
  Assert the probe signal degrades gracefully (returns null) with no WebGL context.

---

## 4. Dependencies & constraints

- **Reflection source (chosen): reuse `bakeBackdropEquirect`**, PMREM-prefiltered once, with a
  cheap `bakeSkyGradientEquirect()` fallback for orbit / `backdrop:'none'`. Asset-free, ships in
  prod on all tiers. **No new dependency** — `PMREMGenerator` ships with three.
- **RD-412 (procedural Preetham/Hosek sky, S) is an optional upgrade, not a hard dep.** If RD-412
  lands, RD405-001 should consume its sky equirect as the probe source instead of the hand-baked
  gradient (same slot). RD-405 is fully shippable without it.
- **Do NOT assign the probe to `scene.environment` on Performance** — that would re-light every
  PBR surface and change the flat look + add a per-surface env cost. The probe is bound only to
  glass/mirror `material.envMap`. (On Medium+, prefer the *existing* `scene.environment` IBL for
  glass, falling back to the probe.)
- **Bloom safety:** keep the day-time fresnel/reflection emissive under the bloom threshold
  (the existing test asserts `glassSkyCatchIntensity(1) < 1.05`); reflectivity adds to perceived
  brightness, so cap `glassReflectionIntensity` accordingly and re-test.
- **Must stay High/Max-only:** the real `transmission`/`ior`/`thickness` pass (`GlassPhysical`,
  `transmissionTiers`) and the real planar mirror (`mirrorReflectorConfig`). RD-405 must **not**
  enable transmission below High.
- **Out of scope (note for follow-up):** `MirrorMaterial.tsx`'s cheap branch benefits for free
  from the §A probe (its `envMapIntensity 2.0` would finally reflect something on Performance) —
  a one-line follow-up, not part of the shipped RD-405 tasks.
- **No feature flag / tier change needed:** glass realism is core (not a panel/tool), part of the
  rendering pipeline; it tunes by `RenderTier`, same as the existing glass/mirror gates. No
  `FEATURE_FLAGS` entry, no Simple/Pro split (rendering quality is orthogonal to the Simple/Pro
  feature surface).
