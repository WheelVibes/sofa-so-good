"""Render the physical sky as an equirectangular map the app can use directly.

    blender --background --factory-startup \
      --python python/scripts/blender/render_equirect.py -- \
      --dir /tmp/mb --out /tmp/mb/sky.png --res 1024x512

**Why this exists.** The app paints its own sky equirect on a canvas: a
1024x512 2:1 image built from THREE LINEAR GRADIENT STOPS plus a hand-drawn haze
band (`src/scene/backdropEquirect.ts`). It has no atmospheric scattering, no sun
glow and no correct colour-versus-sun-angle beyond those stops -- and it is the
term item (l) measures as **27 % too dark** (1.368x, cv 0.63 % across four
views), because the window's p99 IS `scene.background` seen through the pane.

Cycles places `MULTIPLE_SCATTERING` sky from the app's own sun vector, which is
what makes the reference physical rather than calibrated against the thing under
test. Rendering that to the same 2:1 slot needs no new runtime machinery: the
generator's docstring says it was "shaped to be swapped for real CC0
equirectangular photos later (same background slot)", and a render placed from
the app's sun is strictly better than a photo because it is *consistent with the
scene's own lighting*.

No geometry is imported. A pure sky is the apples-to-apples replacement for the
`sky` preset; the photo presets (city/dusk/park/hills) would additionally want
distant blocks or a treeline, which is a later step and the same camera.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cli_argv  # noqa: E402
import sofa_scene as S  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="render_equirect.py")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--dir", help="a BLENDREF directory (reads the sun from its manifest)")
    src.add_argument("--sun-dir", help="sun TRAVEL vector x,y,z in THREE (Y-up) space")
    p.add_argument("--out", required=True, help="output PNG path")
    p.add_argument("--res", default="1024x512",
                   help="WxH; 2:1 for equirectangular. Default matches the app's "
                        "SKY_EQUIRECT_W/H so it is a drop-in for the canvas version.")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--device", default="CPU", choices=("CPU", "GPU"))
    p.add_argument("--sun-disc", action="store_true",
                   help="keep the sun DISC in the map. Off by default: the app draws its own "
                        "sun and a disc baked into the background would double it, and a "
                        "~10^5 nit disc in an LDR PNG clips to white anyway.")
    p.add_argument("--json", action="store_true")
    return p.parse_args(cli_argv.normalise(p, argv))


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    if a.dir:
        with open(os.path.join(os.path.abspath(a.dir), "manifest.json")) as fh:
            manifest = json.load(fh)
        directional = manifest.get("lights", {}).get("directional") or []
        if not directional:
            raise ValueError("no directional light in the manifest to place the sun from")
        travel = tuple(directional[0]["travel"])
    else:
        parts = [float(v) for v in a.sun_dir.split(",")]
        if len(parts) != 3:
            raise ValueError(f"--sun-dir wants x,y,z -- got {a.sun_dir!r}")
        travel = (parts[0], parts[1], parts[2])

    w, h = (int(v) for v in a.res.lower().split("x"))
    S.reset_scene()
    S.setup_cycles(samples=a.samples, res=(w, h), device=a.device)
    sky = S.setup_world_sky_from_three_direction(travel, sun_disc=a.sun_disc)

    # An EQUIRECTANGULAR panoramic camera at the origin sees the whole world
    # sphere, so the render IS the environment map -- no projection maths of ours
    # to get wrong, which is the same reason the reference renders read their pose
    # from the manifest rather than retyping it.
    cam_data = bpy.data.cameras.new("equirect")
    cam_data.type = "PANO"
    cam_data.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("equirect", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    # Blender's equirect camera looks along -Y with +Z up; three's equirectangular
    # background mapping expects +Y up. Rotating the camera upright is what makes
    # the horizon land on the image's horizontal centre line.
    cam.rotation_euler = (1.5707963267948966, 0.0, 0.0)

    S.render_png(a.out)
    result = {
        "ok": True,
        "out": a.out,
        "res": [w, h],
        "samples": a.samples,
        "sun_disc": bool(a.sun_disc),
        "sky": sky,
        "device": S.device_report(),
        "bytes": os.path.getsize(a.out),
    }
    if a.json:
        print(f"RENDER_EQUIRECT {json.dumps(result)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
