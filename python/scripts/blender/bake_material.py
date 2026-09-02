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
import glb_fix  # noqa: E402
import render_visibility as RV  # noqa: E402
import sofa_scene as S  # noqa: E402

PASSES = ("visibility", "ao", "diffuse", "combined")


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
    p.add_argument("--samples", type=int, default=64)
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
    p.add_argument("--json", action="store_true")
    return p.parse_args(argv)


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
    coords = [v.co for v in mesh.vertices]
    mn = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
    mx = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
    size = Vector((max(mx[i] - mn[i], 1e-6) for i in range(3)))
    for poly in mesh.polygons:
        n = poly.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        row = 0 if n[axis] >= 0 else 1
        col = axis
        if interior is not None and interior.get(poly.index):
            interior_slots.add((col, row))
        o1, o2 = (i for i in range(3) if i != axis)
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            a = (co[o1] - mn[o1]) / size[o1]
            b = (co[o2] - mn[o2]) / size[o2]
            u = (col + margin + a * (1 - 2 * margin)) / 3.0
            v = (row + margin + b * (1 - 2 * margin)) / 2.0
            uv.data[li].uv = (u, v)
    mesh.uv_layers.active = uv
    return interior_slots


def bake_object(
    obj: bpy.types.Object,
    out_path: str,
    res: int,
    bake_type: str,
    interior_slots: set[tuple[int, int]] | None = None,
) -> dict:
    """Bake one object to its own image. Per-object rather than an atlas.

    An atlas would need a packed UV layout, which would break the requirement above that the
    map be addressable by the app's own mesh UVs.
    """
    img = bpy.data.images.new(f"bake_{obj.name}", width=res, height=res, float_buffer=False)
    mat = obj.data.materials[0]
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type=bake_type, use_clear=True, margin=2)

    img.filepath_raw = out_path
    img.file_format = "PNG"
    img.save()
    px = list(img.pixels)
    reds = px[0::4]
    stats = {
        "min": round(min(reds), 4),
        "max": round(max(reds), 4),
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
        glb = os.path.abspath(a.scene)
        out_dir = a.out_dir or os.path.join(os.path.dirname(glb), "bake")
    os.makedirs(out_dir, exist_ok=True)

    fixed, stripped = glb_fix.strip_noop_dispersion(glb)
    S.reset_scene()
    S.import_glb(fixed)
    S.setup_cycles(samples=a.samples, res=(64, 64))

    removed = 0
    if a.pass_ == "visibility":
        # Order matters and is load-bearing: open the apertures BEFORE whitening, or the
        # whitened glazing seals the room and every baked texel is zero.
        RV.make_visibility_world()
        removed, _ = RV.open_apertures()
        RV.whiten_all_materials(a.albedo)

    bake_type = {
        "visibility": "DIFFUSE",
        "diffuse": "DIFFUSE",
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

    candidates = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        area = mesh_area(obj)
        if area >= a.min_area:
            candidates.append((area, obj))
    candidates.sort(key=lambda t: -t[0])
    selected = candidates[: a.limit]

    baked = []
    for area, obj in selected:
        if not obj.data.materials:
            continue
        if a.uv == "box":
            interior = classify_faces(obj)
            interior_slots = make_box_uvs(obj, interior)
            uv_name = BAKE_UV
        else:
            interior_slots = None
            uv_name = obj.data.uv_layers.active.name
        out = os.path.join(out_dir, f"{obj.name}.png")
        try:
            stats = bake_object(obj, out, a.res, bake_type, interior_slots)
        except RuntimeError as exc:  # noqa: PERF203 — one bad mesh must not lose the batch
            baked.append({"object": obj.name, "area": round(area, 2), "error": str(exc)[:120]})
            continue
        baked.append(
            {
                "object": obj.name,
                "area": round(area, 2),
                "out": out,
                "uv": uv_name,
                "interior_slots": sorted(interior_slots) if interior_slots else [],
                **stats,
            }
        )

    result = {
        "ok": True,
        "pass": a.pass_,
        "bake_type": bake_type,
        "out_dir": out_dir,
        "res": a.res,
        "uv_mode": a.uv,
        "albedo": a.albedo,
        "samples": a.samples,
        "glazing_removed": removed,
        "dispersion_stripped": stripped,
        "candidates_over_min_area": len(candidates),
        "baked": len(baked),
        "objects": baked,
    }
    print("BAKE_MATERIAL " + json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
