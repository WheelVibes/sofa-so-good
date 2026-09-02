# Blender skill — sofa-so-good

> **Why this lives in `docs/` and not `.claude/skills/`.** `.gitignore:48` ignores
> `.claude/`, so a skill placed there would be **local-only and never committed** — which
> defeats the point of a living document that future sessions read. This repo has no
> tracked skills convention (nothing in `CLAUDE.md` referenced one), so the skill lives
> with the other reference docs and is linked from `CLAUDE.md`, whose reference list is
> loaded every turn.

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
