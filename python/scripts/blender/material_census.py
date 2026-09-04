"""Dump the MATERIAL a given surface actually got after a GLB round-trip.

    blender --background --factory-startup \
      --python python/scripts/blender/material_census.py -- \
      --glb /tmp/z7glb13/scene.glb --near 8.24,0,4.1

**Why this exists (item `(z7)`).** The app's floor renders ~20 % darker than a Cycles reference
built from a three-EXPORTED GLB, with matching chroma but twice the contrast (patch sd 23.3 against
12.9). That signature is equally consistent with two opposite faults: the APP under-lighting its
floor, or the EXPORT dropping/mis-tagging a texture so the REFERENCE is wrong. Guessing costs a
round either way, and `v0.31.7.262` is a fresh reminder of what a confident wrong attribution
costs. So the census is taken on both sides of the export and compared: `ray-probe MAT=1` reads the
live three material, this reads what Blender received.

`--near` takes a point in THREE coordinates — the same frame every probe in this arc quotes, so a
position can be copied straight from `ray-probe` output without a hand conversion. The mesh whose
nearest VERTEX is closest to it wins; GLB meshes out of three carry no useful names, so a position
is the only stable handle.

Reports, per image node: the socket it feeds, its resolution, and its **colorspace** — which is the
single most likely way this defect is an export artefact. A base-colour texture imported as
`Non-Color` skips the sRGB→linear decode, leaving midtones too HIGH, and a reference too bright is
exactly what was measured.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cli_argv  # noqa: E402
import glb_fix  # noqa: E402
import sofa_scene as S  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    # Blender consumes its own argv, so the script's arguments are whatever follows the bare `--`.
    # Same resolution as `render_still.py`; `normalise` needs a real list, not None.
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--glb", required=True)
    p.add_argument("--near", required=True,
                   help="point in THREE (Y-up) coords, x,y,z — the mesh nearest this is reported")
    p.add_argument("--json", action="store_true")
    return p.parse_args(cli_argv.normalise(p, argv))


def _image_records(mat) -> list[dict]:
    """Every image node in the material, with what it feeds and how it is tagged."""
    out = []
    if not mat or not mat.use_nodes:
        return out
    for node in mat.node_tree.nodes:
        if node.type != "TEX_IMAGE" or node.image is None:
            continue
        # Downstream walk, not a single hop. Blender's glTF importer inserts MIX and MATH nodes
        # between an image and the BSDF, so a direct-links-only scan reported `feeds: []` for a
        # texture that was plainly connected -- a census that cannot see the connection is worse
        # than none, because it reads as "map missing".
        feeds = []
        seen_nodes = set()
        frontier = [node]
        while frontier:
            cur = frontier.pop()
            for link in mat.node_tree.links:
                # NAME comparison, not `is`. bpy returns a FRESH Python wrapper on every
                # `link.from_node` access, so identity comparison is always false and the walk
                # silently found nothing -- which read as "texture not connected" for a texture
                # that was connected. Same trap as the `??`-vs-`||` blank names in `ray-probe`:
                # the bug produced a plausible answer rather than an error.
                if link.from_node.name != cur.name:
                    continue
                tn = link.to_node
                if tn.type == "BSDF_PRINCIPLED":
                    feeds.append(link.to_socket.name)
                elif tn.name not in seen_nodes:
                    seen_nodes.add(tn.name)
                    frontier.append(tn)
        # The Mapping node's scale is where a tiling difference hides: three tiles by
        # world-metre UVs times `repeat`, a GLB carries baked UVs plus KHR_texture_transform.
        scale = None
        for link in mat.node_tree.links:
            if link.to_node.name == node.name and link.from_node.type == "MAPPING":
                sc = link.from_node.inputs.get("Scale")
                if sc is not None:
                    scale = [round(v, 5) for v in sc.default_value]
        out.append({
            "image": node.image.name,
            "size": list(node.image.size),
            "colorspace": node.image.colorspace_settings.name,
            "feeds": feeds,
            "mapping_scale": scale,
        })
    return out


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    S.reset_scene()
    fixed, stripped = glb_fix.strip_noop_dispersion(a.glb)
    if stripped:
        print(f"  glb_fix: stripped {stripped} no-op KHR_materials_dispersion blocks")
    bpy.ops.import_scene.gltf(filepath=fixed)

    tx, ty, tz = (float(v) for v in a.near.split(","))
    target = S.three_to_blender((tx, ty, tz))

    tv = Vector(target)
    best: list[tuple[float, object]] = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.vertices:
            continue
        mw = obj.matrix_world
        # Bounding-box pre-filter: this runs over ~1288 meshes, and walking every vertex of all
        # of them is minutes of pointless work when the box already rules an object out.
        corners = [mw @ Vector(c) for c in obj.bound_box]
        lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
        hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
        clamped = Vector((
            min(max(tv.x, lo.x), hi.x),
            min(max(tv.y, lo.y), hi.y),
            min(max(tv.z, lo.z), hi.z),
        ))
        if best and (clamped - tv).length > best[0][0]:
            continue
        # SURFACE distance, not vertex distance. A floor is a 4-vertex quad several metres wide, so
        # its nearest vertex can be metres from a point lying exactly ON it -- the first run of this
        # script picked a 2148-vertex furniture mesh over the plane the probe had actually hit.
        ok, loc, _nrm, _idx = obj.closest_point_on_mesh(mw.inverted() @ tv)
        if not ok:
            continue
        d = ((mw @ loc) - tv).length
        best.append((d, obj))

    if not best:
        print("MATERIAL_CENSUS " + json.dumps({"ok": False, "error": "no meshes"}))
        return 1

    best.sort(key=lambda t: t[0])
    # The runners-up are printed too: "which mesh is at this point" is exactly the question the
    # first version got wrong silently, and a second candidate 1 mm behind the first is the shape
    # of a coincident-surface problem worth seeing rather than resolving arbitrarily.
    print("  candidates: " + ", ".join(
        f"{o.name}@{d:.3f}m/{len(o.data.vertices)}v" for d, o in best[:4]))
    dist, obj = best[0]
    slots = []
    for slot in obj.material_slots:
        m = slot.material
        if m is None:
            continue
        rec = {"name": m.name, "images": _image_records(m)}
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) \
            if m.use_nodes else None
        if bsdf is not None:
            for key in ("Base Color", "Roughness", "Metallic"):
                sock = bsdf.inputs.get(key)
                if sock is None:
                    continue
                if sock.is_linked:
                    rec[key] = f"<linked:{sock.links[0].from_node.type}>"
                else:
                    val = sock.default_value
                    rec[key] = [round(v, 4) for v in val] if hasattr(val, "__len__") \
                        else round(float(val), 4)
        slots.append(rec)

    print("MATERIAL_CENSUS " + json.dumps({
        "ok": True,
        "mesh": obj.name,
        "vertex_distance_m": round(dist, 4),
        "verts": len(obj.data.vertices),
        "uv_layers": [l.name for l in obj.data.uv_layers],
        "materials": slots,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
