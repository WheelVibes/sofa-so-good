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
`AgX`. Useful rather than annoying: the app's three.js tiers tone-map with **AgX** too
(`src/scene/toneMappingThree.ts`), so **leaving the default alone is the closest match
to the real-time view**. Do not "fix" it to Filmic or Standard without a reason.

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

`--uv box` (default) builds a fresh non-tiling 3×2 box atlas and is **required** for the app's
shell meshes; `--uv existing` is only correct for assets that already have a unique 0…1 layout.
`--albedo` defaults to 0.5 for visibility bakes. See the lessons below for why both defaults are
what they are — each one is a measured failure, not a preference.

Reuses `render_visibility.py`'s world setup exactly, so a baked map and a rendered reference are
the same quantity and can be checked against each other.

Verified: 4 shell meshes at 64 px / 32 samples in ~4 s, means 0.164–0.428 across walls.

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
  being recorded once for the CLI.
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
- **2026-09-03 — argparse eats a leading `-`**, so a negative vector needs the `=` form:
  `--sun-dir=-0.5,-24.8,2.8`, not `--sun-dir -0.5,...` (which fails with "expected one
  argument").
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

- **AgX parity with three.js.** Both tone-map with AgX, but Blender's AgX and three's
  `AgXToneMapping` are separate implementations. Nobody has compared a matched pair yet.
  Worth a same-pose render vs the app's raster before trusting absolute levels.
- **Cycles device.** `CPU` on this machine. Whether Metal GPU compute is available and
  worth enabling for the live-preview path is unmeasured.
- **Material fidelity.** Nothing yet rebuilds our PBR tokens as Principled BSDF; the
  scripts so far rely on the glTF importer's own material translation.
