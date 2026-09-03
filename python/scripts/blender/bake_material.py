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
import math
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
    p.add_argument("--room-albedo", action="store_true", dest="room_albedo",
                   help="also compute an EXPOSURE-WEIGHTED mean albedo per room (from --dir's "
                        "manifest `rooms`) and write it into the index. Rays cast down from just "
                        "under the ceiling, so a rug counts as a rug and not as the floor beneath "
                        "it -- v0.31.7.122 measured 44 %% of the reference room's floor as covered. "
                        "Cheap here because Blender is already tracing visibility; the raster path "
                        "cannot afford it at all.")
    p.add_argument("--portals", action="store_true",
                   help="place a Cycles light portal over each glazing opening before baking. "
                        "Standard archviz practice for daylit interiors: it guides the sampler "
                        "through the window instead of leaving it to find the hole by chance. "
                        "Applies to ENVIRONMENT light only -- documented as doing nothing for sun "
                        "lamps -- which suits the irradiance pass, whose sun disc is off.")
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
    p.add_argument("--fill-holes", action="store_true", dest="fill_holes",
                   help="fill EVERY zero texel from real data with a per-slot push-pull pyramid, "
                        "instead of --dilate's one-texel-per-pass. v0.31.7.126 measured dilation "
                        "converging far too slowly (4 -> 16 passes moved the unwritten ring only "
                        "41.8%% -> 33.6%%) because the holes are large unaddressed regions, not "
                        "thin margins. O(n) and closes any hole size.")
    p.add_argument("--bake-margin", type=int, default=2, dest="bake_margin",
                   help="Cycles bake margin in PIXELS -- how far shaded values are extended past "
                        "the UV island's edge. `v0.31.7.125` measured 33.7 %% of the outermost "
                        "ADDRESSABLE texel ring as unwritten across 301 of 333 maps, which is what "
                        "the edge dots on a column are: a texel whose centre falls outside the UV "
                        "triangle is never shaded, and 2 px of margin does not reach it.")
    p.add_argument("--res-min", type=int, default=32,
                   help="floor for --texels-per-metre. Tiny trims still need a slot each.")
    p.add_argument("--scale", type=float, default=1.0,
                   help="divide every texel by this before saving, and record it in the index so "
                        "the consumer can multiply it back. REQUIRED FOR THE IRRADIANCE PASS: PNG "
                        "is an integer format and Blender clips a float buffer at 1.0 on save, "
                        "while sky-lit interior irradiance runs to ~56 with a MEAN of ~9.4. "
                        "Measured on the v99 set: 20 of 24 maps clipped, so the saved map was very "
                        "nearly a binary '>= 1.0' mask and no consumer-side gain could recover it. "
                        "A GLOBAL scale for the whole set; see --per-map-scale for the per-map "
                        "alternative. (This help used to claim per-map normalisation 'would "
                        "destroy the between-mesh ratios that are the entire point of a GI bake'. "
                        "That was WRONG and v0.31.7.109 corrected it: the divisor travels with the "
                        "map and is re-applied per material, so the ratios reconstruct exactly.) "
                        "Find the value by baking once at --scale 1 and reading the largest "
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


def slot_bounds(col: int, row: int, w: int, h: int) -> tuple[int, int, int, int]:
    """Pixel bounds `(x0, x1, y0, y1)` of atlas slot `(col, row)`. THE one convention.

    **A texel belongs to the slot containing its CENTRE**, i.e. texel `i` is in
    `floor((i + 0.5) * 3 / w)`. At 256 px the column boundaries are therefore **0, 85, 171, 256**
    (widths 85/86/85), because texel 85's centre 85.5 exceeds the true boundary 85.33 while texel
    170's centre 170.5 does not reach 170.67.

    **Written because three conventions were in use and two were wrong** (`v0.31.7.128`):

    - `slot-means.mjs:slotRect` used `Math.round(col * w / 3)` -> 0, 85, 171. **Correct**, and it
      is what every published slot mean and `ring-zeros.mjs` figure rests on.
    - `_fill_holes_pushpull` used floor division -> 0, 85, **170**. It placed texel 170 in slot 2
      when its centre belongs to slot 1, so the fill pulled values ACROSS a slot boundary -- the
      one thing a per-slot fill exists to prevent.
    - the interior-statistics loop used the texel's LEFT EDGE (`int(ix * 3 / res)`) -> texel 85
      lands in slot 0 when its centre belongs to slot 1. Off by one the other way.

    Fractional boundaries are why this is easy to get wrong: `res / 3` is not an integer for any
    power-of-two `res`, so floor, round and left-edge all disagree, and each looks reasonable
    alone.
    """
    return (
        int(col * w / 3 + 0.5),
        int((col + 1) * w / 3 + 0.5),
        int(row * h / 2 + 0.5),
        int((row + 1) * h / 2 + 0.5),
    )


def slot_of(ix: int, iy: int, w: int, h: int) -> tuple[int, int]:
    """Which slot a texel belongs to, by its CENTRE. Inverse of `slot_bounds`."""
    return (min(2, int((ix + 0.5) * 3 / w)), min(1, int((iy + 0.5) * 2 / h)))


def _fill_holes_pushpull(img: bpy.types.Image, res: int) -> int:
    """Fill every zero texel from real data via a PUSH-PULL pyramid, per atlas slot.

    **Why not more dilation passes.** `_dilate_into_zeros` advances one texel per pass, so a hole
    40 texels wide needs 40 passes. `v0.31.7.126` measured that directly: going from 4 passes to 16
    moved the unwritten fraction of the addressable ring only 41.8 % -> 33.6 %, and 16 more would
    still not close it. The holes are not thin margins -- in-slot coordinates are normalised by the
    MESH BOUNDING BOX rather than by the face, so a mesh whose faces do not tile their bbox
    cross-section leaves large genuinely-unaddressed regions inside the band the UVs address.

    Push-pull is the standard answer and is O(n): average non-zero children up the pyramid, then
    fill zeros from the parent on the way down. Any hole closes regardless of size.

    **PER SLOT, and that is load-bearing.** The 3x2 atlas packs six face directions into one
    texture; a fill that crossed a slot boundary would bleed one face's light onto another, which
    is the exact artefact `uv_margin` exists to prevent. Each slot is pyramided independently.

    Real texels are never touched -- only exact zeros are written, same contract as
    `_dilate_into_zeros`, so this cannot bias a baked value.

    ## NOT THE DEFAULT, because it does not yet do what this docstring claims

    Measured over 12 meshes (`v0.31.7.127`), it is the best padding arm by a clear margin --
    unwritten addressable ring **41.8 % -> 28.7 %**, zeros within populated slots
    **47.3 % -> 29.7 %** -- and beats a 6x bake margin with 4x the dilation passes (33.1 %). But a
    fill that pulls from a 1x1 top level should leave **0 %** in any slot holding data, and it
    leaves 29.7 %. Something in it is not reaching, and the mechanism is not identified.

    Worse, the same run reports **62 populated slots where the dilation arm reports 66**. A fill
    that only writes into zeros cannot reduce the number of slots holding data, so either the
    counter is measuring across a slot rectangle the fill computes differently -- the fill uses
    floor division (`col * res // 3`) while `slot-means.mjs` uses rounding, which disagree by a
    texel at 256 px -- or the fill is clobbering real data. Until that is settled this stays behind
    a flag: a padding routine that quietly deletes baked light would look exactly like the seam it
    was written to remove.
    """
    px = list(img.pixels)
    filled = 0
    for col in range(3):
        for row in range(2):
            x0, x1, y0, y1 = slot_bounds(col, row, res, res)
            w, h = x1 - x0, y1 - y0
            if w <= 0 or h <= 0:
                continue
            # Level 0: (r, g, b, weight) with weight 1 where the bake wrote something.
            cur = []
            for y in range(y0, y1):
                for x in range(x0, x1):
                    i = (y * res + x) * 4
                    r, g, b = px[i], px[i + 1], px[i + 2]
                    cur.append((r, g, b, 1.0 if (r or g or b) else 0.0))
            levels = [(w, h, cur)]
            while levels[-1][0] > 1 or levels[-1][1] > 1:
                pw, ph, prev = levels[-1]
                nw, nh = max(1, (pw + 1) // 2), max(1, (ph + 1) // 2)
                nxt = []
                for y in range(nh):
                    for x in range(nw):
                        r = g = b = acc = 0.0
                        for dy in (0, 1):
                            for dx in (0, 1):
                                sx, sy = x * 2 + dx, y * 2 + dy
                                if sx >= pw or sy >= ph:
                                    continue
                                c = prev[sy * pw + sx]
                                if c[3] > 0.0:
                                    r += c[0]
                                    g += c[1]
                                    b += c[2]
                                    acc += 1.0
                        nxt.append((r / acc, g / acc, b / acc, 1.0) if acc > 0 else (0.0, 0.0, 0.0, 0.0))
                levels.append((nw, nh, nxt))
            # Pull: a zero takes its parent's average, coarsest level first.
            for li in range(len(levels) - 2, -1, -1):
                cw, ch, cl = levels[li]
                pwid, _ph, par = levels[li + 1]
                for y in range(ch):
                    for x in range(cw):
                        i = y * cw + x
                        if cl[i][3] > 0.0:
                            continue
                        pc = par[(y // 2) * pwid + (x // 2)]
                        if pc[3] > 0.0:
                            cl[i] = (pc[0], pc[1], pc[2], 1.0)
            # Write back only what was a hole.
            _w, _h, lvl0 = levels[0]
            for y in range(h):
                for x in range(w):
                    c = lvl0[y * w + x]
                    i = ((y0 + y) * res + (x0 + x)) * 4
                    if (px[i] or px[i + 1] or px[i + 2]) or c[3] <= 0.0:
                        continue
                    px[i], px[i + 1], px[i + 2] = c[0], c[1], c[2]
                    filled += 1
    img.pixels[:] = px
    return filled


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
            x0, x1, y0, y1 = slot_bounds(sx, sy, w, h)
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


def glazing_bounds(glazing) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    """World-space `(lo, hi)` per glazing object, as PLAIN NUMBERS.

    Taken before `open_apertures()` runs, because that deletes the objects and a held reference
    then raises `ReferenceError: StructRNA of type Object has been removed`. Numbers survive; the
    objects do not.
    """
    out = []
    for obj in glazing:
        corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        lo = tuple(min(c[i] for c in corners) for i in range(3))
        hi = tuple(max(c[i] for c in corners) for i in range(3))
        out.append((lo, hi))
    return out


def add_portals(bounds) -> int:
    """Put a Cycles light PORTAL over every glazing opening. Returns how many were placed.

    **Why this is the right lever for the irradiance pass specifically.** A forward path tracer
    has to find its way out of a small opening by chance, which is why a daylit interior is the
    classic noisy case; a portal tells Cycles where the opening is so it can sample the world
    directly through it. The documented limitation is that portals accelerate **environment
    lighting only and do nothing for sun lamps** -- and the irradiance pass turns the sun disc OFF
    and bakes the sky dome plus bounces, so it is exactly the case portals exist for. The
    visibility pass is the same shape.

    Placed from the glazing bounds captured BEFORE `open_apertures()` deletes them, because the
    aperture and the portal have to describe the same hole.

    **A portal that fails to become a portal EMITS**, which would not look like a bug -- it would
    look like a brighter, cleaner bake -- so `is_portal` is read back and a failure raises.
    """
    placed = 0
    for idx, (lo_t, hi_t) in enumerate(bounds):
        lo = Vector(lo_t)
        hi = Vector(hi_t)
        size = hi - lo
        thin = min(range(3), key=lambda i: size[i])
        wide = [i for i in range(3) if i != thin]
        light = bpy.data.lights.new(name=f"portal_{idx}", type="AREA")
        light.shape = "RECTANGLE"
        light.size = max(size[wide[0]], 1e-3)
        light.size_y = max(size[wide[1]], 1e-3)
        cy = getattr(light, "cycles", None)
        if cy is None or not hasattr(cy, "is_portal"):
            raise RuntimeError(
                "this Blender exposes no `light.cycles.is_portal`; an AREA light without it "
                "would EMIT into the bake instead of guiding it"
            )
        cy.is_portal = True
        if not cy.is_portal:
            raise RuntimeError("is_portal did not stick -- refusing to bake with an emitting light")
        ob = bpy.data.objects.new(light.name, light)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = (lo + hi) / 2.0
        # Local -Z is the area light's normal. Point it along the glazing's THIN axis, which is
        # the direction light travels through the pane.
        ob.rotation_euler = (
            (0.0, math.pi / 2.0, 0.0) if thin == 0
            else (math.pi / 2.0, 0.0, 0.0) if thin == 1
            else (0.0, 0.0, 0.0)
        )
        placed += 1
    return placed


def _fibonacci_sphere(n: int) -> list[tuple[float, float, float]]:
    """`n` roughly-uniform directions on the unit sphere, DETERMINISTICALLY.

    No RNG: a census that moves between runs cannot be compared between runs, and the whole use of
    this number is a ratio against a reference measured earlier.
    """
    out = []
    ga = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n):
        z = 1.0 - (2.0 * i + 1.0) / n
        r = math.sqrt(max(0.0, 1.0 - z * z))
        th = ga * i
        out.append((r * math.cos(th), r * math.sin(th), z))
    return out


def room_albedo_area(rooms, reach: float = 0.25) -> list[dict]:
    """AREA-weighted mean albedo per room, over UNOCCLUDED faces. The theoretically right one.

    **Why this and not the other two.** `v0.31.7.124` measured four censuses giving four answers for
    the same room, spanning **0.36-0.76**, and concluded the disagreement was not measurement error
    but a missing definition. The interreflection form `rho/(1-rho)` comes from enclosure radiosity,
    where rho is the **area-weighted** mean over the surfaces that actually participate:

    - the downward ray probe measures floors and furniture tops only (0.362);
    - the spherical probe is solid-angle weighted from interior points, which is form-factor
      weighting and a different average (0.760);
    - `sceneRoomAlbedo` in the app does area but counts **occluded** surface -- a wall behind a
      wardrobe returns nothing (0.672).

    This is area weighting with the occluded area removed, which is the one radiosity asks for.

    **Occlusion is one SHORT ray along the face normal.** `reach` is 0.25 m on purpose, and the
    first version used `face_blocked`'s 4.0 m and was wrong: in an enclosed room the opposite wall is
    always within 4 m, so every wall classified as blocked and the census reported **96 % of a
    bedroom occluded**. That number is what caught it. The question here is not "does this face see
    anything" but "is something *up against* it" -- a wall behind a wardrobe, a floor under a rug --
    which is a contact-distance test.

    Cheap, and it is why this belongs in Blender: `v0.31.7.122` recorded the app rejecting an
    irradiance volume at 6.19 ms for 420 probes, and this is one ray per face.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    acc = {
        r["id"]: {
            "area": 0.0,
            "weighted": 0.0,
            "faces": 0,
            "occluded": 0.0,
            "floor_area": 0.0,
            "wall_area": 0.0,
            "ceiling_area": 0.0,
            "other_area": 0.0,
            "other_weighted": 0.0,
        }
        for r in rooms
    }
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        rho, _is_tex = _material_albedo(obj)
        if rho is None:
            continue
        mw = obj.matrix_world
        rot = mw.to_3x3()
        for poly in obj.data.polygons:
            centre_world = mw @ poly.center
            three = S.blender_to_three(tuple(centre_world))
            room = _room_containing(rooms, three[0], three[2])
            if room is None:
                continue
            # `poly.area` is in LOCAL units; scale by the object's world scale so an instanced
            # mesh contributes its rendered size, not its authored one.
            sc = mw.to_scale()
            area = poly.area * abs(sc[0] * sc[1] + sc[1] * sc[2] + sc[2] * sc[0]) / 3.0
            if area <= 0:
                continue
            n = (rot @ poly.normal).normalized()
            blocked = bpy.context.scene.ray_cast(
                dg, origin=centre_world + n * 0.01, direction=n, distance=reach
            )[0]
            a = acc[room]
            if blocked:
                a["occluded"] += area
                continue
            a["area"] += area
            a["weighted"] += area * rho
            a["faces"] += 1
            # BUCKET BY SURFACE CLASS, so the consumer can recompute rho when a finish changes
            # without re-baking. Areas do not move when a wall is repainted; only albedo does. The
            # app can therefore evaluate
            #     rho = (Af*af + Aw*aw + Ac*ac + Ao*rho_o) / (Af + Aw + Ac + Ao)
            # from the catalogue swatch of whatever finish is currently selected -- which is what
            # makes `v0.31.7.135`'s within-room delta computable at runtime, given that
            # `v0.31.7.122` ruled out a runtime exposure census on cost (an irradiance volume was
            # rejected at 6.19 ms for 420 probes; this is arithmetic on four numbers).
            # The NORMAL must be converted too. The first version passed `n` in Blender's frame
            # while `_surface_class` tests `normal[1]` as UP -- in Blender that component is
            # three's -Z, i.e. north/south. The symptom was `floor_m2 = 0.07` where the floor is
            # ~23 m2, and repainted wall faces leaking into `other` (its rho moved 0.5818 ->
            # 0.5474 between arms, which a fixed bucket cannot do).
            cls = _surface_class(rooms, room, three, S.blender_to_three(tuple(n)))
            a[f"{cls}_area"] += area
            if cls == "other":
                a["other_weighted"] += area * rho
    out = []
    for r in rooms:
        a = acc[r["id"]]
        total = a["area"] + a["occluded"]
        out.append(
            {
                "id": r["id"],
                "name": r.get("name"),
                # `None`, not a default: no participating area is a different condition from a
                # neutral room, and a silent fallback would hide an empty traversal.
                "rho": round(a["weighted"] / a["area"], 4) if a["area"] > 0 else None,
                "participating_m2": round(a["area"], 1),
                "occluded_m2": round(a["occluded"], 1),
                "occluded_share": round(a["occluded"] / total, 3) if total > 0 else None,
                "faces": a["faces"],
                # Area weights per surface class, occlusion already removed.
                "floor_m2": round(a["floor_area"], 2),
                "wall_m2": round(a["wall_area"], 2),
                "ceiling_m2": round(a["ceiling_area"], 2),
                "other_m2": round(a["other_area"], 2),
                # Mean albedo of everything the user cannot repaint (furniture, fittings, glazing).
                "other_rho": (
                    round(a["other_weighted"] / a["other_area"], 4) if a["other_area"] > 0 else None
                ),
            }
        )
    return out


def _surface_class(rooms, room_id: str, centre_three, normal_three) -> str:
    """Classify a face as `floor` / `wall` / `ceiling` / `other`.

    **Position, not just normal.** A table top and a floor share an up-facing normal, and a cabinet
    side and a wall share a horizontal one -- so normal alone would make a repaint of the wall
    finish move the sofa's albedo. The discriminator is where the face IS: a floor sits at floor
    level, a ceiling at ceiling height, a wall on the room's perimeter. Everything else is `other`,
    whose albedo is baked because nothing in the UI can change it.

    Deliberately conservative: a face that is ambiguous falls to `other`, which makes it a fixed
    weight rather than one that responds to the wrong control.

    ## ⚠️ The `wall` test is 2.6x OVER-INCLUSIVE — measured, `v0.31.7.139`

    Diffing every face's albedo between two exports of the same room that differ only in
    `wall-paint-terracotta` says exactly which faces take the wall finish:

        class      area m2   changed m2   changed %   changed faces
        ceiling      20.00         0.00        0.0 %              0
        floor        13.51         0.00        0.0 %              0
        other        21.84         0.00        0.0 %              0
        wall         63.04        23.81       37.8 %             20

    `floor`, `ceiling` and `other` are **clean** — nothing in them moves, which is the property a
    fixed bucket must have. But only **37.8 %** of the `wall` bucket actually repaints: `edge < 0.3`
    also claims window reveals, columns, skirting and the far side of party walls.

    **And with the true area the reconstruction works.** Taking the wall bucket as the 23.81 m2 that
    changed, and solving the fixed remainder from the base census, gives terracotta **0.5780**
    against a directly censused **0.5719** -- **1.1 % out of sample**, where the over-inclusive
    bucket was 28 % out. So the architecture is right and this one test is wrong: the wall bucket
    must be the faces carrying the wall MATERIAL, not the faces near the perimeter.
    """
    room = next((r for r in rooms if r["id"] == room_id), None)
    if room is None:
        return "other"
    h = room.get("ceilingHeight") or 2.6
    x, y, z = centre_three
    ny = normal_three[1]
    if ny > 0.7 and y < 0.15:
        return "floor"
    if ny < -0.7 and y > h - 0.3:
        return "ceiling"
    if abs(ny) < 0.5:
        ox, oz = room["origin"]
        edge = min(x - ox, ox + room["width"] - x, z - oz, oz + room["depth"] - z)
        if edge < 0.3:
            return "wall"
    return "other"


def _room_containing(rooms, x: float, z: float):
    """Room id whose rectangle contains `(x, z)` in THREE's frame, or `None`."""
    for r in rooms:
        ox, oz = r["origin"]
        if ox <= x <= ox + r["width"] and oz <= z <= oz + r["depth"]:
            return r["id"]
    return None


def room_albedo(rooms, samples: int = 48, dirs: int = 1) -> list[dict]:
    """EXPOSURE-WEIGHTED mean albedo per room, by ray-casting the scene from the ceiling down.

    **Why this lives in Blender.** `v0.31.7.122` established that a room-albedo census has to weight
    by *exposed* area, not total area -- a rug and furniture cover **44 %** of the reference room's
    floor, so counting a floor mesh's full area over-weights it by ~1.8x. Exposure is a visibility
    computation, and the app cannot pay for it: `src/scene/CLAUDE.md` records an irradiance volume
    spiked and REJECTED at 6.19 ms for 420 probes, while a useful exposure sample is tens of
    thousands of rays. Blender is already tracing visibility for the bake, so the census is nearly
    free here and ships as ONE NUMBER PER ROOM in the index.

    **Rays go DOWN from just under the ceiling**, so what they hit is what the ceiling and upper
    walls actually see -- which is the surface that returns light to the room. A ray that hits a rug
    counts the rug, not the floor beneath it. That is the whole point.

    Albedo comes from the hit material's base colour, reading the linked TEXTURE's mean when one
    drives it -- glTF puts the albedo in the image and leaves `baseColorFactor` white, the exact
    `v0.31.5.273` blind spot, and it is **69 %** of this room's exposed area. `textured_share`,
    `unknown_share` and `hit_share` are all reported as fractions of ALL rays, so a reader can see
    how much of `rho` stands on a subsample rather than having to trust it.

    ## Known limitation: DOWNWARD rays only, so this is "what the ceiling sees"

    Every ray goes straight down, which samples the floor and the tops of furniture and **never
    samples a wall**. For the room albedo that scales interreflected fill you want every surface,
    weighted by how much light it actually returns -- which is a sphere of directions from many
    points in the volume, not one direction from a grid. So the number below is a real
    exposure-weighted albedo of the horizontal surfaces and an INCOMPLETE one for the room.
    Extending it is more rays in more directions, which is cheap here and is the natural next step;
    it is called out rather than quietly shipped as a room average.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    out = []
    for room in rooms:
        ox, oz = room["origin"]
        w, d = room["width"], room["depth"]
        h = (room.get("ceilingHeight") or 2.6) - 0.05
        # The plan is in THREE's frame (+X east, +Z south, Y up); Blender is Z-up.
        weighted = 0.0
        hits = 0
        textured = 0
        missed = 0
        escaped = 0
        # `dirs == 1` keeps the original DOWNWARD probe -- "what the ceiling sees". Anything more
        # samples a sphere from points spread through the room's volume, which is the quantity that
        # actually scales interreflected fill: every surface, weighted by how much of the room's
        # solid angle it occupies. Heights are inset from floor and ceiling so an origin cannot
        # start inside the slab it is trying to measure.
        rays = [(0.0, 0.0, -1.0)] if dirs <= 1 else _fibonacci_sphere(dirs)
        heights = [h] if dirs <= 1 else [0.35 * h, 0.6 * h, 0.85 * h]
        reach = math.hypot(w, d) + h
        for i in range(samples):
            for j in range(samples):
                tx = ox + (i + 0.5) / samples * w
                tz = oz + (j + 0.5) / samples * d
                for hh in heights:
                    for dxyz in rays:
                        origin = Vector(S.three_to_blender((tx, hh, tz)))
                        hit, _loc, _nrm, _idx, obj, _mw = bpy.context.scene.ray_cast(
                            dg, origin=origin, direction=Vector(dxyz), distance=reach
                        )
                        if not hit or obj is None:
                            # A ray that leaves through a window returns no bounce, which is
                            # physically correct and must not be averaged in as a dark surface.
                            escaped += 1
                            continue
                        rho, is_tex = _material_albedo(obj)
                        # COUNTED BEFORE THE SKIP. The first version incremented `textured` after
                        # `if rho is None: continue`, and a textured material returns `rho = None`
                        # -- so the counter was unreachable and `textured_share` reported 0.0 for
                        # every room while 69 % of rays were being silently discarded. A diagnostic
                        # field that cannot fire is worse than no field: it actively certifies the
                        # thing it was meant to catch.
                        if is_tex:
                            textured += 1
                        if rho is None:
                            missed += 1
                            continue
                        weighted += rho
                        hits += 1
        total_rays = samples * samples * len(heights) * len(rays)
        out.append(
            {
                "id": room["id"],
                "name": room.get("name"),
                # `None`, not a default: no hits is a DIFFERENT condition from a neutral room, and a
                # silent fallback would make an empty room look like a white one.
                "rho": round(weighted / hits, 4) if hits else None,
                "samples": samples * samples * len(heights) * len(rays),
                "dirs": len(rays),
                "hits": hits,
                # Shares of ALL rays, not of hits, so they actually sum toward 1 and a reader can
                # see how much of `rho` is standing on a subsample.
                "textured_share": round(textured / max(1, total_rays), 3),
                "unknown_share": round(missed / max(1, total_rays), 3),
                "escaped_share": round(escaped / max(1, total_rays), 3),
                "hit_share": round(hits / max(1, total_rays), 3),
            }
        )
    return out


_TEX_MEAN: dict[str, float | None] = {}


def _image_mean_luma(img, stride: int = 97) -> float | None:
    """Mean Rec.709 luminance of an image, subsampled.

    **Subsampled on purpose.** A 2K albedo is 16M floats and `image.pixels` is a slow RNA
    accessor; a census wants the mean, and a mean converges long before every texel is read. 97 is
    prime, so the stride cannot lock onto a tiled pattern's period and report one stripe's colour
    as the whole image -- which a round number like 100 can do on a 100-px-repeat tile.
    """
    if img is None or img.size[0] == 0:
        return None
    key = img.name
    if key in _TEX_MEAN:
        return _TEX_MEAN[key]
    try:
        px = list(img.pixels)
    except (RuntimeError, AttributeError):
        _TEX_MEAN[key] = None
        return None
    if not px:
        _TEX_MEAN[key] = None
        return None
    total = 0.0
    n = 0
    # glTF albedo images are sRGB-encoded; linearise before averaging or dark texels are
    # over-credited -- the same error `swatchLuminance` guards in the app.
    for i in range(0, len(px) - 3, 4 * stride):
        r, g, b = px[i], px[i + 1], px[i + 2]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
        total += 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
        n += 1
    mean = total / n if n else None
    _TEX_MEAN[key] = mean
    return mean


def _material_albedo(obj) -> tuple[float | None, bool]:
    """Rec.709 luminance of an object's base colour, and whether a texture drives it.

    **Reads the TEXTURE when one is linked**, rather than giving up. `v0.31.7.123` measured that
    doing otherwise discards **69 %** of the exposed area in the reference living/dining room --
    glTF puts the albedo in the image and leaves `baseColorFactor` white, so the earlier version
    censused the 31 % of surfaces that happened to be untextured and reported the mean of that
    subsample as the room's albedo.
    """
    mats = [m for m in getattr(obj.data, "materials", []) or [] if m and m.node_tree]
    if not mats:
        return None, False
    for node in mats[0].node_tree.nodes:
        sock = node.inputs.get("Base Color") if hasattr(node, "inputs") else None
        if sock is None:
            continue
        if sock.is_linked:
            src = sock.links[0].from_node if sock.links else None
            img = getattr(src, "image", None)
            mean = _image_mean_luma(img)
            # `is_tex` stays True either way, so the share is still reported -- but a mean that
            # WAS read is a real albedo and counts.
            return mean, True
        c = sock.default_value
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], False
    return None, False


def bake_object(
    obj: bpy.types.Object,
    out_path: str,
    res: int,
    bake_type: str,
    interior_slots: set[tuple[int, int]] | None = None,
    encode: float = 1.0,
    scale: float = 1.0,
    bake_margin: int = 2,
    fill_holes: bool = False,
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
        float_buffer=float_buffer
        or encode != 1.0
        or scale != 1.0
        or denoise
        or dilate > 0
        or fill_holes,
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
    bpy.ops.object.bake(type=bake_type, use_clear=True, margin=bake_margin)

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
    if fill_holes:
        dilated = _fill_holes_pushpull(img, res)
    elif dilate:
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
        # HOW MANY TEXELS THE PADDING ACTUALLY WROTE. Computed since padding existed and never
        # reported, so every `--dilate` and `--fill-holes` arm in `v0.31.7.126`/`.127` was scored
        # without anyone able to see whether the routine had run. Same class of gap as `.123`'s
        # unreachable `textured_share`: the number existed, nothing surfaced it.
        "padded": dilated,
        "padding": "fill-holes" if fill_holes else (f"dilate{dilate}" if dilate else "none"),
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
                slot = slot_of(ix, iy, res, res)
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
    portals = 0
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
        # Captured BEFORE the apertures are opened -- `open_apertures()` deletes these objects,
        # and the portal has to sit in the hole they leave.
        pbounds = glazing_bounds(RV.find_glazing()) if a.portals else []
        removed, _ = RV.open_apertures()
        portals = add_portals(pbounds) if a.portals else 0
        sky_info = S.setup_world_sky_from_three_direction(
            tuple(directional[0]["travel"]), sun_disc=a.with_sun_disc
        )
    elif a.pass_ == "visibility":
        # Order matters and is load-bearing: open the apertures BEFORE whitening, or the
        # whitened glazing seals the room and every baked texel is zero.
        RV.make_visibility_world()
        pbounds = glazing_bounds(RV.find_glazing()) if a.portals else []
        removed, _ = RV.open_apertures()
        portals = add_portals(pbounds) if a.portals else 0
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

    # Before the bake mutates materials (visibility whitens them), so the census reads the real
    # albedos rather than the whitened stand-ins.
    room_rho = []
    if a.room_albedo:
        rooms = (manifest or {}).get("rooms") or []
        if not rooms:
            raise ValueError("--room-albedo needs `rooms` in the manifest; re-export with a probe "
                             "new enough to write them (v0.31.7.123+)")
        # BOTH probes, so the difference between "what the ceiling sees" and "what the room sees"
        # is a measured number rather than an assumption. The downward one is cheap and the
        # spherical one is the quantity that scales interreflected fill.
        down = room_albedo(rooms, samples=24, dirs=1)
        sphere = room_albedo(rooms, samples=12, dirs=48)
        # The AREA-weighted, occlusion-corrected one is what goes in the index: `v0.31.7.124`
        # established it is the average enclosure radiosity actually asks for. The other two are
        # printed alongside so the three stay comparable in one run.
        room_rho = room_albedo_area(rooms)
        print("ROOM_ALBEDO_DOWN " + json.dumps(down))
        print("ROOM_ALBEDO_SPHERE " + json.dumps(sphere))
        print("ROOM_ALBEDO " + json.dumps(room_rho))

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
                bake_margin=a.bake_margin,
                fill_holes=a.fill_holes,
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
        "portals": portals,
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
        # One exposure-weighted rho per room, when asked for. The app's fill can multiply by this
        # without doing any visibility work of its own -- see `src/scene/lighting/albedoFill.ts`.
        **({"rooms": room_rho} if room_rho else {}),
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
