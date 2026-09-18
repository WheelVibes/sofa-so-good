# Blender skill — sofa-so-good

> **Why skills live here and not in `.claude/skills/`.** `.gitignore:48` ignores
> `.claude/`, so a skill placed there would be **local-only and never committed** — which
> defeats the point of a living document future sessions read. See
> [`docs/skills/README.md`](README.md) for the convention.

Headless Blender for photoreal rendering and asset R&D. **Read this before writing bpy
code here**, and **append what you learn in the same session** — the point of this file
is that the next session does not re-derive what this one measured.

## Installed build — verified, not recalled

| | |
| --- | --- |
| binary | `/opt/homebrew/bin/blender` |
| version | **Blender 5.2.1 LTS**, build date 2026-08-25 |
| `bpy.app.version` | `(5, 2, 1)` |
| default engine | `BLENDER_EEVEE` |
| default view transform | **AgX** |
| Cycles device | `CPU` (no GPU compute configured) |

Blender 5.x is a major version. Most published bpy examples — and most model priors —
are 3.x/4.x. **Verify before assuming**; the three gotchas below were each found by
probing this build.

## Three gotchas that cost time if assumed

**1. Cycles is assignable but absent from the engine enum.**
`RenderSettings.bl_rna.properties['engine'].enum_items` lists **only `BLENDER_EEVEE`**
under `--factory-startup`. Yet `scene.render.engine = 'CYCLES'` succeeds and renders
(verified: 64×48 PNG, 4121 bytes). The enum is populated dynamically and `bl_rna` does
not see registered engines. **Never gate on it** — a "is Cycles available?" check
against the enum falsely reports no.

**2. `view_transform` is also dynamic — and the default is AgX.**
Its `enum_items` reads only `NONE`, while `scene.view_settings.view_transform` is
`AgX`. The app's three.js tiers tone-map with **AgX** too
(`src/scene/toneMappingThree.ts`), so **leaving the default alone is the closest match
to the real-time view**. Do not "fix" it to Filmic or Standard without a reason.
**But "closest" is not "equal"** — the two AgX implementations differ by up to 14 counts
on the neutral axis and 44 in a channel on saturated colour. Measured; see *AgX is not
AgX* below before quoting any absolute level across the two.

**3. Principled BSDF sockets are 4.x+/5.x names.**
There is **no `Specular`** and **no scalar `Subsurface`**. The full input list on 5.2.1:

    Base Color · Metallic · Roughness · IOR · Alpha · Thin Wall · Normal · Weight
    Diffuse Roughness · Subsurface Weight/Radius/Scale/IOR/Anisotropy
    Specular IOR Level · Specular Tint · Anisotropic · Anisotropic Rotation · Tangent
    Transmission Weight · Coat Weight/Roughness/IOR/Tint/Normal
    Sheen Weight/Roughness/Tint · Emission Color · Emission Strength
    Thin Film Thickness · Thin Film IOR

Use `sofa_scene.PRINCIPLED` rather than hardcoding a name.

## Invoking the scripts

Blender consumes its own argv, so **everything for the script goes after a bare `--`**.
Without it, Blender tries to parse `--glb` itself and fails.

    blender --background --factory-startup \
      --python python/scripts/blender/<script>.py -- <script args>

`--factory-startup` is deliberate: it ignores whatever add-ons and preferences the local
user has enabled, so a render is reproducible between machines.

### `inspect_asset.py` — turntable QA

    blender --background --factory-startup \
      --python python/scripts/blender/inspect_asset.py -- \
      --glb public/assets/furniture/tea-set-low.glb \
      --out /tmp/tea-qa --views 4 --samples 32 --res 800x600

Frames itself from the asset's own bounds, so it needs no per-asset tuning. Studio
three-point rig, not an HDRI — QA wants light that is identical between runs.

Verified run: `tea-set-low.glb` → `radius=0.459`, 2 views at 320×240/16 samples in a few
seconds; renders show the porcelain correctly lit on neutral grey.

### `render_still.py` — photoreal still (also the module Part A calls)

    blender --background --factory-startup \
      --python python/scripts/blender/render_still.py -- \
      --scene public/assets/furniture/pool-table-6ft.glb \
      --out /tmp/still.png --hdri studio_small_09 --samples 24 --res 400x300

`--hdri` takes a **catalog id**, a **path**, or **`procedural`** (generated gradient sky,
no network). Prints a JSON result line including `hdri_route` — `path`/`cache`/`download`/
`procedural` — so a silent fallback to the procedural sky is visible instead of passing for
a real HDRI. `--no-network` forces the offline path. Camera defaults to a bounds-framed
position when `--cam-pos` is omitted.

Verified: pool-table-6ft (26 meshes, radius 0.965) at 400×300/24 samples in **0.64 s** on
CPU; all three HDRI routes exercised, renders inspected by eye.

### `render_from_manifest.py` — the matched-pose reference, in one command

    blender --background --factory-startup \
      --python python/scripts/blender/render_from_manifest.py -- \
      --dir /tmp/bref --samples 64

`light-distribution.mjs BLENDREF=<dir>` writes `manifest.json` + `scene.glb` + the app's own
raster from one pose; this turns that directory into the physical reference for the *same*
pose. Camera position, look-at, vertical FOV and the sun's travel vector are **read from the
manifest, never retyped** — four flags, four chances to mis-transcribe a pose, and a
mis-transcribed pose is the most expensive error class in this arc (two rounds lost to framing
that looked fine and was not).

The manifest also records **which scene it is** — `scene.plan` (spec, index, id, name) and
`scene.invocation` (every `process.env` knob the probe reads that was actually set). Neither was
there before **2026-09-03**, and their absence cost this arc its evidence base: three of the five
reference pairs were lost when `/tmp` was cleared, and the invocations turned out not to be
recoverable. The CHANGELOG says "5-Room kitchen"; the probe needs `PLAN=5-Room
WINDOW=h5-kit-win LIGHTS=off` — the opening ids are per-plan (`h5-kit-win`, `h5-liv-win`,
`h5-b2-win`) and `WINDOW=kitchen` simply does not resolve. A reference directory now states
its own provenance, so any figure taken from it can be re-derived.

Thin by construction: it resolves flags and calls `render_still.main(argv)` in-process, so
scene construction has one implementation. Anything it cannot express is a missing
`render_still.py` flag, not a reason to duplicate. It also runs the GLB through
`glb_fix.strip_noop_dispersion()` first, since a `BLENDREF` export of the full apartment
always carries the 4 glass materials that abort the importer.

Verified: reproduces an existing hand-assembled reference to within sampling noise (p95/median
identical, p99/median 2.357 vs 2.362, mean R−B −29.5 vs −29.6) — and a **new** room's
reference costs ~37 s end to end (21 s export + 16 s render at 800×450/64 samples).

### `bake_material.py` — bake Cycles lighting to per-object textures

    blender --background --factory-startup \
      --python python/scripts/blender/bake_material.py -- \
      --dir /tmp/ld2 --pass visibility --min-area 3.0 --res 64 --samples 64

`--pass visibility | ao | diffuse | combined`. Targets are chosen by **surface area**
(`--min-area`, m²) rather than by name, because the room shell is the set of large flat meshes
in any plan whatever the exporter called them — a whole flat has 82 meshes over 3 m² out of
1274. `--limit` caps the batch, largest first. One image per object, not an atlas.

`--keep-emissive` keeps the exported EMISSIVE materials burning; the **default kills them**, because an irradiance lightmap is a daylight term and every emitter in a `scene-glb` export is a look device (see the 2026-09-12 lesson — a set baked with them live shows a warm cove streak on the ceiling). `index.json`'s `bake.kill_emissive` records which way a set went.

`--uv box` (default) builds a fresh non-tiling 3×2 box atlas and is **required** for the app's
shell meshes; `--uv existing` is only correct for assets that already have a unique 0…1 layout.
`--albedo` defaults to 0.5 for visibility bakes. See the lessons below for why both defaults are
what they are — each one is a measured failure, not a preference.

Reuses `render_visibility.py`'s world setup exactly, so a baked map and a rendered reference are
the same quantity and can be checked against each other.

Verified: 4 shell meshes at 64 px / 32 samples in ~4 s, means 0.164–0.428 across walls.

#### Reproducing a shipped map set — read the `bake` block, do not guess

`index.json` now carries a **`bake` object** recording the resolved invocation: `min_area, limit,
res, samples, bit_depth, per_map_scale, dilate, bake_margin, keep_glazing, portals, with_sun_disc,
diffuse_bounces, sun_travel`, the Blender version, and the rest (`v0.31.7.245`). Read it and pass
the same values. Sets baked before that commit — including the one in `public/assets/lightmaps` —
do NOT have it, and **cannot be reproduced from the index alone**.

That is not a hypothetical. `v0.31.7.239`–`.244` spent six rounds and three 40-minute bakes trying,
and the trap is worth knowing:

- **A matching map COUNT is not a matching bake.** A re-run at the shipped `--min-area 3.0` selected
  exactly 111 objects, same as shipped, which read as success. Every per-map `scale` was wrong.
- **`scale` is the map's own maximum × 1.02** (with `--per-map-scale`), so it is a direct readout of
  how much light that surface received. Diff `scale` per key between two indices — it is the
  sharpest available signal that two bakes differ, and it needs no app and no GPU.
- **Sky-visible maps agree trivially.** Any map whose brightest texel sees the sky through a window
  has `pre_max` = the sky's own radiance, so 33 of 111 shared one value (3.031) across two different
  bakes. Comparing only those proves nothing — pick keys whose maximum is interior-only.

Measured parameter sensitivities on one ceiling key, useful for bisecting a level mismatch:

| change | effect on that key's `scale` |
| --- | --- |
| `--diffuse-bounces` default → 12 | 1.309 → 1.769 (**+35 %**) |
| → 32 | 1.964 (overshoots) |
| `--keep-glazing` | 1.769 → 2.351 (**+33 %**) |
| `--portals` | 1.309 → 1.402 (+7 %, convergence not level) |
| `--with-sun-disc` | 3.03 → **56.4** — never for an irradiance pass |
| lamp emissives lit in the export | 1.769 → 2.909 (+64 %) |

Bisect with `--limit 10 --samples 256`: about 90 s per cell instead of 40 minutes, and enough to
reach the interior keys. Do NOT substitute a whole-map mean for a patch texel when comparing
distributions — it reads 2.3× out and inverts the sign of the effect, because a 3×2 atlas's slot
occupancy differs per mesh (`v0.31.7.244`).

## Repo facts worth knowing before you start

**The Poly Haven HDRIs are NOT bundled.** `src/scene/lighting/hdriCatalog.ts` serves them
from `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/` — CDN, CORS-enabled, fetched
at runtime. There are **no `.hdr` files on disk**. So a Blender path that wants the app's
environments must fetch and cache them locally; it cannot glob the repo.

**GLB export already exists**: `src/export/sceneGltf.ts` (`buildExportRoot`), driven from
`src/ui/openSceneExport.ts`, with a Worker path for large scenes. glTF is +Y up and
metres, matching the importer's defaults — **do not** pass axis/unit conversion flags.

**Sidecar precedent**: `scripts/scraper-server.mjs` and `scripts/price-server.mjs` — Node
`http` server, spawns Python from `python/scripts/`, port from a `*_PORT` env var, SSE for
progress. Follow that shape for the browser-build bridge.

## Lessons learned

*Newest first. Prune superseded entries rather than letting this grow — same discipline as
the research docs.*

- **2026-09-18 — a geometry change that moves wall VERTICES invalidates the lightmap set, and the
  orphan count is a FACE count, not a map count (LIGHTMAPS-REBAKE-MITRE).** WALL-MITRE-JOINTS moved
  every non-free wall end; `lightmapKey` hashes world-space vertices, so the boot line fell to
  **346/906 key lookups, applied 173/453** from 412/906 · 206/453. The brief predicted "33 keys
  will differ". Measured against the re-bake: **19 MAP keys differ** — the 33 is the boot line's
  FACE count and those faces sit on 19 objects (a wall object carries several keyed faces, and the
  line counts `urlFor` calls, two per keyed mesh). **When sizing a re-bake, convert between the two
  before quoting either**: 210 of 230 keys carried over untouched.
  · **A re-bake can also change the object SET, not just the keys.** `Mesh_81` (1.48 m² before the
  mitre) was cut back below `--min-area 1.0` and is simply not a candidate any more:
  `candidates_over_min_area` **230 → 229**, and the recovered boot line lands at **410/906 ·
  205/453** rather than the pre-mitre 412/906 · 206/453. Two lookups and one face short is not a
  bug and not a stale asset — it is one surface that stopped qualifying. Check
  `candidates_over_min_area` between two bakes before reading a coverage shortfall as breakage.
  · **Control the EXPORT before paying for the bake.** Three checks, ~2 min of `bpy`, that would
  each have cost 2.5 h to discover afterwards: `find_glazing()` returns 10; the service-yard door
  leaf lies along +X at the jamb (open) rather than in the `x = 6.175` wall plane; and at a mitred
  corner both walls' base vertices terminate on the SAME diagonal — at the household-shelter NE
  corner `(8.065, −5.025) → (8.365, −4.725)` for both `Mesh_301` and `Mesh_344`. Note the bbox test
  is USELESS for the last one: two mitred walls still have overlapping bounding boxes (0.234 m³
  here — the corner's own 300 × 300 square). **Compare vertices, not bounds.** A **T-junction is a
  different shape and is not mitred** (v0.35.4.0 says so): at bath2/service-yard the stub `Mesh_331`
  butts into the through run with a real 0.043 m³ overlap. Expected; do not chase it.
  · Timings reproduced within 4 % of the SUN-BOUNCE run on the same machine: **A 4096 spp 76 min,
  B 2048 spp 32 min, C 2048 spp 37 min = 2 h 25 m** for 229 maps at 256 px on Metal.
  · **Expect the shipped probe patches not to move.** All six (kitchen/living ceiling·wall·floor)
  came back within **±1 count** of the pre-mitre GPU baseline, because they sample surfaces whose
  keys never moved. The evidence that the re-bake worked is the BOOT LINE and the corner frame, not
  the patch table — and a patch table that does not move is the expected result, not a null run.
  · **A patch probe pointed at the wrong pixels reads as "no change" too.** Three rounds here were
  lost to rects that landed on floor instead of the wall face; the tell is the chroma
  (`R−B` 68–95 on the warm parquet against 20–27 on plaster). **Crop the region, LOOK at it, and
  measure in the CROP's own coordinates** — do not transform screen coordinates by hand.

- **2026-09-18 — the full 230-map three-arm result: ceiling ×2.48, floor ×1.96, wall ×1.70, and
  the sky-blue cast is cut by 60–72 % (SUN-BOUNCE, shipped-scale run).** A at 4096 samples, B and
  C at 2048, all `--bit-depth 16 --limit 600`, same export, 2 h 27 m total wall clock on Metal
  (A 77 min / B 33 min / C 37 min; 20 s/map at 4096, 8.5 s/map at 2048). Area-weighted interior
  means, 228 maps with usable interior slots:
  | orientation | n | area | A | candidate | ratio | `(R−B)/L` A → candidate |
  | --- | --- | --- | --- | --- | --- | --- |
  | ceiling | 22 | 110.7 m² | 0.0600 | 0.1487 | **2.48** | −0.617 → **−0.170** |
  | wall | 155 | 831.6 m² | 0.1377 | 0.2338 | **1.70** | −0.603 → **−0.281** |
  | floor | 51 | 200.1 m² | 0.0370 | 0.0724 | **1.96** | −0.603 → **−0.199** |
  The 12-object pilot at 512 samples predicted the full-set ratios to within a few per cent
  (ceiling 2.83 vs 2.82 on the same key), so **a 12-object `--limit` bisect is a sound instrument
  for this question** even though its `plan_context` makes it uninstallable.
  · **Control that the arm is the shipped bake:** arm A reproduces the shipped set's key set
  EXACTLY — 230 maps, ctx `3ababbe3`, **230 of 230 `(ctx, key)` pairs in both**, zero orphans
  either way — and per-map `scale` agrees to **p05 0.932 / p50 1.041 / p95 1.122**, the residual
  being this export's noon sun against the shipped one. That is the control `v0.31.7.239`-`.244`
  never had.
  · ⚠️ **Known limitation carried in the artefact:** the set is baked at ONE sun
  (`[-6.408, -24.153, 0.330]`, hour 12), so it is valid for that hour only — recorded in
  `bake.composed.note` rather than left to memory.
- **2026-09-18 — an `--encode 0.5` set recovers the dark end that 8 bits throws away, and it is
  worth 56 → 7 maps (SUN-BOUNCE-ENCODE, quantified).** Levels the MEDIAN written interior texel
  gets, over the 228 composed maps: **linear 8-bit p05 0.1 / p50 11.8, with 56 maps at ≤2 levels
  and 37 storing exactly ZERO**; `--encode 0.5` **p05 4.0 / p50 55.0, 7 maps at ≤2 levels and none
  at zero**. Adding the sun bounce makes the linear case slightly WORSE on the darkest maps,
  because the composed peak rises and the peak sets `scale` — so the encode is not optional polish,
  it is what stops the fix from costing the dark surfaces. Bytes: shipped 10.16 MB, composed linear
  **9.42 MB**, composed `encode 0.5` **12.29 MB** (+21 % over shipped — a square root spreads
  texels over more distinct levels, so it compresses worse, which is the effect working), 16-bit
  **31.26 MB**.
  · **Measure the encode's benefit against the 16-BIT reference, never against the linear 8-bit
  file.** Doing the latter reads the levels off a buffer that has ALREADY quantised the dark end to
  zero, and `255·√(0)` is 0 — it reported three maps as unrecoverable when they recover to 5, 8 and
  15 levels. Control that settles it: predicted `255·√u` from the 16-bit set against what the
  `encode 0.5` PNG actually stores agrees to **≤1 level on every map** (p50 54.9 vs 55.0).

- **2026-09-18 — the 8-bit lightmap's dark end cannot be fixed from the BAKE side, and the two
  obvious levers are both inert in this app (SUN-BOUNCE-ENCODE).** Measured while sizing the full
  composed set, and both answers are in `src/`, not in `bake_material.py`:
  · **`--encode 0.5` is REFUSED, not misread.** `lightmapIndex.ts` returns
  `index uses --encode 0.5; this build only reads unencoded maps` for any index with
  `encode != 1`, and its comment names `pow(v, 1/encode)` as the eventual fix. Good design — an
  encoded set that loaded would be wrong by a power everywhere — but it means an encoded set is
  something built AHEAD of a shader change, never a droppable replacement.
  · **`--bit-depth 16` is inert.** `VisibilityLightmaps.tsx` loads through three's `TextureLoader`,
  i.e. an `HTMLImageElement`, which every browser decodes to **8 bits per channel**. Measured cost
  of doing it anyway: **4.6× the bytes** for a bit-identical GPU upload.
  · **What IS worth doing, and is free: bake the ARMS at 16 bits and quantise ONCE.** Composing
  `A + (B - C)` from three separately-quantised 8-bit arms destroys exactly the maps the exercise
  exists for — against a 16-bit-sourced compose the median written texel came out **14 % wrong on
  one map, 64 % on another, and exactly ZERO on two** (their whole dark end quantises away before
  the subtraction). Precision in an intermediate costs nothing at the app.
- **2026-09-18 — the per-map `scale` is NOT set by an exterior slot; the dynamic range is INSIDE
  the interior slot, and a large part of "dark" is UNWRITTEN HOLES.** Worth recording because the
  plausible fix — re-derive `scale` from the interior slots only — was measured and buys nothing:
  `max / int_max = 1.00` on all 12 of the largest objects. The real shape is a 14–125× range
  *within* one slot (p95 0.16–1.41 against a p50 of 0.011–0.023) on top of a hole fraction that
  reaches **98.4 %** (`114cf680`: only 1.6 % of its interior slots were ever written, `--fill-holes`
  being off in the shipped set). **So do not quote `int_mean` as "how bright this surface is"** —
  on those maps it is mostly an average over zeros, and it inflated my own first pass at the
  quantisation figures by an order of magnitude. Quote the median of the WRITTEN texels, and state
  the written fraction beside it.
- **2026-09-18 — `plan_context` depends on `--limit`, so a measurement bake does NOT key like the
  shipped set.** The same export, same everything else, produced ctx **`b5f98bf1`** at `--limit 12`
  and **`3ababbe3`** at `--limit 600` — and `3ababbe3` is the shipped set's own context. The
  context is hashed over the selected object set, which is what makes it a correct identity, but
  it means a 12-object bisect set can never be dropped into `public/` to "just look at it": the
  app resolves maps by `(ctx, key)` and would match none of them. Bisect on the numbers; only a
  full-`--limit` bake is installable.
- **2026-09-18 — the zsh unquoted-variable trap, FOURTH instance, this time inside a `for` loop
  building flags.** `for v in "a:--bit-depth 8" ...; do ... $f; done` passes `--bit-depth 8` as ONE
  token and argparse reports *"unrecognized arguments: --bit-depth 8"* for a flag it plainly
  declares. This file has recorded the lesson twice and I hit it twice in one session, which is
  the point `changelogVersions.test.ts` already makes: prose is not a guard. **The rule that
  survives: never build a flag string. Write the flags literally at the call site, or put them in
  a bash array.** The tell is always the same — argparse rejecting a flag that is in its own usage
  line.

- **2026-09-18 — the SUN'S BOUNCES are 1.4–2.8× of what the shipped irradiance bake holds, and
  adding them back also NEUTRALISES the sky-blue (SUN-BOUNCE).** Three arms on the same walk-mode
  export (`/tmp/photoreal-mobile/export`, hour 12, sun travel `[-6.408, -24.153, 0.330]`,
  elevation 75.1°), identical shipped parameters at `--limit 12 --samples 512 --res 256`:
  **A** = `--pass irradiance` (shipped: dome direct + dome bounces), **B** = `--with-sun-disc
  --indirect-only`, **C** = `--indirect-only`. `B − C` per texel is the sun-bounce term with the
  direct double-count excluded from both sides, exactly as `--indirect-only`'s own help promises,
  and `candidate = A + (B − C)` is the map the app's decomposition should have been carrying all
  along. Interior-slot means, in irradiance units (each map multiplied by its own `scale` first):
  **ceiling ×2.83, floor ×2.51, 10 walls ×1.02–3.81** (area-weighted wall ×1.42). The chroma moves
  with it: `(R−B)/luma` on the living/dining ceiling goes **−0.637 → −0.091** and on the floor
  **−0.786 → −0.266**, i.e. the blue cast the app shows on every mapped surface is *the missing sun
  bounce*, not a bake bug — the dome alone is blue by construction and the sun's bounce off warm
  floor and plaster is what re-balances it. The effect is **orientation-dependent in the direction
  physics predicts**: the surfaces that see the sun-lit floor over a wide solid angle (ceiling,
  and walls facing the sunlit patch) gain most; a wall in a windowless interior corner
  (`Mesh_155`, `114cf680`) gains **×1.02**, i.e. nothing, because no sun reaches it to bounce.
  · Composed by `python/scripts/blender/compose_sun_bounce.py` (pure post-processor, no `bpy`,
  hand-rolled `zlib`+`struct` PNG codec so it runs under either interpreter). It re-derives each
  map's `scale` as the composed max × 1.02 and records all three source `bake` blocks under
  `bake.composed`. Round-trip control: composed-in-memory vs composed-read-back agrees to **≤0.6 %**
  on the interior mean, and the hand-rolled decoder is **bit-identical** to PIL on a shipped map.
- **2026-09-18 — the shipped 8-bit maps' "salt-and-pepper static" is QUANTISATION, not sampling
  noise, and `--per-map-scale` cannot fix it because the max is THE SKY.** Any map with an atlas
  slot that sees the aperture has `pre_max` ≈ the sky's own radiance (2.89 on this export, the
  value 33 of 111 maps shared in `v0.31.7.244`), while its interior slots sit at 0.01. The 8-bit
  step is then `scale/255`, and measured against each map's own interior mean that is **65–120 %
  for 7 of the 12 largest objects** — the interior of those maps is carried on one or two code
  levels. Against the same maps' seed-pair sampling noise this is the dominant error by an order
  of magnitude, so raising `--samples` or reverting the measured-harmful `--denoise` would both
  miss. The fixes that would actually work are `--bit-depth 16`, `--encode 0.5`, or excluding
  sky-seeing slots from the per-map maximum. Composing the sun bounce does NOT fix it (it moves
  the step to 34–165 % on those maps, better on four and worse on two, because both the peak and
  the interior rise).
- **2026-09-18 — a bake PNG's row 0 is the TOP; the index's `slots` are in Blender's BOTTOM-UP
  order, and a naive decoder reads the empty mirror row.** Reading arm A with PIL without a
  vertical flip put the living/dining ceiling's interior mean at **0.0001 instead of 0.0495** and
  the floor's at 0.0001 instead of 0.0269 — both single-sided meshes whose one interior slot is in
  row 0. It is silent on any two-sided wall (both rows occupied), so a first pass over 12 objects
  looked plausible and only the two most interesting surfaces were wrong. **Control that catches
  it in one line:** `bake_material.py` already prints `int_mean` per object; a reader that agrees
  with it to the 8-bit step has the convention right, and one that reads ~0 on a one-sided mesh
  does not. Arithmetic BETWEEN maps is unaffected (all arms share the convention), which is why
  `compose_sun_bounce.py` never flips — only reporting and slot masking need the flip.
- **2026-09-18 — the zsh unquoted-variable trap recurred, on the first command of the session, in
  a file that documents it.** `COMMON="--dir … --pass irradiance …"; blender … $COMMON` passed ONE
  argv token and all three arms failed in 1 s with *"one of the arguments --scene --dir is
  required"*. A bash array (`COMMON=(…)` + `"${COMMON[@]}"`) is the form that cannot do this; the
  `${=VAR}` fix the entry below suggests only works in zsh and does not survive being run under
  `bash`. Cost 1 minute because the arms fail instantly, but it is the third recorded instance —
  write the array, do not reason about the shell.
- **2026-09-18 — timings for sizing a three-arm bake (Metal GPU, 256 px, adaptive 0.001).**
  `--limit 1` costs **7 s** end to end, so startup + 62 MB GLB import + scene prep is **~5 s** and
  the marginal cost is **~3.5 s/map at 512 samples**. Whole arms measured **A 47 s / B 41 s /
  C 48 s** for 12 maps — `--indirect-only` is NOT cheaper, so all three arms cost the same.
  `--min-area 1.0` yields `candidates_over_min_area: 230` on the default flat (the shipped
  `--limit 600` never binds), so a full arm is 230 maps, and at the shipped 4096 samples ≈ 24 s/map
  ⇒ **~1.5 h per arm, ~4.5–5 h for three**. If that is too much: A must be at full quality because
  it carries the level, but `B − C` is a smooth low-magnitude difference and can be baked at far
  fewer samples than A — worth measuring before paying for three full arms.

- **2026-09-12 — `bake_material.py` now KILLS EMISSIVES BY DEFAULT (`--keep-emissive` opts out), and
  the contamination measured below is gone in one re-bake.** `rebake6` = `rebake5a`'s exact
  invocation, same GLB (`/tmp/rebake5/scene.glb`), same pinned manifest sun, one variable changed:
  `kill_all_emissive` zeroed **23 materials, total strength 31.27**. Results, all against the same
  live-key dump: **maps with R > B 20/230 → 4/229**, i.e. BELOW the shipped set's 6/195 — the bake
  is now sky-tinted everywhere, as a daylit irradiance bake must be. The ceiling crop's R−B at the
  living-window pose goes **+2.9 (warm, the streak) → −7.0**, against shipped −3.3, and the warm
  wash is gone from the frame. Key set, map count and live-key coverage are IDENTICAL to `rebake5a`
  (230 maps, 0 collisions, 214 live hits, +80 over shipped), which is the control that the only
  variable was the emissive. Per-map `scale` falls to a median **0.895×** of `rebake5a` with a p05
  of 0.231 — the contaminated maps were the lamp-facing ones — and one surface (`81242ea0`, old
  scale 2e-4) bakes to exactly zero because emissive was ALL it ever received.
  · `kill_all_emissive` moved to `sofa_scene.py` so the reference renderer and the bake cannot
  drift apart; `render_weather.py` re-exports the name. The index's `bake` block now records
  `kill_emissive`, `emissive_materials_zeroed` and `emissive_strength_zeroed`, so which way a set
  was baked is readable off the artefact instead of inferred from a hue census.
- **2026-09-12 — fit `IRRADIANCE_GAIN` in LINEAR, split LM-vs-FILL, and CUT THE CEILING or the fit
  goes NEGATIVE.** `scripts/dev-probes/lightmap-gain-fit.py` (the analysis half of
  `lightmap-gain-linear.mjs`) classifies pixels by whether they respond to the gain — `replace`-mode
  injection is exactly AFFINE in it, measured max relative residual **0.20 %** over an 8-point
  sweep, so the sweep labels its own pixels and the classifier threshold is irrelevant (0.02/0.05/
  0.10 give the same fit to 0.01). With the ceiling IN, the fitted gain is **negative** for every
  set including the shipped one, because the reference's ceiling row-mean is 0.004–0.02 against
  0.04–0.14 below it and the app/ref ratio reads **12–43** there — the unmeasurable-ceiling finding
  below, now quantified. With the top 22 % of rows dropped: **rebake6 2.67 (band 2.0–2.9 across an
  18–26 % cut), rebake5a 1.68, shipped 0.94** — removing baked lamp energy pushes the honest gain UP
  by 1.6×, as it must. At the shipped 4.2 `rebake6` puts lightmapped surfaces **1.19×** the physical
  reference (rebake5a: 1.49×) while fill-only surfaces sit at **0.735×** — LIGHTMAP-COVERAGE's two
  cancelling errors, reproduced by an independent instrument.
  · **The reference's linear buffer is now readable without guessing**: `exr_dump.py` dumps the
  scene-referred EXR to `.npy` through the same `bpy` path `agx_three.py` uses, CONTROLLED by
  pushing the dump through `agx_three.agx()` at the app's exposure 1.38 and diffing against the
  `agx_three.py --image` PNG made from the same EXR — **mean 0.18 counts, max 0.5**.
- **2026-09-12 — an irradiance bake taken with `--keep-glazing` and the EXPORTED EMISSIVES LIVE is a
  bake of the app's LOOK DEVICES, and it is visible as a warm streak on a ceiling (COVE-EMISSIVE-BAKE).**
  `rebake5a` (230 maps, `keep_glazing: true`, adaptive 4096) renders a warm orange band along the
  right-hand ceiling edge at the living-window pose that the shipped set does not have. Adjudicated
  by rendering the SAME pose from the SAME GLB under two worlds, 10 s each on Metal:
  `render_weather.py --conditions clear --keep-glazing --keep-emissive --no-ground --sun-intensity 0`
  (the world the bake saw) reproduces the streak **exactly**, and the physical arm (apertures open,
  `kill_all_emissive`, sun 1.0) has **no trace of it**. Named the source: material colour
  `[1.0, 0.624, 0.296]` linear = **`CoveLight.tsx`'s `ledColor` `#ffcf94`**, strength 1.8, at three
  `(12.4, 2.44, 2.9)`. `LIGHTS=off` does not touch it (the `lightOn` trap below). Cheap global tell,
  no render needed: **maps with `R > B` go 4/195 (shipped) → 23/230 (rebake5a)** — a daylit
  irradiance bake is sky-tinted everywhere, so a warm map is contamination.
  · The TV "halo" in the same frame is the OPPOSITE verdict and the same method settled it:
  correlating the wall's spatial pattern against the PHYSICAL arm gives **+0.739 for rebake5a
  against +0.566 for the shipped set** (and rebake5a correlates LESS with the emissive arm, +0.375
  vs +0.499). It is real sky-bounce occlusion by the TV and the floor lamp, and the candidate
  tracks it better. The app still UNDER-states it: spatial rel-sd 36.7 % against Cycles' 68.5 %.
- **2026-09-12 — `--linear-stops` needs NEGATIVE stops for an interior, and the two-exposure control
  is not optional.** `render_weather.py --linear-stops 3` clips everything above linear 0.125, which
  on this scene silently pinned the walls AND the sky to the same recovered value and produced a
  "brighter than the sky" wall. `-5` fixes the clip and destroys the shadow end instead (a linear
  0.0006 lands on ~16 of 65535 and the ceiling reads as flat blotches). **`--linear-stops 0` is the
  usable setting here** (interior max 0.17, window clips and is masked anyway); the +0/+2 pair then
  agrees to **0.6–1.1 %**, which is the control.
- **2026-09-12 — a Cycles reference of this export CANNOT adjudicate the CEILING.** With apertures
  open and emissives killed the ceiling renders at irradiance **0.015** against walls 0.26–0.47 and
  floor 0.40, i.e. ~4 % of the floor — while a radiosity estimate from the reference's OWN wall and
  floor values puts it near 0.13, **9x higher**. It is not occlusion (a 2000-ray hemisphere from the
  ceiling is blocked within 50 cm on only 1.5 % of rays) and not albedo (0.92, read off `--albedo`).
  Unresolved. It matters because the ceiling is the surface the SHIPPED lightmap set actually covers,
  so any gain fitted against a whole frame that includes it is fitting an unmeasurable surface.
- **2026-09-12 — `aoGain=0` does NOT ablate the lightmap.** `VisibilityLightmaps.tsx:235` gates on
  `gainOverride > 0`, so zero falls back to `IRRADIANCE_GAIN` and the "off" arm is the default arm —
  identical frames, which reads as "the gain does nothing". Use **`aoGain=0.001`**. The rendered
  radiance is exactly AFFINE in the gain (checked: residual p50 4e-4, p95 5e-3 in linear), so two
  arms give the per-pixel intercept and slope, and the slope is a free CLASSIFIER of which pixels
  carry a map.
- **2026-09-12 — a Cycles reference of this scene is a SEALED BOX, and without `--open-apertures`
  no daylight enters it at all.** Measured on the default-flat export at the living/dining pose
  (`Standard` view transform, +3 stops, every emissive zeroed): the interior renders at mean
  **2.3e-6** — black — while the same scene with the 9 glazing objects deleted reads **235/255**.
  The panes are not opaque; they carry `Transmission Weight` **0.92**. Light through a refractive
  surface onto a diffuse one is a **CAUSTIC** path, and Cycles' next-event estimation cannot sample
  the sky through it, so the room is lit only by paths that happen to refract — which at any
  practical sample count is nothing. This file already records the mirror image for visibility
  bakes ("whitening every material SEALS THE WINDOWS … delete transmissive meshes first"); it
  applies to **any** daylight reference of this apartment. The cost of deleting the glazing is the
  pane's ~8 % loss and its tint, both of which cancel in a ratio.
- **2026-09-12 — every reference built from a `scene-glb` export is partly lit by EXPORTED
  EMISSIVES, and `--no-glazing-emissive` does not catch them.** That flag selects through
  `render_visibility.find_glazing()`, which on this export matches **nothing** — it zeroed 0
  sockets. A census of the same GLB found **21 emissive materials**: the warm fixture-glow discs at
  strength 1.6–2.05 and, dominating the frame, **52 instances of a 1.76 m cool-blue bar at 1.4**
  (the window grille/mullion sky-catch). With them live, the `clear` and `overcast` arms of a
  four-way weather comparison agreed to **0.1 %** on the interior mean — and so did the GLAZING
  region, which is the one part of a frame that cannot possibly be weather-invariant. **That
  exterior control is what caught it.** `render_weather.py:kill_all_emissive()` zeroes every
  `Emission Strength`; every emitter in this export is a LOOK device rather than a physical source,
  so a daylight reference is more faithful without them.
  · Related, and a trap in its own right: **`lightOn: 'no'` per item does NOT extinguish the
    fixture GLOW.** It removes the point light (`manifest.lights.point` comes back empty, which
    reads as success) while `fixtureGlow`'s emissive rides `lightsMode`, which the export leaves at
    `'on'`. `scene-glb.mjs LIGHTS=off` flips the per-item prop only.
- **2026-09-12 — `render_still.py --sun-energy` defaults to 3.0 and is passed straight into the sky
  node's `sun_intensity`, so every reference in this arc renders a sun THREE TIMES its physical
  strength.** Measured consequence: the clear sky's diffuse share falls to **k_d = 0.096 → 0.034**
  of global. That is invisible for an absolute-level comparison (the arc compares ratios anyway)
  and fatal for anything about the beam/diffuse SPLIT, which is what a weather study is. Pass
  `--sun-energy 1.0` when the split matters; `render_weather.py` defaults to it and says so.
- **2026-09-12 — Blender's atmospheric sky has NO LIT GROUND, and for a vertical window that is the
  largest missing term.** `ShaderNodeTexSky.ground_albedo` tints the SKY; it does not create a lit
  lower hemisphere, and `scene-glb` exports no ground either (`Estate.tsx` is `noExport`). At a
  tropical noon the sun is ~87° up, so the beam meets a vertical surface at `cos 87° = 0.05` and
  the sunlit ground outside is what actually lights the room. Measured with a white Lambertian
  probe plane facing the window: **`E_v` = 0.0027 of the sky's `E_h` under `clear` against 0.0572
  under `overcast`** — i.e. the model claimed an overcast sky delivers 21x more light to the window
  than a clear one, which is nonsense. Adding a Lambertian ground at the flat's true storey depth
  (20.4 m, albedo 0.2) puts it at **0.1925 vs 0.0183**, the right way round.
- **2026-09-12 — do NOT read pixels back through `bpy` in background mode; they cannot be trusted
  on this build.** `bpy.data.images.load(path).pixels` returned all zeros for a render that had
  plainly succeeded, and later returned **1.50** for a world background of exactly **1.0**
  (`(1,0,0)` came back as 0.403). Both an EXR sidecar and a PNG reproduced it. What works: render a
  **16-bit PNG** through `view_transform = 'Standard'` at a known `view_settings.exposure`, and
  decode it with `zlib` + `struct` (~50 lines, `render_weather.py:read_png16`) — the same
  "Blender's bundled Python has no imaging library, hand-roll it" call `hdri.py` already makes.
  `linear = srgb_to_linear(value) * 2^-stops` is then exact. **The control that proves it:** the
  recovered linear values are identical at two different exposure offsets (`-2` and `-3` stops both
  gave `p50 = 4.994e-2`).
  · On the JS side, **`sharp(...).raw({depth:'ushort'})` silently hands back 8-bit values in 16-bit
    slots** — max 255 across a frame containing white. `.toColourspace('rgb16')` first is what
    makes it real 16-bit.
- **2026-09-12 — `ShaderNodeTexCoord` → `Generated` in a WORLD shader is the world-space VIEW RAY
  direction.** Probed on this build with a 1-pixel 200 mm camera: looking straight down reads
  `z = −0.99`, straight up `z = +1`. That is what makes an analytic sky gradient (e.g. the CIE
  overcast `L(θ) = L_z(1 + 2cos θ)/3`) buildable without an HDRI. Two notes: `Geometry → Incoming`
  also carries a direction but is the reverse on some builds, so re-probe rather than swapping
  them; and carry the angular profile on the Background node's **Strength** (a scalar socket) with
  the chroma on its **Color**, which avoids the `Mix`/`MixRGB` nodes that were renamed between 3.x
  and 4.x.
- **2026-09-12 — a sky model should model the SKY; the ground is geometry.** The CIE overcast dome
  first shipped with a synthetic below-horizon term derived from its own integral
  (`ρ·E_h/π = 0.233·L_z`). With a real ground plane in the scene that double-counts — and not
  harmlessly: the synthetic term was BRIGHTER than a real albedo-0.2 ground, so adding the real
  ground made the overcast arm's vertical irradiance FALL, 0.0572 → 0.0183. An irradiance that goes
  DOWN when a reflector is added is physically impossible and is the cheapest available tell.
- **2026-09-12 — `--flag value` fails in ZSH when the flag comes from an unquoted variable.** zsh
  does not word-split unquoted parameter expansions, so `cut="--section-cut 2.35"; blender … $cut`
  passes ONE argv token `"--section-cut 2.35"` and argparse reports *"unrecognized arguments"* for
  a flag that is plainly declared. Use `${=cut}` or an array. Cost two runs, and it looks exactly
  like a parser bug in the script.

- **2026-09-05 — `inspect_asset.py` view_00 is the glTF +Z face; the azimuth step is
  360°/`--views`.** The camera for view *i* sits at Blender `(cx + d·sin az, cy − d·cos az)`,
  so view_00 looks along +Y at the model's −Y face, which the glTF importer maps to **+Z** —
  the direction every furniture primitive faces. With `--views 4` the sequence is +Z, +X, −Z,
  −X; with `--views 2` it is +Z then −Z (NOT a side view — misread once). Used this to read the
  facing of the eight Poly Haven hero models before baking a yaw into each GLB
  (`scripts/asset-pipeline/fetch-hero-models.mjs`): six already faced +Z,
  `wooden_display_shelves_01` faced +X (yaw −90°), `modern_coffee_table_01`'s long axis ran
  along Z (yaw 90°). The Poly Haven `/info` API's `dimensions` array is NOT reliable for axis
  order (it reported the coffee table as 1.2 × 0.6 while the GLB bbox was 0.6 × 1.2) — measure
  the GLB, don't trust the metadata. Verified by re-rendering the baked GLBs: all four checked
  show the front at view_00. 8 turntables at 480×360/16 samples take ~2 min total on CPU.
- **2026-09-03 — there is no `NISHITA` sky on this build.** `sky_type` is
  `HOSEK_WILKIE` / `MULTIPLE_SCATTERING` / `PREETHAM` / `SINGLE_SCATTERING`, defaulting to
  **`MULTIPLE_SCATTERING`** (the Nishita successor). Code written against 4.x's `NISHITA`
  raises on assignment. With `sun_disc=True` the node carries the sun itself, so add **no**
  separate SUN lamp — a lamp's energy would be a second free parameter to invent.
- **2026-09-03 — use the atmospheric sky, not a calibrated lamp, when Cycles is the
  reference.** The app's intensities are artistic (its sun is ~1.0, neither watts nor a
  plausible ~100 000 lx), so fitting Cycles to them makes the reference agree with the thing
  being measured. Place the physical sky from the app's sun *direction* and let the model
  supply radiance. Sanity check that worked: derived elevation **83.53°** for bedroom3 at
  13:00, which is correctly near-overhead for Singapore in early September — a free check on
  both the app's sun and the Y-up→Z-up conversion.
- **2026-09-03 — `--flag=value`, not `--flag value`, for anything that can be negative.**
  argparse treats a value whose first character is `-` as another option and fails with
  *"expected one argument"*. `--sun-dir` and any camera coordinate can be negative. **Passing
  argv as a Python list does not avoid this** — the rule is about the value's first character,
  not shell quoting, which is why it bit a second time in `render_from_manifest.py` after
  being recorded once for the CLI. **FIXED IN THE PARSER on 2026-09-03 after it bit a
  THIRD time** (a hand-built repro of the five-view set): `cli_argv.normalise()` re-attaches a
  negative numeric value to its flag before argparse sees it, in all four entry points. Both
  forms now work. **The generalisable lesson is not about argparse** — this was documented
  here twice and recurred anyway, which is the same finding `changelogVersions.test.ts`
  records: when a mistake repeats through care, what is missing is a mechanism, not more
  discipline. Prose cannot be the guard for something a machine can check.
- **2026-09-03 — measure bake noise with a SEED PAIR, not against a "ground truth" bake.** Two
  bakes at identical settings with different `cycles.seed` differ only by noise, and their
  per-texel difference is **√2 ×** the noise of one — no converged reference needed, and no
  reference-noise term mixed into the answer. Measured: flat 256 samples ⇒ 39.3 % dark noise,
  matching (and cleaner than) the 35 % obtained against an unconverged 4096-sample reference.
- **2026-09-03 — use ADAPTIVE sampling for a visibility bake, not a flat sample count.** The
  error is wildly unequal across one atlas: exterior faces see open sky, bake to 1.0 and converge
  in ~16 samples; interior faces sit near 0.03 and need thousands. A flat count spends its budget
  on texels that were already right. `cycles.adaptive_threshold = 0.001` with max 4096 cut dark
  noise **39.3 % → 10.0 %**, a 4× win, at ~17 min for a 111-mesh plan. Threshold 0.0002 buys a
  further 1.3× for 1.9× the time — not worth it.
- **2026-09-03 — a metric that doesn't move when noise drops 4× was never measuring noise.**
  Across a flat-256 / adaptive-0.001 / adaptive-0.0002 sweep the 3×3 and 9×9 residuals stayed
  pinned at 13.6 % and 10.3 % while seed-pair noise fell fourfold. Useful as a *falsification*
  test for any metric you are about to trust.
- **2026-09-03 — normalise bake error by the texels you CARE about.** A visibility atlas mixes
  exterior faces (which see open sky, bake to 1.0 and converge in ~16 samples) with interior
  faces (~0.03, needing thousands). A whole-map relative error is dominated by the former:
  measured **1.5 %** overall while the dark interior texels an inside camera actually sees were
  **35 %** wrong. `bake-noise.mjs --ref=` now reports both.
- **2026-09-03 — a 4096-sample bake is NOT ground truth for dark texels.** Its own noise sits
  inside any error you measure against it. Sample scaling measured 35 % → 23.6 % → 22.3 % at
  256/1024/2048 samples, and the floor is partly the reference's own noise, not the candidate's.
- **2026-09-03 — extract ONE atlas slot and look at it.** Three rounds of aggregate metrics (3×3
  residual, 9×9 residual, whole-map ground-truth error) were all blind to a wall's interior slot
  being pure noise. One 85×128 crop, contrast-normalised, showed it instantly.
- **2026-09-03 — an ATLAS must not carry mipmaps.** Every mip level averages across slot
  boundaries, mixing one face's baked value into another's — at mip 4 a 256 px 3×2 atlas has
  5×8-texel slots, so the bleed is total, and a UV margin sized for bilinear filtering does
  nothing for the mip chain. Set `generateMipmaps = false` and `minFilter = LinearFilter`.
  (Measured *not* to be the cause of one particular artefact, but the reasoning stands.)
- **2026-09-03 — to test "is the artefact in the map or in the surface", use a UNIFORM map at
  MATCHED darkening.** Comparing a darkened render against an undarkened baseline proves nothing.
  A uniform multiplier at the same average level (`AOSYNTH=white AOGAIN=0.17`, mean 63.5 vs the
  real map's 72.2) gave a perfectly smooth wall where the real map speckled — isolating the data
  as the source and clearing the material in one run.
- **2026-09-03 — the shader gain for a baked term is a CALIBRATION constant, not a derivable
  one.** `1/mean(V)` looks principled and is scope-dependent by **2.7×**: averaging over a whole
  plan gives 4.81, over just the in-view surfaces 13.12, with the fitted optimum (~6) in between.
  It is only well-defined if you know which surfaces the app's artistic fill was calibrated
  against — and a fill chosen to look right has no such definition. Fit it against a reference
  and check the fit is stable across crops (measured 1.36× and 1.39× at gain 6).
- **2026-09-03 — DERIVE the shader gain for a visibility map; don't fit it.** If the app's fill
  stands in for a room's average indirect irradiance, the gain is exactly `1 / mean(V)` computed
  from the maps (area-weighted, counting only filled atlas slots): **0.1674 ⇒ 5.97**, which landed
  on the same value the sweep found. `scripts/dev-probes/bake-gain.mjs`.
- **2026-09-03 — if 16× the samples does not change the bake, the artefact is SYSTEMATIC.** A
  256-sample visibility bake matched a 4096-sample one to 1.5 % while both showed the same
  speckle. That rules out Monte Carlo noise and points at geometry — ray leakage at the seams of
  abutting wall boxes is the standing hypothesis. It also explains why blurring "helped" the
  picture while corrupting the data: it was smoothing reproducible signal.
- **2026-09-03 — compare a bake against a CONVERGED bake, not against a low-pass of itself.** A
  residual-after-blur metric cannot tell noise from wanted structure. Measured against a
  4096-sample ground truth, a 256-sample visibility bake is accurate to **1.5 %** — it was never
  noisy — while the 3-texel blur added to "clean" it is **21.8 %** wrong. The high-frequency
  content was real occlusion detail. `bake-noise.mjs --ref=<dir>` does this comparison.
- **2026-09-03 — `--denoise`/blur on a visibility bake is MEASURED HARMFUL.** Kept in
  `bake_material.py` only so the finding is not repeated. If a render looks blotchy, suspect the
  shader gain amplifying real detail before suspecting the bake.
- **2026-09-03 — when an option forces a second change, add the control for it.** `--denoise`
  also forced a float buffer, so every comparison against a default 8-bit bake varied two things.
  A two-line `--float-buffer` flag isolated it (float-only is identical to 8-bit) and showed the
  blur was the culprit. Two rounds of conclusions rested on that missing control.
- **2026-09-03 — for a bake whose signal is smooth, measure the map, not the render.** Aperture
  visibility varies over metres, so any high-frequency content in the texture is noise:
  `scripts/dev-probes/bake-noise.mjs` reports the post-low-pass residual per atlas slot at two
  scales (3×3 for speckle, 9×9 for mottling). Far faster and less subjective than rendering the
  app per attempt — and it showed **4× the samples changes nothing** once a blur is applied
  (2.0 %/1.6 % at both 256 and 1024 samples), saving ~9 min per plan.
- **2026-09-03 — `hasattr(bpy.ops.X, 'y')` is NOT a capability check.** `bpy.ops` namespaces
  answer `hasattr` for any name. `bpy.ops.image.denoise` reported present and then failed with
  *"could not be found"*. Call it in a `try`, or check `bpy.ops.image.denoise.poll()`.
- **2026-09-03 — `scene.cycles.use_denoising` does NOT denoise a bake.** It is a render setting;
  `BakeSettings` has no denoise flag. Measured: enabling it changed neither timing nor speckle.
  A visibility bake is pure indirect light in a dark interior — the noisiest case Cycles has —
  so plan for post-processing the image yourself.
- **2026-09-03 — re-encoding an already-quantised buffer LOSES precision.** Storing `sqrt(v)` to
  spend more 8-bit levels on a dark map only works on a float buffer: applied to an 8-bit bake it
  cut distinct levels **223 → 166**, backwards from the intent. `float_buffer=True` at image
  creation restored it (206). Note the encode then made no visible difference — quantisation was
  not the cause. Fixing a real bug is not evidence that it was the bug you were chasing.
- **2026-09-03 — do not route a baked term through three's `aoMap` slot; own the injection.**
  Attached to a live material, the mapped materials compiled **without `USE_AOMAP`** and the
  attenuation never executed — found by painting the sampled value out as the fragment colour with
  a **magenta sentinel** for "branch never ran". Nine hypotheses died chasing it. A shader
  injection that declares its own sampler, uniform and `uv1`→varying, and modifies
  `reflectedLight.indirectDiffuse` after `lights_fragment_end`, has no `#ifdef` the engine can
  compile out — and reproduced the reference measurement exactly (spread 1.36×).
- **2026-09-03 — three's `Texture.channel` defaults to 0, so setting `uv1` is NOT enough.** A
  baked map assigned to `aoMap` samples the `uv` attribute unless you set `texture.channel = 1`.
  With tiling shell UVs (−2.9…+2.9) that reads wrapped noise, and the symptoms are wildly
  misleading: black walls with white stripes, a room darkening 3×, and a **15× gain moving the
  frame mean 1.2×**. Five rounds of debugging traced to this one default.
- **2026-09-03 — a diagnostic can answer the right question about the wrong thing.** A probe that
  read the texels each wall's `uv1` covered reported healthy values and *looked* like it cleared
  the data — while the shader was sampling `uv`. Check which channel the renderer actually uses,
  not the one you intended.
- **2026-09-03 — a column-averaged metric is blind to bake noise.** With the channel fixed, the
  spatial spread improved 4.76× → 1.46× (better than predicted) while the render became visibly
  blotchy: 64 px across a 3×2 atlas is ~0.2 m per texel on a 5.8 m wall, and gain 15 amplifies
  Cycles' sampling noise 15×. The metric measured a real improvement in the term it was built for
  and said nothing about the artefact dominating the view. **Look at the frame.**
- **2026-09-03 — a control that both hypotheses pass is not a control.** `gain = 1` on a uniform
  white map reproduced the baseline render exactly — and an inert shader patch would have done
  the same, since three's own chunk also yields 1 there. Only `gain = 2` on a white map
  discriminates (115.64 → 139.43 measured, where the unpatched chunk leaves it unchanged). Ask
  what result the *null* hypothesis predicts before trusting a control.
- **2026-09-03 — a uniform-value control proves the SAMPLING PATH, not the DATA.** Replacing every
  texel with 255 shows the lookup works; it cannot show that the particular texels a surface
  samples are ones the bake actually filled. Those are different claims and conflating them cost
  a round.
- **2026-09-03 — bake DATA as `Non-Color`, and set it AT IMAGE CREATION.** Blender writes 8-bit
  PNGs through the image's colour space (default sRGB), so a linear bake gets transfer-encoded on
  the way out. For a map a shader multiplies into irradiance that is not just a brightness error
  — sRGB compresses highlights and expands shadows, distorting the map's spatial contrast, which
  is the whole quantity. Setting `colorspace_settings.name = 'Non-Color'` **after** the bake
  reinterprets the buffer and zeroes it (measured: every interior mean 0.0). Set it before.
- **2026-09-03 — build a CONTROL LADDER before debugging a bake end to end.** Replacing the baked
  values with a uniform 1.0 must reproduce the baseline render exactly; a uniform 0.5 must darken
  evenly with no structure. A uniform value cannot be affected by UV error, so those two rungs
  separate "wiring/UVs wrong" from "data wrong" in one run. That took an unresolved two-cause
  failure to a single cause immediately.
- **2026-09-03 — the glTF importer converts Y-up → Z-up in LOCAL vertices too, not just the
  world transform.** Measured: a wall's Blender local bbox is x −2.92…2.87, y −0.15…0.15,
  **z 0…2.6** — height on Z where the app has it on Y. So *anything* computed from Blender
  geometry that the app must reproduce — hash keys, UV atlases, per-face axis choices — has to be
  converted with `blender_to_three()` first. Two separate bugs from this in one session: a key
  that matched 0 of 385 live meshes, and a UV atlas whose slots were permuted (symptom: black
  walls with sharp white stripes). **The consumer defines the frame.**
- **2026-09-03 — make a zero hit rate a HARD ERROR, not a log line.** A baked map that never
  matches and a feature that subtly works look identical in a screenshot. The `AOMAP` knob throws
  on 0 % and that is the only reason the frame bug above was caught in minutes rather than
  shipped.
- **2026-09-03 — an `aoMap` can only darken, so a visibility map is not drop-in.** three caps it
  at 1, and baked absolute visibility has a *median around 0.11* — applying it removed ~80 % of
  indirect light globally as well as redistributing it (frame mean 115.6 → 34.1). The analysis
  that predicted the win multiplied by a MEDIAN-NORMALISED profile, mean 1 by construction. A
  shipped fix needs the map *and* a matched fill gain, derived together.
- **2026-09-03 — key baked assets by GEOMETRY IN PLACE, never by mesh name.** `Mesh_116` is an
  exporter index; the live scene has never heard of it and it shifts on any upstream reorder, so
  a name-keyed map simply never loads and the render looks untouched. `geometry_key()` hashes
  **world-space** vertices (two identical walls in different rooms have completely different
  visibility, so local geometry is not an identity), millimetre-rounded and sorted so neither
  float noise nor vertex order can split one wall into two keys. Hand-rolled FNV-1a in both
  languages, because the two toolchains share no hash guaranteed to agree — and test it against
  the **published vectors**, not just against your own fixture: two implementations wrong the
  same way agree with each other perfectly.
- **2026-09-03 — the bake albedo is MEASURABLE: use the plan's own area-weighted mean.** The
  probe's `ALBEDO=1` knob reports the default flat at **r 0.812 / g 0.807 / b 0.788 over
  467 m²** — white plaster dominates the area. `bake_material.py --albedo` defaults to 0.81 on
  that basis. It also explains why an albedo-1.0 visibility render matches physics so well: the
  real room is nearly a white furnace, so interreflection genuinely dominates.
- **2026-09-03 — alpha is NOT a bake coverage mask.** Bake margin dilation fills it: measured
  99.8–100 % of texels flagged covered, so masked and unmasked means were identical (0.1997 vs
  0.1993). If you need coverage, pre-fill with a sentinel colour and test against that.
- **2026-09-03 — don't validate a spatially varying bake with a per-mesh mean.** Two rounds went
  into de-contaminating that statistic before the real answer surfaced: it is the wrong
  instrument. An outdoor-facing face baking to 1.0 is *correct*, not pollution. Validate where
  the map is applied — `spatial-profile.mjs --explain` against a Cycles reference.
- **2026-09-03 — a single ray along the normal does not measure enclosure.** A face can hit
  geometry within reach and still see most of the sky; ray-classified "interior" slots still
  contained 1.0 texels. Treat it as "is anything blocking the normal?", nothing more.
- **2026-09-03 — you cannot bake into the app's shell UVs.** They are *tiling* coordinates in
  metres (measured: u = −2.9…+2.9, v = −1.6…+1.0) for repeating plaster/tile, and a bake writes
  into 0…1. Baking into them returns **`min 0.0, max 0.0`**. Build a second, non-tiling channel
  — and derive it from local geometry + mesh bounds (`bake_material.py:make_box_uvs`) so the
  runtime can regenerate identical UVs without shipping a UV table. `smart_project` packs better
  and cannot offer that. three's `aoMap` samples `uv1`, so a second channel is required anyway.
- **2026-09-03 — the shell meshes are BOXES.** 12 triangles = 6 quads per wall, so a 3×2 atlas
  spends 5/6 of its texels on exterior or other-room faces. Exterior faces correctly bake to
  **1.0** (they see the open sky), which contaminates any summary statistic over the whole map.
  Select interior-facing faces before trusting a shell bake.
- **2026-09-03 — albedo 1.0 is a WHITE FURNACE; don't bake with it.** Energy is conserved, so a
  closed white room's interior radiance converges on the sky's and the raw bake saturates at 1.0
  with no dynamic range to store. A realistic mid albedo (~0.5) keeps the interreflection that
  is most of the quantity. But check what dominates your statistic first: a 4× albedo change
  moved measured means by only 1–3 % because empty atlas slots and exterior faces — both
  albedo-independent — were dominating them.
- **2026-09-03 — whitening every material SEALS THE WINDOWS.** To render a visibility/AO
  reference you replace all materials with white diffuse — which turns glazing into an opaque
  white wall and makes the room a closed box. The render's maximum pixel value was **2 of 255**.
  Delete transmissive meshes *before* whitening (`render_visibility.py:open_apertures`).
- **2026-09-03 — a visibility reference needs a CONSTANT world, not a sky.** A sky gradient
  weights directions by radiance, so the render measures `visibility x sky` — which is just the
  ordinary reference render again. A constant white world isolates visibility alone.
- **2026-09-03 — bake FULL GI visibility, not short-range AO.** At albedo 1.0 the visibility
  render matches the sky-lit reference's spatial profile; at albedo 0.05 (near first-bounce) it
  explodes to 59.7x at the window column and matches nothing. Interreflection is most of the
  quantity, so an AO map with a small radius is the wrong thing to bake.
- **2026-09-03 — a reference is a LIGHT SET, not just a pose.** `BLENDREF`'s manifest carried
  only directional/hemisphere/ambient, so `render_from_manifest.py` makes a **daylight-only**
  reference — while the app raster still had 4 `PointLight`s burning, one of them a floor lamp
  against the wall under measurement. That inflated a published error from 2.99× to 3.95×.
  Match the light sets (`LIGHTS=off` on the app side) and check the manifest's `placed` field
  before believing any comparison. The tell that caught it: an "all indirect off" arm put that
  wall at **8.3× its own frame median**, which no daylight geometry can explain.
- **2026-09-03 — do NOT give the reference's lamps a wattage.** Tempting, and it would break
  the reference. three's intensities are artistic, so a fitted lamp power makes the physical
  reference agree with the artistic choice under test — the same failure the physical-sky
  decision avoids. Daylight-only on both sides, or real photometric lumen data; never a
  constant chosen to match.
- **2026-09-03 — a matched pose is necessary and NOT sufficient: check the pose can measure what
  you are measuring.** A view facing a large near wall with the window off-frame has little tonal
  range *by construction*, in Cycles and in the app alike, so `p99/median` there measures the
  framing. Measured: 0.70 % of the frame is bright aperture in a good pose against **0.03 %** in a
  bad one, a 23× difference — and four conclusions drawn from the bad ones had to be downgraded.
  `BLENDREF` now preflights the raster (no dark end, or no bright aperture) and warns before the
  35-minute bake is spent.
- **2026-09-03 — one room is not a validation, and a second one costs 37 seconds.** Every
  conclusion drawn against `bedroom3` at 13:00 was an n = 1 claim. Adding `livingDining`
  confirmed the highlight deficit (34 % and 45 % short) and **broke** the finding that the
  app's shadows already match physics — true in the small bedroom, badly false in the deep
  living room (mid-tone occupancy 92 % vs 59 %). Now that `render_from_manifest.py` exists
  there is no excuse for a single-room conclusion.
- **2026-09-03 — quote `p95/median` and `p99/median`; never quote `p99/p01`.** On the *same
  image pair*, a modest crop change moved the reference's `p99/p01` from **24.9 to 76.7** (3×)
  while `p99/median` moved 0.3 %. `p99/p01` is set by whatever smallest dark feature the crop
  happens to include, so it measures the crop rather than the render.
- **2026-09-03 — compare RATIOS, not absolute levels.** Cycles' exposure is not matched to
  the app's and need not be: a response ratio (surface under intervention A ÷ under B) is
  exposure- and tone-mapping-invariant, so it is the quantity that survives. This is what let
  a physical reference correct three of the previous arc's conclusions without ever
  calibrating absolute brightness.
- **2026-09-03 — Blender 5.2.1's glTF importer ABORTS on `KHR_materials_dispersion: {}`.**
  Upstream guard mismatch in `imp/pbrMetallicRoughness.py`: the settings node is created
  only when `dispersion != 0` (line 36) but *used* whenever the extension is merely present
  (line 136), so a no-op extension dereferences `None` and kills the **entire** import with
  `AttributeError: 'NoneType' object has no attribute 'inputs'`. three's `GLTFExporter`
  writes exactly that empty object for a `MeshPhysicalMaterial` with `dispersion = 0`, so
  any scene containing glass hits it — measured on this repo's own export, **4 of 897
  materials, enough to block all 897**. `glb_fix.strip_noop_dispersion()` removes it
  losslessly (zero dispersion *is* the glTF default) and `import_glb` runs it
  unconditionally; it is a no-op when there is nothing to fix. **Delete when upstream
  fixes it.**
- **2026-09-03 — three positions are Y-up, Blender is Z-up: `(x, y, z) → (x, −z, y)`.**
  Verified: importing `pool-table-6ft.glb` gives extents x 1.93 / y 1.073 / **z 0.80** with
  `z_min = 0.0`, so the table's height lands on Z and it sits on the floor — the importer
  converts geometry. Camera and light positions taken from the app must be converted too,
  or they land elsewhere while the geometry looks right. Use `three_to_blender()` /
  `place_camera_from_three()`; `render_still.py` **requires** `--cam-space` alongside
  `--cam-pos` rather than defaulting it.
- **2026-09-03 — pass light DIRECTIONS, not angles.** `add_sun_from_three_direction()`
  takes the travel vector straight off the app's `DirectionalLight`
  (`normalize(target − position)`). A vector in a named frame has no degrees/radians
  question and no azimuth-zero question — after three implicit-frame bugs in this bridge,
  that is worth more than any docstring.
- **2026-09-03 — argparse eats a leading `-`.** Historically a negative vector needed the
  `=` form: `--sun-dir=-0.5,-24.8,2.8`. **No longer required** — `cli_argv.normalise()` fixes
  it in the parser for all four entry points, and `--sun-dir -0.5,...` now works too. The `=`
  form stays correct, so existing callers are unaffected. Exception, asserted in
  `test_cli_argv.py`: a *non-numeric* dash-leading token (a path like `-1.glb`) is still left
  alone, because widening the rule would mean swallowing real flags.
- **2026-09-03 — three.js FOV is VERTICAL; Blender's `camera.angle` defaults to the LARGER
  axis.** `PerspectiveCamera.fov` is vertical, while Blender under `sensor_fit = 'AUTO'`
  measures the angle along the larger sensor dimension — horizontal for any landscape
  render. Passing three's vertical FOV into an AUTO camera gives a **wider** frame, and the
  error grows with aspect: at 16:9, 50° vertical ≈ 78° horizontal. A matched-pose comparison
  would then be comparing *different framings* — the confound `.247` of the graphics arc
  spent a whole round on. Fixed structurally: `place_camera(..., fov_axis=...)` sets
  `sensor_fit` and defaults to `vertical` (three's convention), so the axis lives in the
  data rather than in the caller's memory. Second instance of the same lesson as the
  radians/degrees trap, found by looking for it deliberately.
- **2026-09-03 — the app's sun angles are RADIANS; the CLI flags are DEGREES.**
  `src/scene/lighting/sunPosition.ts` returns `SunCalc.getPosition` unchanged and feeds
  `altitude` straight to `Math.cos`. An early docstring here claimed a caller could forward
  store values into `add_sun()` "without converting" — wrong by **57.3×**, and it would have
  rendered as a *believable* low sun rather than failing, because every plausible altitude
  in radians (0–1.5) is also a plausible-looking altitude in degrees. Use
  **`add_sun_from_app()`** for radians and `add_sun()` for degrees: the unit is settled by
  which function you call, not by remembering. (Caught from dev-1a hitting the same shape in
  `roughlyAligned`, which read radians as degrees and so certified oblique pairs as square.)
- **2026-09-03 — a preview-resolution Cycles render is ~0.6 s, so Part A's ~800 ms debounce
  is realistic.** 400×300 at 24 samples on a 26-mesh asset took **0.64 s** on CPU (adaptive
  sampling on). Interior scenes will be heavier, but the order of magnitude says a
  low-sample preview pass is viable without a GPU.
- **2026-09-03 — a hand-rolled Radiance RGBE writer is enough for the offline sky.**
  Blender reads uncompressed flat-scanline RGBE fine. This matters because Blender's
  bundled Python has **no** imageio/OpenEXR, so any library-based writer would make the
  "works offline in a fresh checkout" claim false. ~40 lines in `hdri.py`.
- **2026-09-03 — cache HDRIs in `.cache/hdri/`.** `.gitignore:38` already covers `.cache/`
  as the "Local price-server / sidecar cache", so the Blender cache needs no new ignore rule
  and sits with the other optional sidecars' downloads.
- **2026-09-03 — a catalog mirror needs a drift check that fails loudly.**
  `hdri.CATALOG` duplicates `hdriCatalog.ts` (parsing TS from Python is fragile), so
  `check_catalog_sync()` compares them — and its regex is deliberately narrow enough to
  report "TS shape changed?" rather than matching zero entries and declaring everything in
  sync. A false clean bill of health is the failure mode worth engineering against.
- **2026-09-03 — this repo cannot host a tracked `.claude/skills/` skill.** `.gitignore:48`
  ignores `.claude/`, so anything placed there is local-only and never committed. Checked
  before writing: `CLAUDE.md` referenced no skills convention, `.claude/` held only
  `settings.local.json`, and `docs/superpowers/` is a plans/specs area, not skills. Hence
  `docs/` + a `CLAUDE.md` link, which is loaded every turn.
- **2026-09-03 — the Poly Haven HDRIs are not on disk.** The goal said "reuse bundled Poly
  Haven HDRIs"; they are actually served from the Poly Haven CDN at runtime
  (`hdriCatalog.ts`), with no `.hdr` in the repo. A Blender path must fetch + cache; do not
  glob for them and do not fail when none are found.
- **2026-09-03 — `scene_bounds` must use `matrix_world`, not `object.dimensions`.**
  `dimensions` is local and ignores parent transforms, and an imported glTF hierarchy is
  almost always parented — so the local reading is wrong for exactly the assets this is
  for. Transform each of the 8 `bound_box` corners by `matrix_world` instead.
- **2026-09-03 — delete datablocks, not just objects, when resetting.** Deleting objects
  leaves orphaned meshes/materials behind, which accumulate if one session imports
  repeatedly. `reset_scene()` sweeps zero-user datablocks too.
- **2026-09-03 — aim cameras with a `TRACK_TO` constraint, not hand-rolled eulers.** The
  constraint reproduces Blender's own look-at exactly, including roll; a hand-computed
  euler is a second implementation that can silently disagree.

## Open experiments

- ~~**AgX parity with three.js.**~~ ✅ **MEASURED 2026-09-11 — they do NOT agree, and the bias is
  one-directional.** See *AgX is not AgX* below; `scripts/dev-probes/agx-parity.mjs` +
  `agx_lut.py` re-derive it in about a minute.
- ~~**Cycles device.**~~ ✅ **MEASURED 2026-09-11 — Metal is ~6x faster and it works.** On the
  200-map default-flat irradiance bake (`--min-area 1.5 --res 256 --samples 1024`, identical
  settings both arms): **CPU ≈ 37 s/map, `--device GPU` ≈ 6 s/map**, *including* the one-time kernel
  compile. ~2 h → ~20 min for a whole plan. `enable_gpu()` resolves Metal correctly and the index
  records `"device": "GPU"`; check that field rather than assuming, because a silent fallback looks
  exactly like a slow GPU.
- **Material fidelity.** Nothing yet rebuilds our PBR tokens as Principled BSDF; the
  scripts so far rely on the glTF importer's own material translation.
- ~~**Weather.**~~ ✅ **BUILT 2026-09-12 — `weather_sky.py` + `render_weather.py`.** `ShaderNodeTexSky`
  has no cloudiness input, so an overcast reference is unreachable by tweaking it. The world is
  instead `A · SkyTexture(disc scaled) + B · CIE-overcast grey dome`, with `A` the clear fraction of
  the sky and `B` SOLVED by rendering — a white Lambertian probe measures each world's horizontal
  irradiance and `B` is whatever hits the Kasten & Czeplak (1980) transmittance for that condition
  (clear 1.00, 4 oktas 0.929, stratus 0.18, nimbostratus 0.16). Every arm then RE-MEASURES and
  prints achieved-vs-target, because a solve that is never checked is an assertion; all four land
  within 0.2 %. `clear` is `A = 1, B = 0`, i.e. exactly the existing one-sky builder, which makes it
  a control rather than a fifth arm. Scene construction is not forked: it swaps the one module
  attribute `render_still.py` reaches through and lets `render_from_manifest.main()` do the rest.

## AgX is not AgX — the two implementations differ, and the bias is one-directional

**Measured 2026-09-11** (`scripts/dev-probes/agx-parity.mjs`, `python/scripts/blender/agx_lut.py`).
This closes the *Open experiments* item of the same name, and it retires an assumption the whole
graphics-realism arc rests on: that an app screenshot and a Cycles reference can be compared **in
displayed 8-bit counts** because both tone-map with AgX.

They are different implementations. Blender 5.2.1 applies the OCIO AgX config. three r184 applies
Filament's port, whose sigmoid is `agxDefaultContrastApprox` — a **6th-order polynomial
approximation** — and whose look step is commented out in the chunk (so both run look=`None`, which
is at least matched).

**Do not measure this with a rendered scene.** A same-pose render folds sampling noise, material
translation, light-rig and pose error into a question that is purely about a transfer function —
the failure mode this arc has lost the most rounds to. Drive both sides with the *same known linear
values* instead: `agx_lut.py` writes a float image and saves it through `Image.save_render(scene=…)`
(which applies the view transform — exact, instant, **no Cycles at all**), and the JS probe renders
one unlit `MeshBasicMaterial` quad per value on the real GPU with the colour written as raw
working-space floats.

**Neutral axis** (three − Blender, 8-bit counts), the band an interior occupies:

| linear | 0.011 | 0.032 | 0.065 | 0.09 | 0.18 (grey) | 0.51 | 2.0 | 11.5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| delta | 0 | +9 | **+14** | +13 | **+10** | +5 | +6 | 0 |

**three is brighter almost everywhere**: mean **signed** +8.18 counts over the 159-channel probe
set against mean **absolute** 8.73 — i.e. this is a bias, not scatter. Below ~0.01 linear it
reverses to −1…−3. Saturated colour is far worse: up to **44 counts** in a channel (linear
`0,0.5,0` reads blue 65 in three against 21 in Blender), so a hue or saturation comparison across
the two is not meaningful at all.

**What it means for the arc's published numbers.** `--map` inverts three's transform and pushes the
recovered linear through Blender's, so a count measured in an app frame becomes the count the same
radiance would show in a reference. The interior-crop percentiles the photoreal arc quotes for full
Realistic on a real GPU map like this:

| app count (three AgX) | 107.3 | 125.9 | 167.4 | 189.0 | 227.5 |
| --- | --- | --- | --- | --- | --- |
| implied linear | 0.116 | 0.174 | 0.425 | 0.712 | 2.345 |
| same radiance, Blender AgX | 93.6 | 115.9 | 162.4 | 184.5 | 221.5 |
| **delta** | **+13.7** | **+10.0** | +5.0 | +4.5 | +6.0 |

So an app frame that matches a Cycles reference *in counts* is in fact **4–14 counts too dark in
radiance**, worst in the shadows — and several conclusions in the arc turned on differences of that
size. Compare in **linear**, or map through this LUT; do not compare AgX counts across the two and
call the residual a graphics finding.

**Two controls, because an instrument bug and a real difference look identical.**

- *The transform removed.* `--tone-mapping None` against `--view-transform Standard` puts both
  sides on the plain sRGB transfer function: **0 counts of difference across all 159 channel
  samples**, exactly. So both paths deliver the same linear value to the same encoder, and every
  delta above is the transform.
- *The LUT against a real render.* `agx_lut.py --verify-cycles` renders the same values as
  emission shaders (strength 1 ⇒ surface radiance = colour, so it needs no light rig and is
  noise-free at 1 sample) and diffs. **Neutrals agree to ≤1 count (mean 0.29); saturated primaries
  to ≤4.** The ±1 is *unexplained* — it is not dither (`dither_intensity = 0` changed nothing) and
  not the pixel filter (`filter_size = 0.01` changed nothing) — but it is an order of magnitude
  below the effect, and it is a bound, not a guess.

Two facts worth keeping separately:

- **`Image.save_render(scene=…)` applies the scene's view transform to a buffer you supply.** This
  makes a display transform directly samplable with no render, no camera and no noise. Set
  `colorspace_settings.name = 'Linear Rec.709'` and `float_buffer=True` **at image creation** — an
  8-bit image cannot hold a value above 1, and half of any useful probe set is above 1.
- **Blender dithers 8-bit output by default** (`render.dither_intensity` 1.0). Right for a picture,
  wrong for a LUT. Zero it whenever the 8-bit value itself is the measurement.

## Comparing a reference to the app: keep the LINEAR buffer, and port the app's curve

Follows directly from *AgX is not AgX*. Since the two transforms disagree, a reference PNG cannot
be compared to an app screenshot in counts — and inverting AgX on the app frame is not a 1-D
problem once a pixel has chroma. So go the other way:

1. `render_still.py --linear-exr` keeps the scene-referred linear buffer beside the PNG.
   `render_from_manifest.py` writes it **by default** (`--no-linear-exr` opts out): a reference
   exists to be compared, and re-rendering to recover the buffer means re-deriving a pose that may
   no longer exist.
2. `agx_three.py --image <exr> --out <png> --exposure <e>` applies **three's** AgX.
3. `scripts/dev-probes/ref-linear-compare.mjs --dir <bref>` reports the distributions.

**`--exposure` is the sharp edge.** three's `toneMappingExposure` reads **1.38** in this app —
nearly half a stop — and a reference converted at 1.0 is wrong by far more than anything being
measured. The BLENDREF manifest now records a `display` block for exactly this; if you are holding
an older manifest, read it off the live renderer and say which you used.

**`agx_three.py` is a port, so verify it, every time.** `--verify <three.json>` replays values
measured from a live three.js WebGL context. Measured on this build: **0 counts across 1155 neutral
channels**, 1 count on 1 of 159 chroma channels. Run the **chroma** set, not just the dense neutral
one — GLSL's `mat3(vec3, vec3, vec3)` builds from COLUMNS, so a transposed inset/outset matrix is
completely invisible on the neutral axis.

**A fresh bake does not fix orphaned keys — the EXPORT is the lossy step (REBAKE-REFUTED).** The
shipped set orphans 40 of 195 maps; a bake taken from an export made minutes earlier orphans **48 of
200**, i.e. *worse*. `lightmapKey` hashes millimetre-rounded WORLD vertices and the bake only ever
sees the scene through `buildExportRoot`'s GLB, so whatever that path does — merging, transform
flattening, position quantisation, the Y-up→Z-up conversion — moves enough vertices past the
rounding to change the hash. Before blaming a re-bake for coverage, check whether the exported GLB
and the live scene even agree on vertex positions.

**Mask what differs; do not hand-place patches.** Both sides render the same exported scene, so the
only structural differences are the app's HUD and the view THROUGH the glazing (estate backdrop vs
physical sky). Excluding those two leaves ~73 % of the frame and needs no judgement about where a
clean surface is. Four hand-placed patches were tried first and three were contaminated (TV,
sideboard, structural beam) — the sd guard caught it, the marked image confirmed it.

**Ask for the SHAPE, not the level.** The app's sun is artistic, not physical, so an absolute level
gap against a physical-sky reference proves nothing on its own. `--exposure-sweep` converts the
reference at several exposures and asks whether any scalar lines the distributions up. A residual
that survives every exposure is scale-invariant and therefore a real finding. Measured on the
default living/dining pose at `TIER=realistic`: mean **−4.7** counts, but midtones **13–18 dark**,
p95 **19.9 bright**, and saturation **0.115 against 0.141**. As ranges: the app's `p95 − p50` is
92.4 against 54.8, its `p50 − p05` is 110.3 against 133.0.

**Chroma: bucket by the REFERENCE, and read the RANGE.** `--chroma` splits the masked pixels into
equal-count bins by the *reference's* own saturation, so the app's error cannot choose its own
bucket. Measured on the default living/dining pose at `realistic`: the app **adds** chroma where
physics has almost none (+0.045 in the most neutral bin) and **removes** it where physics is
colourful (−0.074 in the most chromatic), for a chroma range of 0.225 against the reference's
0.344 — **35 % narrower**. R−B in the mid bins reads −5.0/−5.5 against the reference's
−9.9/−13.4, i.e. **about half the sky-bounce blue**. Same shape as the luminance compression, and
one cause covers both: the app's indirect term is a flat achromatic fill
(`Lighting.tsx` `ambientLight`) over a **scalar** visibility lightmap, so it carries no colour at
all.

**If a resampling step is in the comparison, price it — do not argue about it.** The raster is
2560×1600 and the reference was 800×500 native, and downsampling averages, which biases saturation
in the direction the finding pointed. Re-rendering the reference at 2560 and downsampling by the
same factor moved mean saturation by **0.002**, and in the direction that means the original figure
understated the gap. Six minutes of render beats a paragraph of reasoning.

**Matching an app frame to a manifest pose: assert POSITION *and* FOV.** The app's walk FOV is
viewport-aware and reads **70°** at 1280×800, while `light-distribution.mjs` pins **50°**
(`WALKFOV`) and records that in the manifest. So a probe can set the camera position to within
**0.000 m** and still frame 20° wider — invisible to a position check, and worth 33 counts of mean
difference. Call `setWalkFov(manifest.camera.fovVerticalDeg)` and then assert both against the
manifest. Related: `setLightsMode('off')` does NOT turn the room lights off — the reference export
flips each item's `lightOn` prop, and the interaction pill reading "Turn OFF ceiling light" is the
cheapest tell that a probe missed it.

**Do NOT "fix" `geometry_key` to hash per-loop instead of per-vertex.** The asymmetry is real and
visible: `lightmapKey` (TS) hashes every position in the attribute array including duplicates, while
`geometry_key` (Python) hashes Blender's deduplicated `obj.data.vertices`. It looks like an obvious
bug and the change is three lines. **Measured against 1161 live keys: the shipped dedup form matches
609, the per-loop form matches 65** — switching costs 89 % of the matches. Blender's import does
merge vertices (median 1.5 loops per vertex), so the mechanism is real and the direction is the
opposite of what it looks like.

**CHECK THE TIER FIRST — `light-distribution.mjs` defaults to `TIER=performance`.** The baked
visibility lightmaps are the app's whole interreflection term and they are gated to `realistic`, so
the DEFAULT export compares a physical reference against a render with no GI at all. This cost a
published round: `v0.34.1.1` reported a 36-count mean deficit as a photorealism figure when the
Realistic number is 4.7, and the mixed-curve comparison had even had the SIGN wrong there (+16.8 vs
the true −4.7). `manifest.scene.tier` had recorded it all along; the probe now prints it and warns.
Pass `TIER=realistic` unless you specifically mean to measure the cheap path.

## Deleting imported objects — two verified facts (ORBIT-STUDIO-LOOK, Blender 5.2.1)

`render_still.py --section-cut <y>` removes every mesh whose bounding box sits entirely at or above
a height, so an orbit reference renders the building SECTION the app's dollhouse shows. Two things
it had to get right:

- **`bpy.data.objects.remove()` invalidates every OTHER reference in the list you are iterating.**
  Removing one object left the rest of the imported `objs` list as dead handles, and touching one
  raises `ReferenceError: StructRNA of type Object has been removed` — from a line that only reads
  `o.name`. Collect the NAMES first, remove by `bpy.data.objects.get(name)`, then re-fetch the
  survivors by name. A stale-handle error looks like a logic bug in the caller; it is not.
- **A world-space bounding box is `matrix_world @ Vector(c)` over `o.bound_box`,** whose corners are
  LOCAL. And `import_glb` has already applied the glTF Y-up → Z-up conversion, so the imported
  `Z` **is** the app's `Y` — do not convert a second time.

**And the reason a section cut is needed at all, which is an app fact worth knowing here:** the app
does not HIDE its ceiling in the orbit dollhouse. The tiles are single-sided planes and the
RASTERISER culls their back face. Cycles has no backface culling, and `buildExportRoot` prunes by
tag and type and never by appearance — so the first orbit reference came back as a sunlit white
roof over the whole flat, **62.96 % of pixels over luma 235**, with the interior not in frame at
all. Any future orbit/dollhouse reference needs `--section-cut`.

## Isolating the app's INDIRECT slot in a weather reference (WEATHER-BAKED-GI, Blender 5.2.1)

The baked-GI term the app injects is not the room. `bake_material.py --pass irradiance` runs with
`--with-sun-disc` **off**, so the map holds what the sky DOME delivers — the skylight arriving
straight through the aperture (which Cycles files under `DIFFUSE_DIRECT`, so an `--indirect-only`
bake is the wrong instrument) plus every bounce of it — and nothing of the beam, which the app
renders itself as a `DirectionalLight`. Any reference that adjudicates that term has to be rendered
the same way.

- **`render_weather.py --sun-intensity 0` is that arm, but the CALIBRATION must stay at 1.0.**
  `weather_sky.build_world` sets `sky.sun_disc = sun_intensity > 0`, so 0 removes the disc and
  leaves the scattered sky untouched — exactly the bake's world. But `calibrate()` solves each
  dome against a Kasten & Czeplak GLOBAL transmittance, and with the disc off the clear arm's `E_h`
  is only its diffuse share, so the solve would size every dome ~10× too large. Pin the solve
  instead of re-running it: `render_weather.calibrate = lambda *a, **k: json.load(open(dir +
  "/weather-calibration.json"))`, then call `main()` with `--sun-intensity 0`. The one-line
  monkeypatch is the whole harness.
- **Run the disc-ON control at the SAME exposure, and difference them.** `disc-off ÷ disc-on` on a
  wall patch is the DOME's share of that surface's clear-sky light — 0.47 / 0.35 on the default
  flat's two living-room walls at 13:00 — and it is the number that says whether an app's own
  bake-versus-sun split is faithful before any ratio is transferred to it.
- ⚠️ **Choose `--linear-stops` from a CLIPPING check, not from intuition, and re-check per arm.**
  `--linear-stops 4` on this scene put **85 % of the interior on the 16-bit ceiling** and returned
  ratios of 1.00 for three statistics out of five; `-1` is the value that leaves every one of the
  four weather arms unclipped at this pose. `weather-cycles.mjs` prints `onFloor`/`onCeil` and warns
  — read those two columns before reading any percentile below them.
- ⚠️ **A saved reference set is not evidence unless its command line still reproduces it.** The
  `wl-*` set under `/tmp/weather/walk` that `scene/lighting/weather.ts`'s interior table cites
  re-renders, from its own logged argv, at interior mean **0.478** against the recorded **0.087** —
  and the recorded set has **30.9 % of the interior at exactly zero linear** in a daylit room. Two
  minutes of re-rendering the control is cheaper than a constant fitted against a broken arm.
- **Blender's clear sky is too clean for the tropics and it biases every DOME ratio in one
  direction.** Measured on this harness the clear-sky diffuse fraction is `k_d = 0.096` against a
  humid equatorial 0.20–0.25, and since a dome-to-clear-dome ratio divides by that same small
  number, the inflation is worst for the world with the largest solved dome (`partlyCloudy`, which
  measures 2.68 against a tropical-`k_d` recomputation of 1.17). Quote both, and say which one the
  shipped asset's own bias makes applicable.
