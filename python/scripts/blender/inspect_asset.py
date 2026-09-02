"""Turntable QA for a single GLB — Part B of the Blender integration.

Renders N views around an asset so a model can be eyeballed from every side
without opening Blender. Frames itself from the asset's own bounds, so it works
on anything from a tea set to a pool table with no per-asset tuning.

    blender --background --factory-startup \
      --python python/scripts/blender/inspect_asset.py -- \
      --glb public/assets/furniture/tea-set-low.glb \
      --out /tmp/tea-set --views 4 --samples 32

Note the bare `--`: Blender consumes its own argv, and everything after `--` is
passed through to the script. Without it Blender tries to parse `--glb` itself.

Studio-lit from a three-point rig rather than an HDRI, because asset QA wants
consistent, neutral light that is identical between runs — an HDRI would make two
inspections of the same asset differ if the environment changed.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sofa_scene as S  # noqa: E402


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="inspect_asset.py")
    p.add_argument("--glb", required=True, help="GLB to inspect")
    p.add_argument("--out", required=True, help="output directory or file prefix")
    p.add_argument("--views", type=int, default=4, help="views around the turntable")
    p.add_argument("--samples", type=int, default=32, help="Cycles samples per view")
    p.add_argument("--res", default="800x600", help="WxH")
    p.add_argument("--elevation", type=float, default=20.0, help="camera elevation degrees")
    return p.parse_args(argv)


def add_studio_rig(centre, radius: float) -> None:
    """A neutral three-point rig scaled to the asset, so QA renders are comparable."""
    cx, cy, cz = centre
    d = radius * 4
    for name, offset, energy in (
        ("key", (d, -d, d * 0.9), 900.0),
        ("fill", (-d, -d * 0.6, d * 0.5), 300.0),
        ("rim", (0.0, d, d * 0.8), 400.0),
    ):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy * max(radius, 0.1) ** 2
        data.size = radius * 2
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = (cx + offset[0], cy + offset[1], cz + offset[2])
        con = obj.constraints.new("TRACK_TO")
        target = bpy.data.objects.new(f"{name}_target", None)
        bpy.context.collection.objects.link(target)
        target.location = centre
        con.target = target
        con.track_axis = "TRACK_NEGATIVE_Z"


def main() -> int:
    a = parse_args()
    w, h = (int(v) for v in a.res.lower().split("x"))

    S.reset_scene()
    objs = S.import_glb(a.glb)
    if not any(o.type == "MESH" for o in objs):
        print(f"INSPECT_ASSET error: no mesh objects in {a.glb}", file=sys.stderr)
        return 2

    centre, radius = S.scene_bounds()
    S.setup_cycles(samples=a.samples, res=(w, h))
    add_studio_rig(centre, radius)

    # Neutral mid-grey world so the asset is not lit purely from the rig — pure
    # black would crush every shadow side to zero and hide geometry problems,
    # which is the opposite of what QA wants.
    world = bpy.data.worlds.new("qa") if not bpy.data.worlds else bpy.data.worlds[0]
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.18, 0.18, 0.18, 1.0)
        bg.inputs["Strength"].default_value = 1.0

    outdir = a.out if os.path.isdir(a.out) or a.out.endswith("/") else a.out
    os.makedirs(outdir, exist_ok=True)

    dist = radius * 3.2
    el = math.radians(a.elevation)
    written = []
    for i in range(a.views):
        az = math.radians(360.0 * i / a.views)
        loc = (
            centre[0] + dist * math.cos(el) * math.sin(az),
            centre[1] - dist * math.cos(el) * math.cos(az),
            centre[2] + dist * math.sin(el),
        )
        S.place_camera(loc, look_at=centre, fov_deg=40.0)
        path = os.path.join(outdir, f"view_{i:02d}.png")
        S.render_png(path)
        written.append(path)

    print(f"INSPECT_ASSET ok bpy={S.blender_version()} radius={radius:.3f} views={written}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
