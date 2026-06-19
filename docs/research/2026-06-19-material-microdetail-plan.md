# Procedural material micro-detail — implementer-ready plan (2026-06-19)

Concrete, one-agent-per-item build plan for the **procedural material micro-detail sweep**
(RD-402 roughness/AO/normal micro-variation + brushed-metal anisotropy, and RD-406
tile-repetition break-up + triplanar). Pure-client, **no real GPU**, **no external textures**,
prod-safe, tier-aware. Verifiable headlessly via pixel-stats on the generated buffers.

> **Proven pattern to copy.** Upholstery fabric already shipped this exact shape:
> `src/materials/procedural/upholsterySeams.ts` builds a *pure, deterministic, unit-tested*
> `Float32Array` **height field** from a tiny tunable params struct (`SeamParams`, intensities
> `0..1`, `0` cleanly drops a channel), and `furnitureMaterials.ts:getFabricNormal()` bakes it
> once into a shared normal singleton via `heightToNormalRGBA` behind the `pbrSurfaces` flag.
> Every item below mirrors that: **pure field helper → existing normal baker → cached singleton
> or `Fields` → gated by a flag → tasteful-by-default tunable amplitudes.**

> **Bake in the fabric lesson (read this first).** The fabric agent's first pass was *too loud*
> (quilted-leather, not cloth). Every amplitude in this plan is deliberately small, every pitch
> fine, every effect behind a `0..1` intensity with a conservative default. When in doubt, halve
> it. The acceptance bar is "now it doesn't read CGI", **never** "now you can see the effect."

---

## 0. Pipeline facts the implementer must know (cited)

There are **two distinct material paths**; an agent must know which one its family lives on.

### Path A — room finishes (floors, walls, splashbacks, worktops as finishes)
`MaterialDef{kind:'procedural', pattern}` → `materials/cache.ts:buildMaterial` →
`materials/procedural/generators.ts:generateProcedural[Raw]` → `PATTERN_FN[pattern]` →
`procedural/patterns/{wood,stone,tile,wall,fabric}.ts` returns a **`Fields`**
(`procedural/fieldKit.ts`: `albedo` Uint8ClampedArray sRGB, `height` Float32Array 0..1,
`rough` Float32Array 0..1, `normalStrength`, `metalness`). `generators.ts` bakes:
- albedo → sRGB `CanvasTexture` (`toTexture(..., true)`),
- `height` → **normal** via `heightToNormalRGBA(f.height, S, f.normalStrength)` (linear),
- `rough` → greyscale roughness map (linear).

Notes that constrain a Path-A change:
- **Worker path is free.** Any field added to `Fields` rides `procedural.worker.ts` /
  `runProceduralWorker.ts` automatically — no worker edits needed (see `materials/CLAUDE.md`).
  Painters MUST stay pure (no DOM/three) so the worker can run them.
- **Size caps** live in `generators.ts:PATTERN_SIZE_CAP` (256 smooth / 512 high-freq) and
  `effectivePatternSize`. New maps are computed at `S` inside the painter, so they inherit the
  cap for free. **Do not raise a cap** to "see detail better" — keep micro-detail legible at the
  existing cap (this is the tasteful constraint, restated as a perf rule).
- **Determinism** is via `hashSeed(\`${id}:${pattern}\`)` (`noise.ts`); painters offset that seed
  per noise field (e.g. `makeFbm(seed + 53, ...)`). Reuse distinct offsets — collisions make two
  fields correlate and read fake.
- **`makeFbm(seed, octaves, baseFreq)` `baseFreq` MUST be an integer** (it sizes the value-noise
  lattice; a float silently rounds — `noise.ts:makeValueNoise`). All new fbm freqs are integers.
- **AO note.** `MeshStandardMaterial.aoMap` needs a **second UV set (`uv2`)** in three.js and the
  room-finish geometry (`worldUv.ts`) only authors `uv`. So for Path A we **fold AO into the
  roughness/albedo darkening of the existing maps**, NOT a separate `aoMap` (cheaper, no geometry
  change). "AO micro-variation" in RD-402 = pore/crevice darkening baked into albedo + a rough
  bump there, exactly as `concrete`/`tile` grout already do.

### Path B — furniture surfaces (tinted shared singletons)
`furnitureMaterials.ts` builds shared `CanvasTexture` singletons once (`getFabricNormal`,
`getWoodMaps`, `getMarbleMaps`, `getConcreteMaps`, `getPaintNormal`, `getLeatherNormal`,
`getRattanNormal`) via the local `canvasFrom(...)` + `heightToNormalRGBA` (note: a **separate**
`N`-sized path from Path A, fixed N, not the `PATTERN_SIZE_CAP` system). They're cloned per
`(color, repeat)` in `getWoodMaterial`/`getStoneMaterial`/`getConcreteMaterial`/etc., tinted via
`material.color`. The richer variants are gated by **`pbrSurfaces`** (flag entry
`features/flags/registry.ts:295`, `default:true`, `tier:'simple'`). Albedo singletons tag
`SRGBColorSpace`; normal/rough stay linear (the CanvasTexture default).

### Shared infra both paths use
- **Anisotropy (RD-401, already in-flight).** `materials/anisotropy.ts` exports
  `applyAnisotropy(tex)` (stamps `getAnisotropy()`, tracks for device-max re-apply) and
  `getAnisotropy()`. Assume these exist. **Do not hardcode `texture.anisotropy`**; route every new
  `CanvasTexture` + every `.clone()` through `applyAnisotropy` (`materials/CLAUDE.md`).
- **Brushed-metal anisotropy** uses three.js `MeshPhysicalMaterial.anisotropy` +
  `anisotropyRotation` (+ optional `anisotropyMap`), confirmed shipping API in the dossier.
  There is currently **no metal pattern file and no `getMetalMaterial`** — appliances spread plain
  props from `applianceFinish(finish)` (`furnitureMaterials.ts:969`) onto a `meshStandardMaterial`
  (e.g. `Refrigerator.tsx:14,21`; same in Oven/Stove/RangeHood/Dishwasher/Microwave/
  WashingMachine/WineCooler).

### Headless verification harness (the proven shape)
`procedural/generators.test.ts` already inspects raw buffers via `generateProceduralRaw(id,
pattern, swatch, size)` (DOM-free) — determinism (byte-identical re-run), and **pixel-stats**
(`Set` of roughness values `> N`, grout darkness spread). For Path B singletons, unit-test the
**pure height-field helper** directly (like `upholsterySeams.test.ts`): dims, determinism, and a
property assertion (e.g. directional variance for brushed metal). No WebGL needed.

---

## 1. Design — per material family

Each family below specifies: **technique**, **which channels** (height→normal / roughness /
albedo-AO), **module layout**, **cache key**, **tier-gate**, **integration point**, **defaults
(tasteful)**, and **verification probe**. All amplitudes are starting points — tune *down* on
review.

### 1.1 Stone / marble veining (Path A `stone.ts` + Path B `getMarbleMaps`)
**Already partly done** (`marbleFields` has `microRough` fbm; `getMarbleMaps` has `cloud`). Gaps
the dossier flags: (a) veins are **albedo-only** — they should **perturb the normal** slightly
(a polished slab has the faintest relief along a vein/fissure), and (b) polished marble needs
**wet/dry roughness micro-variation** so it isn't a dead-uniform mirror.

- **Technique.** Reuse the existing turbulence-warped sinusoid `veinMask`. (1) Add
  `f.height += veinMask * VEIN_RELIEF` (tiny, ~0.08–0.12 of the height range) so the normal
  catches a vein. (2) The existing `microRough` fbm is good; widen its weight slightly and add a
  **broad low-freq roughness drift** (`makeFbm(seed+89, 2, 3)`, weight ~0.05) = polished/honed
  patches. Keep `normalStrength` at its current 4 (do **not** raise — veins must whisper).
- **Channels.** height (vein relief) + roughness (micro + broad drift). Albedo unchanged.
- **Params.** Add an internal `STONE_MICRO = { veinRelief: 0.1, roughDrift: 0.05 }` const at top
  of `stone.ts` (a tasteful default object, mirrors `DEFAULT_SEAM_PARAMS`); `0` disables.
- **Tier-gate.** Path A is unconditional (these maps already ship on all tiers — they're cheap and
  the Performance tier needs them; consistent with `materials/CLAUDE.md` "keep normal maps on all
  tiers"). Path B `getMarbleMaps` vein-relief addition gates behind `pbrSurfaces` (matching the
  existing `cloudN` gate there).
- **Integration.** `procedural/patterns/stone.ts:marbleFields` (add height + rough terms);
  `furnitureMaterials.ts:getMarbleMaps` (add `vein*VEIN_RELIEF` into its `height[i]`, behind
  `pbrSurfaces`). Concrete `concreteFields`/`getConcreteMaps` already have stain/mottle/pores —
  leave unless review finds them flat; if extended, add a **fine pinhole-pore roughness bump**
  (pores rougher than the sealed face) only.
- **Verify.** Extend `generators.test.ts`: roughness `Set` size `> 8` for `marble` (exists);
  **add** that the **normal map is non-flat along veins** — assert the normal buffer's `Set` of R
  values `> 4` (currently veins don't touch normal, so this guards the new height term).

### 1.2 Tile + grout + ceramic glaze (Path A `tile.ts`)
**Already partly done** (aged `groutDirt`, `microRough` on the face). Gaps: glaze **orange-peel
micro-normal on the tile face** (not the grout), and **roughness contrast** — grout should read
markedly rougher than the glaze (the contrast is what sells ceramic).

- **Technique.** On the **face only** (the `else` branch of `tileFields`/`hexagonFields`/
  `subwayFields`): add a fine glaze-peel term to `f.height` — `peel(x/S, y/S)` fbm at
  `makeFbm(seed+131, 3, 90)`, weight ~0.06 of height range. Grout already sets a low height; keep
  it. Roughness: nudge **glaze down** slightly and **grout up** so the gap widens (glaze ~0.16,
  grout ~0.9 — values already close, just guarantee the separation explicitly).
- **Channels.** height (glaze peel) + roughness (contrast). Albedo unchanged.
- **Ceramic glaze micro-variation** = the orange-peel + the existing speck tint; no new channel.
- **Params.** `TILE_MICRO = { glazePeel: 0.06 }` const; `0` disables.
- **Tier-gate.** Unconditional (Path A, cheap, all tiers).
- **Integration.** `procedural/patterns/tile.ts` — apply identically in `tileFields`,
  `hexagonFields`, `subwayFields` (the three glossy-ceramic painters; `checker`/`brick` are not
  ceramic, leave them). `normalStrength` stays as-is (22/20/14).
- **Verify.** `generators.test.ts`: assert face-pixel roughness spread (`Set > 8`, exists for
  tile) **and** add a "grout is rougher than glaze" check — sample a known grout pixel band vs a
  face band, assert mean(grout-rough) > mean(face-rough) + threshold.

### 1.3 Concrete / plaster mottle (Path A `concrete`/`plaster` in `stone.ts`/`wall.ts`)
**Concrete already has** stain + mottle + pores (RZ4). **Plaster is the gap**: `plasterFields`
and the shared `getPlasterNormal` 256² singleton carry only a tiny orange-peel; add a **faint
large-scale roughness variation** (roller-nap unevenness — the wall isn't uniformly matte).

- **Technique.** In `plasterFields`, add a broad fbm to the roughness output:
  `roller = makeFbm(seed+61, 2, 4)` → `rough = 0.92 + (roller-0.5)*0.05`. Keeps the near-flat
  orange-peel normal; only the roughness drifts. Concrete: optional — add a **pore-pit roughness
  bump** (pores rougher) if review finds the worktop flat; otherwise leave.
- **Channels.** roughness only (plaster). Normal unchanged (plaster must stay near-flat matte).
- **Params.** `PLASTER_MICRO = { rollerNap: 0.05 }` const; `0` disables.
- **Tier-gate.** Unconditional. **Caution:** `getPlasterNormal()` is a *shared singleton with no
  roughness map* (`cache.ts:136` sets a flat `roughness:0.92`). The roller-nap variation only
  reaches a wall if the plaster path emits a roughness map. **Decision:** add the roughness drift
  to `plasterFields` (so the full-material path gets it), and **leave the shared singleton
  flat-roughness** (a wall painted via the singleton stays uniform — acceptable; the singleton
  exists precisely to avoid per-colour maps). Document this split in the painter comment.
- **Integration.** `procedural/patterns/wall.ts:plasterFields`. No `cache.ts` change.
- **Verify.** `generators.test.ts`: `plaster` roughness `Set` size `> 4` (currently flat 0.92 →
  this guards the new term). Plaster isn't in the `generateProceduralRaw` patterns tested today —
  add it.

### 1.4 Brushed / satin metal anisotropy (Path B — NEW `getMetalMaterial`)
**The notable gap.** Appliances use flat `applianceFinish('steel') = {roughness:0.3,
metalness:0.88}` with no directional brushing. Add a procedural **brush-direction normal + a
roughness streak field** and switch brushed-steel finishes to a `MeshPhysicalMaterial` with
`anisotropy` set.

- **Technique (pure field helper).** New `procedural/metalBrush.ts` mirroring `upholsterySeams.ts`:
  `buildBrushedMetalFields(size, seed, BrushParams)` returning `{ height: Float32Array, rough:
  Float32Array }`. The brush is **directional**: fine streaks along **one axis** (say +U) — for
  each texel, `h = streakNoise(u * HIGH_FREQ, v * LOW_FREQ)` where the U frequency is high
  (~200/tile) and V frequency very low (~2) so the value smears into lengthwise hairlines (the
  same "wide-in-one-axis, narrow-in-the-other" trick `getWoodMaps` uses for pores,
  `furnitureMaterials.ts:138`). Add a faint perpendicular roughness streak so the steel grain
  reads under reflection. **Subtle** — brushed steel is mostly smooth; streak amplitude small.
- **Material.** New `getMetalMaterial(color, finish)` in `furnitureMaterials.ts` returning a
  `MeshPhysicalMaterial` with: `metalness`/`roughness` from `applianceFinish`, `normalMap` = baked
  brush normal (low `normalScale`, ~0.2), `anisotropy ≈ 0.5`, `anisotropyRotation = 0` (brush runs
  along U). Cache per `(color, finish)`. `roughnessMap` = baked streak rough.
- **Params (tasteful).** `DEFAULT_BRUSH_PARAMS = { streak: 0.5, anisotropy: 0.5 }`; `streak:0`
  drops the normal/rough streaks, `anisotropy:0` falls back to plain steel.
- **Tier-gate.** Gate the **`MeshPhysicalMaterial` anisotropy upgrade** behind `pbrSurfaces` (the
  realism flag, matching the dossier "gate the physical upgrade behind the existing realism
  flag"). When off, `getMetalMaterial` returns the legacy `MeshStandardMaterial` look (current
  `applianceFinish` props). **Test BOTH flag states** (CLAUDE.md hard rule for `pbrSurfaces`-gated
  behaviour — assert physical+anisotropy present when on, plain when off).
- **Integration.** `furnitureMaterials.ts` (new `getMetalMaterial` + a shared brush-normal
  singleton via `canvasFrom`). Then the appliance primitives: today they spread
  `...applianceFinish(finish)` onto `<meshStandardMaterial>`. **Two integration options:**
  - *Minimal/conflict-free:* keep `applianceFinish` returning props, add `getMetalMaterial` and
    have the primitives pass `material={getMetalMaterial(color, finish)}` for the `steel` body
    only. Touches each appliance primitive (8 files) — **per-file, parallelizable**, but spans
    `furniture/` not `materials/`.
  - *Recommended for this sweep:* land `getMetalMaterial` + the brush field + tests in the
    materials layer **only** (MAT-004), and wire the 8 appliance primitives in a **separate,
    independent item** (MAT-004b) so the materials chain stays serialized cleanly and the
    primitive wiring runs in its own lane. Listed separately below.
- **Verify (headless, the strong one).** `metalBrush.test.ts`: determinism + **directionality** —
  the dossier's key assertion: row-variance ≫ column-variance (a brush running along U has high
  variance scanning across U at fixed V, low variance scanning along V). Compute per-row and
  per-column std-dev of the height field, assert `meanRowStd > k * meanColStd`. Plus a flag test
  for `getMetalMaterial` (needs jsdom canvas; if unavailable, test the pure field + a params
  resolver instead).

### 1.5 Wood grain-flow per-plank (Path A already done; Path B already done)
**Already shipped.** `wood.ts` (`woodFields`/`parquetFields`/`herringboneFields`) has per-plank
tint/warmth/phase, warped cathedral bands, `microRough`, recessed grooves. Path B `getWoodMaps`
has the `planked` per-board variation behind `pbrSurfaces`. **No new work** unless review finds a
specific tell. Listed here only to confirm coverage and avoid duplicate effort.

### 1.6 RD-406 — tile-repetition break-up + triplanar
Two separable concerns; **do them as two items** (different files, different risk).

**(a) Repetition break-up (UV-domain, `materials/worldUv.ts`).** Large floors show the **same
tile every metre** — the "obvious tiling" tell. The truly shader-free, pure-code win is a
**UV-domain hash-rotation/offset**: add an option to `worldUvPlaneGeometry`/`worldUvShapeGeometry`
(or a new `breakRepetition` UV transform alongside `applyUvTransform`) that applies a
**per-tile-cell pseudo-random 90°/180° rotation + sub-tile offset** to the UVs so adjacent tiles
don't align. Pure UV math — no shader, no extra texture, no second UV set — unit-testable, and it
directly attacks the grid. (A macro-variation tint overlay was considered but rejected: blending a
second map on `MeshStandardMaterial` needs `onBeforeCompile` or a `uv2`-bound `aoMap`, both heavier
than the UV trick.)
- **Tier-gate.** New `tileBreakup` flag, **`tier:'pro'`** (an advanced realism refinement; Simple
  stays minimal per CLAUDE.md). Test both modes.
- **Integration.** `materials/worldUv.ts` (new transform) + the floor/wall geometry build sites
  that call `worldUvPlaneGeometry`/`worldUvShapeGeometry` (the agent locates them; pass the flag in).
- **Verify.** `worldUv.test.ts` extensions: no UV NaNs; assert the transform produces
  **period-breaking** offsets (adjacent cells get different rotation/offset) and is deterministic.

**(b) Triplanar for sloped/curved walls (`materials/triplanar.ts`, NEW).** UVs **stretch** on
sloped/CSG/curved walls (geometry already shipped — PARITY-SLOPEWALL/CURVEDWALL). Add a
lightweight **triplanar projection** material variant via `onBeforeCompile` injection: project the
albedo/normal/roughness on the dominant world axis (or blend three projections) so no UV stretch.
- **Technique.** `onBeforeCompile` patch that replaces UV sampling with world-position-projected
  sampling weighted by the world normal (standard triplanar blend). Provide a
  `makeTriplanar(material)` wrapper. Keep it to the **dominant-axis planar projection** first
  (cheapest, no triple-sample) and only blend if a wall's normal is near a 45° diagonal.
- **Tier-gate.** New `triplanarWalls` flag, **`tier:'pro'`** (advanced; only matters on
  sloped/curved geometry, itself a pro authoring feature). Test both modes.
- **Integration.** `materials/triplanar.ts` (new), applied in the sloped/curved-wall material
  selection path (the agent locates the exact mount — `apartment/walls/*`). **Independent** of the
  pattern files.
- **Verify.** `triplanar.test.ts`: the `onBeforeCompile` runs without throwing on a stub material;
  assert the shader source gained the projection uniforms/varyings; no NaN in a CPU-side
  projection helper unit-tested separately (the math, extracted pure).

---

## 2. Work items (MAT-xxx) — one-agent-sized, sequenced

Effort S/M/L. **Conflict groups**: items in the same group touch the same file(s) and **must
serialize**; different groups run in parallel.

| ID | One-line | Effort | Files touched | Conflict group | Depends on |
|----|----------|--------|---------------|----------------|------------|
| **MAT-001** ✅ | Stone/marble: vein normal-relief + polished roughness drift (Path A + Path B) | M | `procedural/patterns/stone.ts`, **`procedural/stoneSurface.ts` (new)** + its test, `furnitureMaterials.ts` (getMarbleMaps/getStoneMaterial), `generators.test.ts`, `stoneRoughDrift.test.ts` (new) | **G-stone** (`stone.ts`) + **G-furnmat** (`furnitureMaterials.ts`) + **G-gentest** (`generators.test.ts`) | RD-401 landed |
| **MAT-002** ✅ | Tile/ceramic: glaze orange-peel micro-normal + glaze↔grout roughness contrast | S | `procedural/patterns/tile.ts`, **`procedural/tileSurface.ts` (new)** + its test, `generators.test.ts` | **G-tile** (`tile.ts`) + **G-gentest** | RD-401 landed |
| **MAT-003** ✅ | Plaster: roller-nap roughness drift in `plasterFields` + a shared Path-B roughness-drift map on the plaster singleton (gated `pbrSurfaces`) — the singleton DID gain a roughness map (clean shared-multiplier route, like MAT-001 marble), so it's no longer Path-A-only | S | `procedural/patterns/wall.ts`, **`procedural/plasterSurface.ts` (new)** + its test, `generators.ts` (getPlasterNormal/getPlasterRoughness), `cache.ts`, `generators.test.ts` | **G-wall** (`wall.ts`) + **G-gentest** | RD-401 landed |
| **MAT-004** | Brushed-metal: `metalBrush.ts` field helper + `getMetalMaterial` (physical+anisotropy), flag-gated | M | `procedural/metalBrush.ts` (new), `procedural/metalBrush.test.ts` (new), `furnitureMaterials.ts` (getMetalMaterial + brush singleton) | **G-furnmat** (`furnitureMaterials.ts`) | RD-401 landed |
| **MAT-004b** | Wire 8 appliance primitives to `getMetalMaterial` for the `steel` body | S | `furniture/primitives/{Refrigerator,Oven,Stove,RangeHood,Dishwasher,Microwave,WashingMachine,WineCooler}.tsx` | **G-appliances** (own files) | MAT-004 |
| **MAT-006a** | RD-406 repetition break-up: per-tile UV hash-rotation/offset transform + `tileBreakup` flag | M | `materials/worldUv.ts`, `worldUv.test.ts`, floor/wall geo build sites, `features/flags/{registry,types}.ts` | **G-worlduv** + **G-flags** | none |
| **MAT-006b** | RD-406 triplanar: `materials/triplanar.ts` + apply to sloped/curved walls + `triplanarWalls` flag | M | `materials/triplanar.ts` (new), `triplanar.test.ts` (new), sloped/curved-wall material mount, `features/flags/{registry,types}.ts` | **G-flags** | none |

### Conflict matrix / dispatch guidance
- **`G-furnmat` (`furnitureMaterials.ts`) is shared by MAT-001 and MAT-004 → serialize them.**
  Recommended order: **MAT-004 then MAT-001** (MAT-004 adds a self-contained new function +
  singleton; MAT-001 edits existing `getMarbleMaps`; merging in that order minimises churn). Either
  order is fine as long as they don't run concurrently.
- **`G-gentest` (`generators.test.ts`) is shared by MAT-001, MAT-002, MAT-003 → serialize the
  test-file edits.** The *painter* files (`stone.ts`/`tile.ts`/`wall.ts`) are disjoint, so the
  three can be **built in parallel** but their `generators.test.ts` additions must land one at a
  time (small append-only `it(...)` blocks — trivial to rebase, but flag it to the orchestrator).
  *Mitigation:* if running all three in parallel, have each append its test in a clearly-fenced
  block; conflicts will be append-only and auto-resolvable.
- **`G-flags` (`features/flags/registry.ts` + `types.ts`) shared by MAT-006a and MAT-006b →
  serialize the two flag additions** (each adds one union member + one registry entry; append-only,
  trivial to serialize).
- **MAT-004b depends on MAT-004** (needs `getMetalMaterial` to exist). It touches only
  `furniture/primitives/*` — **conflict-free with everything else**, dispatch after MAT-004 lands.
- **Fully independent / safe to parallelize now:** MAT-002 (`tile.ts`), MAT-003 (`wall.ts`),
  MAT-006a (`worldUv.ts`), MAT-006b (`triplanar.ts` + wall mount) — modulo the shared
  `generators.test.ts` (MAT-002/003) and `flags` (MAT-006a/b) serialization notes above.

### Suggested batches
1. **Batch 1 (parallel):** MAT-002, MAT-003, MAT-006a, MAT-006b. *(Serialize the
   `generators.test.ts` edits between MAT-002/003, and the flag edits between MAT-006a/b.)*
2. **Batch 2 (serial on `furnitureMaterials.ts`):** MAT-004 → MAT-001.
3. **Batch 3:** MAT-004b (after MAT-004).

---

## 3. Cross-cutting rules every MAT item must follow

- **Tasteful-by-default (the fabric lesson).** Small amplitudes, fine pitch, every effect behind a
  `0..1`-style intensity with a conservative default (mirror `DEFAULT_SEAM_PARAMS`). Acceptance =
  "stops reading CGI," not "the effect is visible." Halve on doubt.
- **Pure + deterministic + unit-testable** field helpers (no DOM/three), exactly like
  `upholsterySeams.ts`. Path-A painters stay pure so the worker runs them. Seed via the existing
  `hashSeed`/`seed + offset` convention; use **distinct, non-colliding** offsets.
- **`makeFbm` `baseFreq` is an integer.** Always.
- **Colour-space.** Albedo `CanvasTexture` → `SRGBColorSpace`; normal + roughness stay **linear**
  (the default). Don't tag normal/rough as sRGB.
- **Anisotropy (RD-401).** Every new `CanvasTexture` and every `.clone()` goes through
  `applyAnisotropy(tex)`. Never set `texture.anisotropy` directly.
- **Size caps.** Don't raise `PATTERN_SIZE_CAP`. Keep micro-detail legible at the existing cap.
- **Feature-flag + tier.** Path-A pattern micro-detail rides the existing procedural maps (no new
  flag — it's cheap, all-tier, like RZ4). Path-B realism upgrades gate behind **`pbrSurfaces`**
  (the existing realism flag; `default:true`, `tier:'simple'`). RD-406 items add their own flags:
  **`tileBreakup`** and **`triplanarWalls`**, both **`tier:'pro'`** (advanced refinements; Simple
  stays minimal). **Any `pbrSurfaces`/`pro`-gated behaviour MUST be unit-tested in BOTH modes**
  (CLAUDE.md hard rule): assert present when on, absent/legacy when off.
- **Docs (CLAUDE.md hard rule).** When a MAT item lands, update `src/materials/CLAUDE.md` (the
  micro-detail bullet), `docs/ARCHITECTURE.md` if the module map changes (new `metalBrush.ts`/
  `triplanar.ts`/flags), and fold the corresponding `RD-402`/`RD-406` bullet out of
  `docs/research/2026-06-19-photoreal-parity-deepdive.md` per its own "when an RD lands" rule. Bump
  version per the versioning rule.
- **Headless verification, per item.** Pixel-stats on `generateProceduralRaw` buffers (Path A) or
  the pure field helper (Path B): determinism (byte-identical re-run) + a property assertion
  (roughness-`Set`-size > N for micro-variation; **row-var ≫ col-var** for brushed metal
  directionality; period-breaking offsets for UV break-up; shader-source/no-NaN for triplanar).
  Then the standard app visual-verification pass (`scripts/shot.mjs --scenario`, review the floor
  at a grazing angle + an appliance + a marble worktop) per `docs/visual-verification-playbook.md`
  — green tsc/tests is NOT proof the render is right.

---

## 4. Quick reference — exact integration points (file:symbol)

- Path-A painters: `src/materials/procedural/patterns/stone.ts:marbleFields` (MAT-001),
  `.../tile.ts:{tileFields,hexagonFields,subwayFields}` (MAT-002),
  `.../wall.ts:plasterFields` (MAT-003).
- Normal baker: `src/materials/procedural/noise.ts:heightToNormalRGBA`.
- `Fields` contract: `src/materials/procedural/fieldKit.ts` (`setPx`, `blank`, `shade`).
- Path-A dispatch + caps: `src/materials/procedural/generators.ts:{PATTERN_FN,PATTERN_SIZE_CAP,
  generateProceduralRaw}`; cache: `src/materials/cache.ts:buildMaterial`.
- Path-B singletons: `src/materials/furnitureMaterials.ts:{getMarbleMaps,getMetalMaterial(new),
  applianceFinish,canvasFrom,getFabricNormal}` — `pbrSurfaces` checked via `isFeatureEnabled`.
- Metal field helper (new): `src/materials/procedural/metalBrush.ts` (mirror `upholsterySeams.ts`).
- Anisotropy: `src/materials/anisotropy.ts:{applyAnisotropy,getAnisotropy}`.
- UV / RD-406: `src/materials/worldUv.ts:{worldUvPlaneGeometry,worldUvShapeGeometry,applyUvTransform}`
  (MAT-006a); `src/materials/triplanar.ts` (new, MAT-006b).
- Flags: `src/features/flags/registry.ts` (`pbrSurfaces` at :295; add `tileBreakup`/`triplanarWalls`)
  + `src/features/flags/types.ts` (union).
- Appliance consumers (MAT-004b): `src/furniture/primitives/{Refrigerator,Oven,Stove,RangeHood,
  Dishwasher,Microwave,WashingMachine,WineCooler}.tsx` — replace the `...applianceFinish(finish)`
  spread on the `steel` body with `material={getMetalMaterial(color, finish)}`.
- Verification template: `src/materials/procedural/generators.test.ts` (raw-buffer pixel-stats) +
  `src/materials/procedural/upholsterySeams.test.ts` (pure-field-helper pattern).
