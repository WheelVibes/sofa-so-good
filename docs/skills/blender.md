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
