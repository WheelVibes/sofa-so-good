"""Bake Cycles lighting to per-object textures — Part B, and item (w)'s asset pipeline.

    blender --background --factory-startup \
      --python python/scripts/blender/bake_material.py -- \
      --dir /tmp/ld2 --pass visibility --min-area 3.0 --res 64 --samples 64

Plain file in, plain files out, no session state.

**What `--pass visibility` is for.** `v0.31.7.9`/`v0.31.7.10` established that the app's
indirect light is visibility-blind — its `HemisphereLight` + `AmbientLight` give every surface
the same skylight whether or not it can see the sky — and that modulating indirect irradiance
by baked **aperture visibility** removes 68 % of a deep room's spatial error at γ = 0.7 for a
≤4 % regression in a small one. three.js has no GI, so that term cannot be computed live; it
has to be baked, into the one slot three multiplies into `irradiance` and not into direct
light: `aoMap`. This produces those maps.

The visibility setup is deliberately the *same* one `render_visibility.py` renders, so a baked
map and a rendered reference are the same quantity and can be checked against each other:

  - every material replaced by a white Lambertian surface (no specular/coat lobes to
    contaminate a cosine-weighted visibility measure)
  - a **constant** white world, not a sky — a gradient would weight directions by radiance and
    bake `visibility x sky`, which is a different and less reusable quantity
  - **glazing deleted first**, or the room is a sealed box and the bake is zero everywhere
    (`render_visibility.py`'s first run maxed out at 2/255 for exactly this reason)
  - no sun, since visibility is an indirect quantity

`--min-area` selects by surface area rather than by name, because the target is the room SHELL
— walls, floors, ceilings — and those are the large flat meshes in any plan, whatever the
exporter called them. Baking all 1274 meshes of a flat would be both slow and pointless: the
measured error lives on the shell.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cli_argv  # noqa: E402
import glb_fix  # noqa: E402
import render_visibility as RV  # noqa: E402
import sofa_scene as S  # noqa: E402

PASSES = ("visibility", "ao", "diffuse", "combined", "irradiance")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="bake_material.py")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--scene", help="GLB to bake")
    src.add_argument("--dir", help="a BLENDREF directory (uses its scene.glb)")
    p.add_argument("--out-dir", default=None, help="default <dir>/bake or alongside --scene")
    p.add_argument("--pass", dest="pass_", default="visibility", choices=PASSES)
    p.add_argument("--res", type=int, default=64,
                   help="texture edge in px. Aperture visibility is a smooth, room-scale "
                        "quantity, so it needs far less resolution than an albedo map; 64 is "
                        "ample and keeps the asset small.")
    p.add_argument("--device", default="CPU", choices=("CPU", "GPU"),
                   help="Cycles compute device. GPU also enables the backend in add-on "
                        "preferences (factory-startup leaves it at NONE, which silently "
                        "falls back to CPU). Metal measured 2.6x faster than CPU once its "
                        "kernel cache is warm; the FIRST GPU render on a machine pays ~100 s "
                        "of one-time kernel compilation.")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--with-sun-disc", action="store_true",
                   help="include the SUN DISC in --pass irradiance. Off by default, and that "
                        "default is the whole decomposition: the app renders sun and lamps itself "
                        "as DIRECT light, so those must not be baked. What it lacks is everything "
                        "the sky dome delivers -- both the skylight arriving straight through a "
                        "window AND its bounces. Cycles calls the first of those DIFFUSE_DIRECT "
                        "(the world is visible along the ray), so an indirect-only bake discards "
                        "it: v0.31.7.92 measured 74.5 % of the shell sampling ~0 for exactly that "
                        "reason. Sky-dome-only with BOTH passes on is the app's indirect slot.")
    p.add_argument("--seed", type=int, default=None,
                   help="Cycles sampling seed. Two bakes at the same settings with DIFFERENT "
                        "seeds let you estimate noise without a converged reference: their "
                        "per-texel difference is sqrt(2) x the noise of one. v0.31.7.25 showed "
                        "a 4096-sample bake is itself unconverged on dark texels, so measuring "
                        "against it conflates the candidate's noise with the reference's. A "
                        "seed pair has no such term.")
    p.add_argument("--adaptive-threshold", type=float, default=None,
                   help="Cycles adaptive sampling noise threshold (lower = more samples where "
                        "noisy). This is the right control for a visibility bake: exterior "
                        "faces see open sky and converge in ~16 samples while interior faces sit "
                        "near 0.03 and need thousands, so a flat sample count spends nearly all "
                        "of its budget on texels that were already correct.")
    p.add_argument("--float-buffer", dest="float_buffer", action="store_true",
                   help="force a float bake buffer without enabling blur or encoding. Exists to "
                        "ISOLATE it: --denoise and --encode both force one, so any measurement "
                        "comparing them against a default 8-bit bake varies two things at once. "
                        "v0.31.7.22 needed exactly this control.")
    p.add_argument("--dilate", type=int, default=4, metavar="PASSES",
                   help="fill exactly-zero texels from non-zero neighbours, N passes "
                        "(0 disables). ON by default: the box atlas is ~half uncovered and "
                        "those texels bake to 0, which reached the shader as 44.5 % of shell "
                        "pixels sampling black (v0.31.7.97). Unlike --denoise this NEVER "
                        "rewrites a baked value, so it cannot bias the map -- it only extends "
                        "it into padding that held nothing.")
    p.add_argument("--texels-per-metre", type=float, default=None, dest="tpm",
                   help="choose --res PER OBJECT so every surface gets this texel density, instead "
                        "of one resolution for everything. A 3x2 atlas gives each face group a "
                        "slot of res/3 x res/2, so density is (res/3)/extent -- which means a "
                        "fixed --res makes a 0.7 m panel 4x finer than a 3 m wall while costing "
                        "the same bytes, and starves the wall. Measured both ends of that: at "
                        "--res 256 the 40 largest meshes look right (~28 texels/m) but cover only "
                        "11 % of the scene, and at --res 64 all 333 meshes fit in 4.3 MB and the "
                        "walls read as blotchy cloud because a whole wall face gets 21x32 texels. "
                        "Rounded UP to a power of two and clamped to [--res-min, --res]. 28 is the "
                        "density the good-looking 256 px set actually had.")
    p.add_argument("--per-map-scale", action="store_true",
                   help="divide each map by ITS OWN maximum and record that divisor in the map's "
                        "index entry, instead of one global --scale for the set. This is what "
                        "makes 8-bit output usable: with a global scale the set's brightest texel "
                        "sets the step for every map, and measured across 333 maps the global max "
                        "is 3.33 while the MEDIAN map's mean is 0.049 -- a step of 72 % of the "
                        "typical value. Per map the step is ~0.4 % of that map's own maximum. "
                        "v0.31.7.104 argued against this on the grounds that per-map "
                        "normalisation destroys between-mesh ratios; that was WRONG, because the "
                        "divisor travels with the map and is re-applied per material, so the "
                        "ratios are reconstructed exactly. It only breaks if the consumer applies "
                        "one factor to all of them, which is what the index entry prevents.")
    p.add_argument("--bit-depth", type=int, default=16, choices=(8, 16),
                   help="PNG bit depth. `Image.save()` writes 16-bit for any FLOAT image and "
                        "ignores scene.render.image_settings, so 8-bit is produced by copying the "
                        "finished pixels into a fresh non-float image -- there is no flag for it. "
                        "8-bit is ~8x smaller (a 256 px map goes ~127 kB -> ~16 kB) and needs "
                        "--per-map-scale to be worth using.")
    p.add_argument("--res-min", type=int, default=32,
                   help="floor for --texels-per-metre. Tiny trims still need a slot each.")
    p.add_argument("--scale", type=float, default=1.0,
                   help="divide every texel by this before saving, and record it in the index so "
                        "the consumer can multiply it back. REQUIRED FOR THE IRRADIANCE PASS: PNG "
                        "is an integer format and Blender clips a float buffer at 1.0 on save, "
                        "while sky-lit interior irradiance runs to ~56 with a MEAN of ~9.4. "
                        "Measured on the v99 set: 20 of 24 maps clipped, so the saved map was very "
                        "nearly a binary '>= 1.0' mask and no consumer-side gain could recover it. "
                        "One GLOBAL scale for the whole set, not per map -- per-map normalisation "
                        "would destroy the between-mesh ratios that are the entire point of a GI "
                        "bake. Find the value by baking once at --scale 1 and reading the largest "
                        "reported 'max' (the stats are taken from the float buffer, so they are "
                        "PRE-clip and remain trustworthy).")
    p.add_argument("--encode", type=float, default=1.0,
                   help="store texel^encode instead of the raw value; the consumer must apply "
                        "the inverse. 0.5 (a square root) is the useful setting. An 8-bit PNG "
                        "has 256 levels spread linearly, but a visibility map spans ~0.001 to "
                        "0.4 and is then multiplied by a gain of ~10-15 in the shader: at 0.01 "
                        "the stored value is level 2.5/255, so the dark end holds a handful of "
                        "discrete steps and the gain amplifies each one into visible speckle "
                        "(measured in v0.31.7.20, still present at 256 px / 256 samples with "
                        "denoising -- because it is quantisation, not sampling noise). A square "
                        "root spends far more of the 256 levels where the values actually live.")
    p.add_argument("--denoise", action="store_true",
                   help="⚠️ MEASURED HARMFUL -- kept only so the finding is not repeated. "
                        "Box-blurs each atlas slot to remove what looked like sampling noise. "
                        "Against a 4096-sample ground-truth bake it causes 21.8 % rms error "
                        "(worst map 29 %), while the unblurred 256-sample bake is accurate to "
                        "1.5 %. The 'noise' it removes is REAL fine-scale occlusion structure, "
                        "which the converged bake has too. Isolated against a float-buffer-only "
                        "control (identical to 8-bit at 1.5 %), so the blur is the cause and not "
                        "the buffer type. Do not enable. Originally: blurs with "
                        "`scene.cycles.use_denoising`, which is a RENDER setting: `BakeSettings` "
                        "has no denoise flag at all, so that route is silently inert -- measured "
                        "in v0.31.7.20, where it changed neither the timing nor the speckle. "
                        "A visibility bake is pure indirect "
                        "light in a dark interior -- the noisiest case Cycles has -- and "
                        "v0.31.7.19 measured the consequence: with the term finally working, "
                        "the render was visibly blotchy because gain ~15 amplifies sampling "
                        "noise 15x. Denoising is the cheap half of the fix; resolution is the "
                        "other half.")
    p.add_argument("--min-area", type=float, default=3.0,
                   help="only bake meshes with at least this much surface area (m2), which "
                        "selects the room shell without depending on mesh names")
    p.add_argument("--limit", type=int, default=24, help="cap on objects baked, largest first")
    p.add_argument("--albedo", type=float, default=0.81,
                   help="white-diffuse albedo for a visibility bake. 0.81 is MEASURED, not "
                        "chosen: the probe's ALBEDO=1 knob reports the default flat's "
                        "area-weighted mean surface albedo as r=0.812 g=0.807 b=0.788 over "
                        "467 m2, because white plaster walls and ceilings dominate the area. "
                        "That also explains why v0.31.7.9's albedo-1.0 render matched physics' "
                        "spatial profile so well -- the real room genuinely is close to a white "
                        "furnace. Re-measure per plan rather than reusing this number if the "
                        "finishes differ.")
    p.add_argument("--uv", default="box", choices=("box", "existing"),
                   help="'box' builds a fresh non-tiling 3x2 atlas (REQUIRED for the app's "
                        "shell meshes, whose UVs are tiling coordinates outside 0..1); "
                        "'existing' bakes into the exporter's UVs and is only right for assets "
                        "that already have a unique layout")
    p.add_argument("--merge", action="store_true",
                   help="append to an existing index.json in --out-dir instead of replacing it. "
                        "Required for the shared-index design: maps are keyed by world-space "
                        "geometry so one index carries EVERY baked plan, and each plan is baked "
                        "in a separate run. Without this, baking a second plan silently discards "
                        "the first plan's entries while leaving its PNGs on disk -- an index that "
                        "under-reports what is shipped, which reads as 'the maps stopped working "
                        "for that plan'.")
    p.add_argument("--json", action="store_true")
    return p.parse_args(cli_argv.normalise(p, argv))


def mesh_area(obj: bpy.types.Object) -> float:
    """World-space surface area, so `--min-area` means metres squared."""
    mw = obj.matrix_world
    total = 0.0
    mesh = obj.data
    mesh.calc_loop_triangles()
    for tri in mesh.loop_triangles:
        a, b, c = (mw @ mesh.vertices[i].co for i in tri.vertices)
        total += (b - a).cross(c - a).length * 0.5
    return total


BAKE_UV = "bake_uv"

QUANTUM_DECIMALS = 3


def _canonical(value: float) -> str:
    """Fixed-width, millimetre-rounded, with -0.000 normalised to 0.000."""
    rounded = round(value, QUANTUM_DECIMALS)
    if rounded == 0:
        rounded = 0.0
    return f"{rounded:.{QUANTUM_DECIMALS}f}"


def fnv1a32(text: str) -> str:
    """FNV-1a, 32-bit, as specified — the twin of `src/scene/lightmapKey.ts:fnv1a32`."""
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def geometry_key(obj: bpy.types.Object) -> str:
    """Name a baked map by its GEOMETRY IN PLACE, so the runtime can find it.

    The exporter's `Mesh_116` names are indices and would change on any upstream reorder, and
    the live scene does not have them at all — so a map keyed by name is unlookupable. World
    space rather than local, because two identical wall boxes in different rooms have entirely
    different aperture visibility, which is the whole quantity being baked.

    Canonical form is millimetre-rounded, fixed to three decimals, negative zero normalised,
    and **sorted** so vertex order cannot matter. Every choice is there because a float or
    ordering difference between Blender's Python and the browser would otherwise yield two keys
    for one wall. `src/scene/lightmapKey.test.ts` holds the pair to a fixture from this code.
    """
    mw = obj.matrix_world
    triples = []
    for vert in obj.data.vertices:
        co = mw @ vert.co
        # Hash in THREE's frame, not Blender's. The glTF importer has already applied Y-up ->
        # Z-up to the geometry, so a key hashed from Blender world coordinates describes a
        # rotated copy of the mesh and matches nothing the app computes -- measured in
        # `v0.31.7.16` as 0 hits out of 385 live meshes. The consumer defines the frame.
        triples.append(",".join(_canonical(c) for c in S.blender_to_three(tuple(co))))
    triples.sort()
    return fnv1a32(";".join(triples))


def classify_faces(obj: bpy.types.Object, reach: float = 30.0) -> dict[int, bool]:
    """Does anything block each face's normal direction? **Diagnostic only — read this.**

    This started life as an "is the face interior?" test and is not one. It answers the
    narrower question in its title: one ray, from the face along its own normal. A face can
    hit something within `reach` and still see most of the sky — an outward face across a
    balcony that clips a railing, say — and the bake proves it does: texels inside
    ray-classified "interior" slots reach **1.0**, i.e. full sky exposure.
    

    So its output feeds the `int_*` diagnostic fields and nothing else. **Do not gate the bake
    on it**, and do not use a per-mesh mean to validate a spatially varying map — see
    `v0.31.7.12`: the bake is already per-face correct (an outdoor face baking to 1.0 is the
    physically right answer, not pollution), and the instrument that actually validates the map
    is `spatial-profile.mjs --explain`, which compares the term against the Cycles reference
    where it is applied.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    mw = obj.matrix_world
    rot = mw.to_3x3()
    out: dict[int, bool] = {}
    for poly in obj.data.polygons:
        n = (rot @ poly.normal).normalized()
        origin = (mw @ poly.center) + n * 0.01
        hit = bpy.context.scene.ray_cast(dg, origin=origin, direction=n, distance=reach)[0]
        out[poly.index] = bool(hit)
    return out


def make_box_uvs(
    obj: bpy.types.Object,
    interior: dict[int, bool] | None = None,
    margin: float = 0.04,
) -> set[tuple[int, int]]:
    """Build a SECOND, non-tiling UV set for the bake — a 3x2 box atlas.

    **The app's shell UVs cannot be baked into, and that is not a detail.** Measured on a real
    export: the shell meshes' UVs run u = -2.9..+2.9, v = -1.6..+1.0, because they are *tiling*
    coordinates in metres for repeating plaster and tile. A bake writes into 0..1, so most of
    the surface maps outside the image and the parts that land inside overlap. The first bake
    run returned `min 0.0, max 0.0` on the two largest walls for exactly that reason.

    So a lightmap needs its own channel with a unique layout, which is also precisely how three
    consumes it: `aoMap` samples `uv1`, not the albedo channel.

    The layout is chosen to be **reproducible by the app, not just by Blender.** Each face goes
    to one of six atlas slots by the dominant axis and sign of its normal, and its position
    inside that slot is its two remaining object-space coordinates normalised by the mesh's own
    bounding box. Every input is local geometry, so the runtime can generate byte-identical UVs
    from the same mesh without shipping a UV table — which a `smart_project` unwrap could never
    offer, however much tidier its packing.

    `margin` insets each slot so bilinear filtering cannot bleed one face's values into its
    neighbour's, which at 64 px is a whole texel of error.
    """
    mesh = obj.data
    uv = mesh.uv_layers.get(BAKE_UV) or mesh.uv_layers.new(name=BAKE_UV)
    interior_slots: set[tuple[int, int]] = set()
    # Compute in THREE's frame, not Blender's. The glTF importer bakes Y-up -> Z-up into the
    # LOCAL vertices as well as the world transform -- measured: a wall's local bbox is
    # x -2.92..2.87, y -0.15..0.15, z 0..2.6, i.e. its height is on Z where the app has it on Y.
    # Computing the atlas in Blender's frame therefore permutes the slot axes relative to the
    # runtime, and every lookup lands on the wrong slot. `v0.31.7.16` saw that directly: black
    # walls with sharp white stripes, the signature of sampling empty atlas slots. Same rule as
    # `geometry_key` -- the consumer defines the frame.
    co_of = [Vector(S.blender_to_three(tuple(v.co))) for v in mesh.vertices]
    mn = Vector((min(c.x for c in co_of), min(c.y for c in co_of), min(c.z for c in co_of)))
    mx = Vector((max(c.x for c in co_of), max(c.y for c in co_of), max(c.z for c in co_of)))
    size = Vector((max(mx[i] - mn[i], 1e-6) for i in range(3)))
    for poly in mesh.polygons:
        n = Vector(S.blender_to_three(tuple(poly.normal)))
        axis = max(range(3), key=lambda i: abs(n[i]))
        row = 0 if n[axis] >= 0 else 1
        col = axis
        if interior is not None and interior.get(poly.index):
            interior_slots.add((col, row))
        o1, o2 = (i for i in range(3) if i != axis)
        for li in poly.loop_indices:
            co = co_of[mesh.loops[li].vertex_index]
            a = (co[o1] - mn[o1]) / size[o1]
            b = (co[o2] - mn[o2]) / size[o2]
            u = (col + margin + a * (1 - 2 * margin)) / 3.0
            v = (row + margin + b * (1 - 2 * margin)) / 2.0
            uv.data[li].uv = (u, v)
    mesh.uv_layers.active = uv
    return interior_slots


def _dilate_into_zeros(img: bpy.types.Image, res: int, passes: int = 4) -> int:
    """Fill EXACTLY-ZERO texels from their non-zero neighbours. Returns texels filled.

    **Why.** The 3x2 box atlas is about half uncovered by construction -- the bake
    reports it itself (`int_texels` ~2080 of 4096) -- and uncovered texels are 0.
    Measured in `v0.31.7.97`: **55.3 %** of every baked map is exactly zero, and
    **44.5 %** of rendered shell pixels sample one, so a tenth of the surface goes
    black whatever gain is applied. `p10 = 0.0` and a spread of infinity against
    physics' 2.20.

    **This is NOT the blur `--denoise` applies, and the difference is the whole
    point.** That blur rewrites REAL texels and was measured 21.8 % wrong against a
    4096-sample ground truth (220.9 % on dark texels), which is why it is kept only
    as a warning. Dilation only ever writes into texels that are exactly zero; a
    baked value is never touched. It cannot bias the measurement it feeds, only
    extend it into the padding that has no value at all.

    Standard lightmap practice for exactly this reason: bilinear filtering at a
    slot boundary blends against whatever sits outside it, so the padding has to
    hold something plausible rather than black.
    """
    px = list(img.pixels)
    w = h = res
    filled = 0
    for _ in range(passes):
        # Snapshot per pass, so a filled texel does not seed further fills within
        # the same pass -- that would smear one value across the whole padding.
        src = list(px)
        for y in range(h):
            for x in range(w):
                i = (y * w + x) * 4
                if src[i] != 0.0 or src[i + 1] != 0.0 or src[i + 2] != 0.0:
                    continue
                acc = [0.0, 0.0, 0.0]
                n = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if not (0 <= nx < w and 0 <= ny < h):
                            continue
                        j = (ny * w + nx) * 4
                        if src[j] == 0.0 and src[j + 1] == 0.0 and src[j + 2] == 0.0:
                            continue
                        for c in range(3):
                            acc[c] += src[j + c]
                        n += 1
                if n == 0:
                    continue
                for c in range(3):
                    px[i + c] = acc[c] / n
                filled += 1
    img.pixels[:] = px
    return filled


def _blur_per_slot(img: bpy.types.Image, res: int, passes: int = 3) -> None:
    """Box-blur each atlas slot independently. **MEASURED HARMFUL — see `--denoise`.**

    Retained as a record, not as a tool. `v0.31.7.22` compared bakes against a 4096-sample
    ground truth: unblurred 256 samples is accurate to **1.5 %**, this blur is **21.8 %** wrong.
    The premise it rested on — "aperture visibility is smooth at room scale, so high-frequency
    content is noise" — is false. The map carries genuine fine-scale occlusion (wall/floor
    junctions, contact under furniture) that a converged bake reproduces identically, so a
    3-texel low-pass destroys signal rather than noise.

    **Why a hand-rolled blur.** This build has no bake denoiser. `BakeSettings` carries no
    denoise flag, `scene.cycles.use_denoising` is a render-only setting that leaves a bake
    untouched (measured: it changed neither timing nor speckle), and
    `bpy.ops.image.denoise` does not exist — `hasattr(bpy.ops.image, 'denoise')` returns True
    for any name, so that is not a capability check.

    **Why blurring is legitimate here rather than a cover-up.** Aperture visibility is a smooth,
    room-scale quantity by construction (`v0.31.7.9`: it is full-GI visibility, varying over
    metres, and the first-bounce version matched nothing). The signal has no high-frequency
    content to lose; the speckle is Monte Carlo noise, which is exactly what a low-pass removes.

    **Per slot, not across the image.** The 3x2 atlas packs six faces into one texture, so a
    blur spanning slot boundaries would bleed one face's visibility into another's — precisely
    the artefact the UV margin exists to prevent.

    Three box passes approximate a Gaussian well enough for a term that is about to be
    multiplied by a single gain.
    """
    px = list(img.pixels)
    w = h = res
    for sy in range(2):
        for sx in range(3):
            x0, x1 = sx * w // 3, (sx + 1) * w // 3
            y0, y1 = sy * h // 2, (sy + 1) * h // 2
            for _ in range(passes):
                # Horizontal, then vertical, clamped to the slot's own bounds.
                for y in range(y0, y1):
                    row = [px[(y * w + x) * 4] for x in range(x0, x1)]
                    n = len(row)
                    for i in range(n):
                        a = row[max(0, i - 1)]
                        b = row[i]
                        c = row[min(n - 1, i + 1)]
                        px[(y * w + x0 + i) * 4] = (a + b + c) / 3.0
                for x in range(x0, x1):
                    col = [px[(y * w + x) * 4] for y in range(y0, y1)]
                    n = len(col)
                    for i in range(n):
                        a = col[max(0, i - 1)]
                        b = col[i]
                        c = col[min(n - 1, i + 1)]
                        px[((y0 + i) * w + x) * 4] = (a + b + c) / 3.0
    for i in range(0, len(px), 4):
        v = px[i]
        px[i + 1] = v
        px[i + 2] = v
    img.pixels[:] = px


def res_for(obj, tpm: float, lo: int, hi: int) -> int:
    """Power-of-two atlas edge giving `obj` at least `tpm` texels per metre.

    The 3x2 atlas splits the edge into 3 columns, so a face group's in-slot resolution is
    `res / 3` texels across its own extent. Sizing from the object's LARGEST dimension is
    deliberately conservative -- it is the extent that would be starved first, and a face pair
    is normalised by the mesh bounding box rather than by its own size.
    """
    m = max(obj.dimensions) if obj.dimensions else 0.0
    want = max(1.0, 3.0 * tpm * m)
    pow2 = 1 << max(0, (int(want) - 1).bit_length())
    return max(lo, min(hi, pow2))


def bake_object(
    obj: bpy.types.Object,
    out_path: str,
    res: int,
    bake_type: str,
    interior_slots: set[tuple[int, int]] | None = None,
    encode: float = 1.0,
    scale: float = 1.0,
    per_map_scale: bool = False,
    bit_depth: int = 16,
    denoise: bool = False,
    float_buffer: bool = False,
    dilate: int = 4,
) -> dict:
    """Bake one object to its own image. Per-object rather than an atlas.

    An atlas would need a packed UV layout, which would break the requirement above that the
    map be addressable by the app's own mesh UVs.
    """
    # FLOAT buffer whenever the values will be re-encoded. Applying an encode to an
    # already-8-bit buffer cannot add precision -- it re-quantises and LOSES it: measured
    # 223 distinct levels before, 166 after, exactly backwards from the intent. The float
    # buffer keeps the bake's real values until the single quantisation at save time.
    img = bpy.data.images.new(
        f"bake_{obj.name}",
        width=res,
        height=res,
        # `scale` belongs here: dividing an already-clipped 8-bit buffer recovers nothing, so a
        # scaled bake must hold the real values until the single quantisation at save time.
        float_buffer=float_buffer or encode != 1.0 or scale != 1.0 or denoise or dilate > 0,
    )
    # NON-COLOUR, set BEFORE the bake writes, not after. A visibility map is DATA -- three
    # multiplies it straight into `irradiance` -- and Blender saves an 8-bit PNG through the
    # image's colour space, which defaults to sRGB. A linear bake would be transfer-encoded on
    # the way out and used as linear on the way in, which does not merely change brightness:
    # sRGB compresses highlights and expands shadows, distorting the map's SPATIAL contrast,
    # which is the whole quantity. Setting it AFTER the bake instead reinterprets the buffer
    # and zeroes it (measured: every interior mean 0.0), so the order is load-bearing.
    img.colorspace_settings.name = "Non-Color"
    mat = obj.data.materials[0]
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type=bake_type, use_clear=True, margin=2)

    # NON-COLOUR, and this is not a detail. A visibility map is DATA, not a picture: three
    # multiplies it straight into `irradiance`. Blender saves an 8-bit PNG through the image's
    # colour space, which defaults to sRGB, so a linear bake would be transfer-encoded on the
    # way out and then used as if it were linear on the way in. That does not merely darken or
    # brighten -- sRGB compresses highlights and expands shadows, so it distorts the map's
    # SPATIAL contrast, which is the entire quantity being baked. `v0.31.7.17` measured the
    # consequence: applying the map made the match to physics WORSE (spread 4.76x -> 6.27x)
    # rather than better.
    if denoise:
        _blur_per_slot(img, res, passes=3)

    dilated = 0
    if dilate:
        dilated = _dilate_into_zeros(img, res, passes=dilate)

    if encode != 1.0:
        px_all = list(img.pixels)
        for i in range(0, len(px_all), 4):
            for c in range(3):
                v = px_all[i + c]
                px_all[i + c] = (v if v > 0 else 0.0) ** encode
        img.pixels[:] = px_all
    # Captured BEFORE the divide, so `max`/`mean` below stay in the bake's own units and remain
    # the numbers you pick `--scale` from. Reading them after would report ~1.0 for every map and
    # hide the clipping this flag exists to prevent.
    pre = list(img.pixels)[0::4]
    pre_max = max(pre) if pre else 0.0
    # PER MAP, the divisor is this map's own maximum with a little headroom, so the top of the
    # 8-bit range is actually used. A map that baked to all zeros keeps scale 1 rather than
    # dividing by zero.
    if per_map_scale:
        scale = (pre_max * 1.02) if pre_max > 0 else 1.0
    if scale != 1.0:
        px_all = list(img.pixels)
        for i in range(len(px_all)):
            if i % 4 != 3:
                px_all[i] = px_all[i] / scale
        img.pixels[:] = px_all
    img.filepath_raw = out_path
    img.file_format = "PNG"
    # SIXTEEN bits is what we need and what we get -- but NOT from here. `Image.save()` ignores
    # `scene.render.image_settings` entirely; it writes from the image's own buffer, so a FLOAT
    # image saves 16-bit PNG on its own. Proved by a `--scale 1` run, where the line below could
    # not have executed, coming out `bitdepth 16` all the same. `v0.31.7.104` claimed `--scale`
    # "forces 16-bit"; the float buffer does, and `--scale` only guarantees a float buffer.
    #
    # The same deafness killed a `--grey` flag: three identical channels is 3x the bytes for the
    # same map and the shader only samples `.r`, but `color_mode = "BW"` is ignored here too and
    # every output stayed `colortype 2`. `Image.save_render()` WOULD respect these settings and
    # is not an option -- it applies the scene's colour management, and this is deliberately
    # Non-Color data, which is the exact corruption the long comment above guards against.
    # Removed rather than left inert; a flag that silently does nothing is worse than no flag.
    if bit_depth == 8:
        # The ONLY way to get 8 bits out of a float bake: `Image.save()` reads the buffer, not the
        # scene settings, so a float image is always 16-bit. Copy the finished pixels into a fresh
        # non-float image and save that instead. Done last, after dilate and the scale divide, so
        # the single quantisation still happens at save time.
        flat = bpy.data.images.new(f"flat_{obj.name}", width=res, height=res, float_buffer=False)
        flat.colorspace_settings.name = "Non-Color"
        flat.pixels[:] = list(img.pixels)
        flat.filepath_raw = out_path
        flat.file_format = "PNG"
        flat.save()
        bpy.data.images.remove(flat)
    else:
        img.save()
    # EVERY statistic below is PRE-SCALE, in the bake's own units. One convention throughout, or
    # `--scale` would silently change the meaning of the numbers you use to choose `--scale`.
    reds = pre
    stats = {
        "min": round(min(reds), 4),
        "max": round(pre_max, 4),
        # Loud, per map, because the failure is invisible in the saved file: a clipped map looks
        # like a plausible bright one. 20 of 24 maps in the v99 irradiance set tripped this.
        "clipped": pre_max / scale > 1.0,
        # The divisor this map was actually written with -- identical to `--scale` for a global
        # run, this map's own maximum under `--per-map-scale`. The consumer needs THIS number.
        "scale": round(scale, 6),
        "mean": round(sum(reds) / len(reds), 4),
    }
    # Interior-only statistics. The whole-map figures above are dominated by outdoor-facing
    # slots pinned at 1.0 and by empty ones, neither of which depends on albedo -- which is
    # exactly why `v0.31.7.11`'s albedo sweep read as inert. These are the numbers to use.
    if interior_slots:
        vals = []
        for iy in range(res):
            for ix in range(res):
                slot = (int(ix * 3 / res), int(iy * 2 / res))
                if slot in interior_slots:
                    vals.append(reds[iy * res + ix])
        if vals:
            stats["int_min"] = round(min(vals), 4)
            stats["int_max"] = round(max(vals), 4)
            stats["int_mean"] = round(sum(vals) / len(vals), 4)
            stats["int_texels"] = len(vals)
    nt.nodes.remove(tex)
    bpy.data.images.remove(img)
    return stats


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    if a.dir:
        d = os.path.abspath(a.dir)
        with open(os.path.join(d, "manifest.json")) as fh:
            manifest = json.load(fh)
        glb = os.path.join(d, manifest.get("glb", "scene.glb"))
        out_dir = a.out_dir or os.path.join(d, "bake")
    else:
        manifest = None
        glb = os.path.abspath(a.scene)
        out_dir = a.out_dir or os.path.join(os.path.dirname(glb), "bake")
    os.makedirs(out_dir, exist_ok=True)

    fixed, stripped = glb_fix.strip_noop_dispersion(glb)
    S.reset_scene()
    S.import_glb(fixed)
    S.setup_cycles(samples=a.samples, res=(64, 64), device=a.device)
    if a.seed is not None:
        bpy.context.scene.cycles.seed = a.seed
    if a.adaptive_threshold is not None:
        bpy.context.scene.cycles.use_adaptive_sampling = True
        bpy.context.scene.cycles.adaptive_threshold = a.adaptive_threshold

    removed = 0
    sky_info = None
    if a.pass_ == "irradiance":
        # The REAL missing term, not a proxy for it. `visibility` bakes a
        # sun-independent geometric quantity under a constant white world; this
        # bakes what Cycles actually computes for this scene under the app's own
        # sun -- real materials governing every bounce, no invented albedo.
        #
        # `v0.31.7.67` tried to answer "does irradiance beat visibility?" with a
        # cheap whitened camera render instead, and could not: whitening imposes a
        # uniform albedo the bake does not have, and the answer moved from 1.39x to
        # 25.33x across the value picked. That is why this pass exists.
        #
        # Sky-dependent, and therefore only valid for the time of day it was baked
        # at -- which is the trade the cache-and-rebake architecture accepts.
        if manifest is None:
            raise ValueError("--pass irradiance needs --dir (it reads the sun from the manifest)")
        directional = manifest.get("lights", {}).get("directional") or []
        if not directional:
            raise ValueError(
                "--pass irradiance needs a directional light in the manifest to place the sun from"
            )
        # Apertures are opened for the same reason visibility opens them: whitened
        # or not, sealed glazing makes the interior nearly black. Materials are NOT
        # whitened here -- that is the whole point.
        removed, _ = RV.open_apertures()
        sky_info = S.setup_world_sky_from_three_direction(
            tuple(directional[0]["travel"]), sun_disc=a.with_sun_disc
        )
    elif a.pass_ == "visibility":
        # Order matters and is load-bearing: open the apertures BEFORE whitening, or the
        # whitened glazing seals the room and every baked texel is zero.
        RV.make_visibility_world()
        removed, _ = RV.open_apertures()
        RV.whiten_all_materials(a.albedo)

    bake_type = {
        "visibility": "DIFFUSE",
        "diffuse": "DIFFUSE",
        "irradiance": "DIFFUSE",
        "ao": "AO",
        "combined": "COMBINED",
    }[a.pass_]
    if bake_type == "DIFFUSE":
        # Colour off: with a white albedo the colour pass carries no information and would
        # only scale the result. Direct+indirect is the whole point -- v0.31.7.9 measured
        # that first-bounce-only bears no resemblance to physics (59.7x at the window).
        bpy.context.scene.render.bake.use_pass_color = False
        bpy.context.scene.render.bake.use_pass_direct = True
        bpy.context.scene.render.bake.use_pass_indirect = True
    if a.pass_ == "irradiance":
        # BOTH passes on, and the sun disc OFF. This is the decomposition, arrived at
        # by getting it wrong twice:
        #
        #   app.directDiffuse    ~= sun + lamps            (Cycles DIRECT)
        #   app.indirectDiffuse  ~= sky dome               (Cycles DIRECT, no bounce)
        #                         + every bounce           (Cycles INDIRECT)
        #
        # `v0.31.7.71` baked direct+indirect WITH the sun disc: a median 90 % of that map
        # was sun the app already renders. `v0.31.7.88` then made it indirect-only, which
        # removed the sun but also removed SKYLIGHT THROUGH THE WINDOW -- Cycles files
        # unbounced world light under DIFFUSE_DIRECT -- and `v0.31.7.92` measured the
        # consequence: 74.5 % of the shell sampling ~0, a rendered median of 20.9 against
        # physics' 133.5.
        #
        # Neither Cycles pass alone equals the app's indirect slot. Removing the SOURCE
        # (the sun disc) rather than the PASS is what isolates it.
        bpy.context.scene.render.bake.use_pass_direct = True
        bpy.context.scene.render.bake.use_pass_indirect = True

    candidates = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        area = mesh_area(obj)
        if area >= a.min_area:
            candidates.append((area, obj))
    candidates.sort(key=lambda t: -t[0])
    selected = candidates[: a.limit]

    # The context must be known BEFORE the first file is written, because it goes in the
    # FILENAME. Naming maps `<key>.png` was not enough: the 20 keys shared between the 4-Room and
    # 5-Room plans resolved to the same filename, so the second bake overwrote the first plan's
    # pixels even though the index kept both entries -- 176 entries against 156 files on disk.
    # The index was fixed and the assets were not, which is the worse half of the same bug.
    #
    # Keying every candidate first is cheap (a hash per mesh, no rendering) and removes the
    # chicken-and-egg: the context is the digest of this plan's key set.
    keyed = []
    for area, obj in selected:
        if not obj.data.materials:
            continue
        keyed.append((area, obj, geometry_key(obj)))
    plan_context = fnv1a32(";".join(sorted(k for _, _, k in keyed)))

    baked = []
    for area, obj, key in keyed:
        if a.uv == "box":
            interior = classify_faces(obj)
            interior_slots = make_box_uvs(obj, interior)
            uv_name = BAKE_UV
        else:
            interior_slots = None
            uv_name = obj.data.uv_layers.active.name
        # Named by CONTEXT + KEY. `Mesh_116` is an exporter index the runtime has never heard
        # of, so the name has to come from geometry -- and it needs the context too, or two
        # plans sharing a wall position share a file.
        out = os.path.join(out_dir, f"{plan_context}-{key}.png")
        try:
            # KEYWORDS, not positions. `v0.31.7.x` inserted `dilate` ahead of `float_buffer`
            # in the signature and the positional call silently passed a bool as an int; adding
            # `scale` after `encode` would have done the same to `denoise`. Names cannot slip.
            stats = bake_object(
                obj,
                out,
                res=res_for(obj, a.tpm, a.res_min, a.res) if a.tpm else a.res,
                bake_type=bake_type,
                interior_slots=interior_slots,
                encode=a.encode,
                scale=a.scale,
                per_map_scale=a.per_map_scale,
                bit_depth=a.bit_depth,
                denoise=a.denoise,
                float_buffer=a.float_buffer,
                dilate=a.dilate,
            )
        except RuntimeError as exc:  # noqa: PERF203 — one bad mesh must not lose the batch
            baked.append({"object": obj.name, "area": round(area, 2), "error": str(exc)[:120]})
            continue
        baked.append(
            {
                "object": obj.name,
                "area": round(area, 2),
                "out": out,
                "uv": uv_name,
                "key": key,
                "interior_slots": sorted(interior_slots) if interior_slots else [],
                **stats,
            }
        )

    result = {
        "ok": True,
        "pass": a.pass_,
        "bake_type": bake_type,
        "sky": sky_info,
        "out_dir": out_dir,
        "res": a.res,
        "texels_per_metre": a.tpm,
        "uv_mode": a.uv,
        "albedo": a.albedo,
        "samples": a.samples,
        "denoise": a.denoise,
        "seed": a.seed,
        "adaptive_threshold": a.adaptive_threshold,
        "encode": a.encode,
        "scale": a.scale,
        "glazing_removed": removed,
        "dispersion_stripped": stripped,
        "candidates_over_min_area": len(candidates),
        "baked": len(baked),
        "objects": baked,
    }
    # An index beside the maps, so the app loads one small file rather than probing for
    # 40 textures by name. `object` and `area` are debugging aids only -- the key is the
    # contract.
    # A PLAN CONTEXT, because a mesh key is not a sufficient identity on its own. Aperture
    # visibility is a property of a surface IN ITS SURROUNDINGS, and `geometry_key` hashes only
    # the surface. Measured: baking the 5-Room plan on top of the 4-Room set, 20 of 65 meshes
    # collided -- HDB layouts share wall positions on a grid, so the same wall recurs at the same
    # coordinates in different plans while seeing entirely different rooms. Computed above,
    # before any file is written, because it is part of the filename.
    fresh = [
        {"key": o["key"], "file": os.path.basename(o["out"]), "object": o["object"],
         "area": o["area"], "ctx": plan_context,
         # Where the bake actually put room-facing data. The runtime derives the
         # slot from the app's triangle winding, which is free to disagree with
         # Blender's `poly.normal` and did: v0.31.7.98 measured whole surfaces
         # black because the lookup landed on the empty mirror row. Recording the
         # occupancy lets the consumer ASK rather than re-derive a convention
         # neither side controls.
         "slots": o.get("interior_slots") or [],
         # PER-MAP divisor. Present on every entry, equal to the global `--scale` unless
         # `--per-map-scale` was used. The consumer multiplies by THIS in preference to the
         # index-level value, which is what keeps between-mesh ratios exact when each map was
         # normalised to its own maximum.
         "scale": o.get("scale", 1.0)}
        for o in baked
        if "out" in o
    ]
    maps = fresh
    merged_from = 0
    index_path = os.path.join(out_dir, "index.json")
    if a.merge and os.path.exists(index_path):
        with open(index_path) as fh:
            prior = json.load(fh).get("maps", [])
        merged_from = len(prior)
        # Keyed by geometry, so a repeat bake of the SAME plan replaces its own entries rather
        # than duplicating them -- the key is the identity, and last write wins.
        # Keyed by (context, key): a repeat bake of the SAME plan replaces its own entries,
        # while a different plan that happens to share a wall position keeps both.
        by_key = {(m.get("ctx"), m["key"]): m for m in prior}
        for m in fresh:
            by_key[(m["ctx"], m["key"])] = m
        maps = sorted(by_key.values(), key=lambda m: (m.get("ctx") or "", m["key"]))
    index = {
        # v2 adds the per-map `ctx`. The loader refuses versions it does not implement rather
        # than loading a v1 set, whose maps carry no context and could be applied to the wrong
        # plan -- exactly the failure this version exists to prevent.
        "version": 2,
        "pass": a.pass_,
        "albedo": a.albedo,
        "uv": "box-atlas-3x2",
        "uv_margin": 0.04,
        # IN THE INDEX, not just the stdout report. `encode` has been reported for many versions
        # and never written here, which is why the runtime could not read it even in principle
        # (`v0.31.7.103`). A transform applied to the data must travel WITH the data.
        "encode": a.encode,
        "scale": a.scale,
        "maps": maps,
    }
    with open(index_path, "w") as fh:
        json.dump(index, fh, indent=2)
    result["index"] = index_path
    result["index_maps_total"] = len(maps)
    result["index_merged_from"] = merged_from
    result["plan_context"] = plan_context
    result["contexts_in_index"] = len({m.get("ctx") for m in maps})
    print("BAKE_MATERIAL " + json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
