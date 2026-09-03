"""Photoreal still of a scene GLB — Part B, and the module Part A's service calls.

    blender --background --factory-startup \
      --python python/scripts/blender/render_still.py -- \
      --scene /tmp/scene.glb --hdri kloppenheim_06_puresky \
      --out /tmp/still.png --samples 64 --res 1280x720

`--hdri` takes a catalog id, a path to an `.hdr`/`.exr`, or `procedural` for a generated
gradient sky that needs no network (see `hdri.py`). Which route was taken is printed, so a
silent fallback to the procedural sky is visible rather than looking like a real HDRI.

Camera: `--cam-pos` and `--cam-target` in metres, matching the app's world axes (glTF
+Y up, which is what `src/export/sceneGltf.ts` writes). With neither given, the camera is
framed from the scene's own bounds so the script is still useful on an unknown GLB.

Part A must call `main()`/these helpers rather than re-implementing any of it — the goal's
"don't fork logic" constraint. The service's only extra job is process management
(debounce, supersede, availability), not scene construction.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cli_argv  # noqa: E402
import hdri  # noqa: E402
import sofa_scene as S  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="render_still.py")
    p.add_argument("--scene", required=True, help="GLB to render")
    p.add_argument("--out", required=True, help="output PNG path")
    p.add_argument("--hdri", default="procedural", help="catalog id, path, or 'procedural'")
    p.add_argument("--sky", action="store_true",
                   help="light with the PHYSICAL atmospheric sky placed by --sun-dir, instead "
                        "of an HDRI. Makes the render an absolute reference rather than "
                        "something calibrated to the app. Requires --sun-dir.")
    p.add_argument("--hdri-strength", type=float, default=1.0)
    p.add_argument("--hdri-rotation", type=float, default=0.0, help="degrees")
    p.add_argument("--seed", type=int, default=None,
                   help="Cycles sampling seed. Two renders differing ONLY in seed differ only "
                        "by noise, which is the control for any did-this-change-the-image "
                        "question such as a device switch. Mirrors bake_material.py --seed.")
    p.add_argument("--device", default="CPU", choices=("CPU", "GPU"),
                   help="Cycles compute device. GPU also enables the backend in add-on "
                        "preferences (factory-startup leaves it at NONE, which silently "
                        "falls back to CPU). Metal measured 2.6x faster than CPU once its "
                        "kernel cache is warm; the FIRST GPU render on a machine pays ~100 s "
                        "of one-time kernel compilation.")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--res", default="1280x720", help="WxH")
    p.add_argument("--fov", type=float, default=50.0, help="FOV degrees (see --fov-axis)")
    p.add_argument("--fov-axis", default="vertical", choices=("vertical", "horizontal"),
                   help="which axis --fov measures; three.js PerspectiveCamera.fov is VERTICAL")
    p.add_argument("--cam-pos", default=None, help="x,y,z metres")
    p.add_argument("--cam-space", default=None, choices=("three", "blender"),
                   help="REQUIRED with --cam-pos: which frame the coords are in. "
                        "three = Y-up (the app/glTF); blender = Z-up. Not defaulted "
                        "on purpose -- an unstated frame silently misplaces the camera.")
    p.add_argument("--cam-target", default=None, help="x,y,z metres")
    p.add_argument("--sun-dir", default=None,
                   help="sun TRAVEL direction as x,y,z in THREE (Y-up) space — read straight "
                        "from the app's DirectionalLight. Preferred over --sun-elevation: a "
                        "vector in a named frame has no angle convention to get wrong.")
    p.add_argument("--sun-elevation", type=float, default=None, help="degrees; omit for no sun")
    p.add_argument("--sun-azimuth", type=float, default=0.0, help="degrees")
    p.add_argument("--sun-energy", type=float, default=3.0)
    p.add_argument("--no-network", action="store_true", help="never fetch an HDRI")
    p.add_argument("--json", action="store_true", help="emit a machine-readable result line")
    return p.parse_args(cli_argv.normalise(p, argv))


def _vec(s: str | None) -> tuple[float, float, float] | None:
    if not s:
        return None
    parts = [float(v) for v in s.split(",")]
    if len(parts) != 3:
        raise ValueError(f"expected x,y,z — got {s!r}")
    return (parts[0], parts[1], parts[2])


def render(a: argparse.Namespace) -> dict:
    t0 = time.time()
    w, h = (int(v) for v in a.res.lower().split("x"))

    S.reset_scene()
    objs = S.import_glb(a.scene)
    meshes = [o for o in objs if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"no mesh objects in {a.scene}")

    centre, radius = S.scene_bounds()
    S.setup_cycles(samples=a.samples, res=(w, h), device=a.device, seed=a.seed)

    sky_info = None
    if a.sky:
        if not a.sun_dir:
            raise ValueError("--sky requires --sun-dir (the app's DirectionalLight travel vector)")
        # The sky node carries the sun disc itself, so no separate lamp is added -- one
        # physical source beats a lamp whose energy would be a second invented parameter.
        sky_info = S.setup_world_sky_from_three_direction(
            _vec(a.sun_dir), strength=a.hdri_strength, sun_intensity=a.sun_energy
        )
        hdri_path, how = ("<physical sky>", "sky")
    else:
        hdri_path, how = hdri.resolve(a.hdri, allow_network=not a.no_network)
        S.setup_world_hdri(hdri_path, strength=a.hdri_strength, rotation_deg=a.hdri_rotation)
        if a.sun_dir:
            S.add_sun_from_three_direction(_vec(a.sun_dir), energy=a.sun_energy)
        elif a.sun_elevation is not None:
            S.add_sun(a.sun_elevation, a.sun_azimuth, energy=a.sun_energy)

    pos = _vec(a.cam_pos)
    target = _vec(a.cam_target)
    if pos is not None and a.cam_space is None:
        raise ValueError(
            "--cam-space is required with --cam-pos: 'three' (Y-up, the app/glTF) or "
            "'blender' (Z-up). Leaving it implicit is how a camera silently ends up in "
            "the wrong place while the geometry looks fine."
        )
    if pos is None:
        # Frame from bounds: back off along -Y and up (Blender space).
        d = radius * 3.0
        pos = (centre[0], centre[1] - d, centre[2] + d * 0.35)
        target = target or centre
        S.place_camera(pos, look_at=target, fov_deg=a.fov, fov_axis=a.fov_axis)
    elif a.cam_space == "three":
        S.place_camera_from_three(pos, target, fov_deg_vertical=a.fov)
    else:
        S.place_camera(pos, look_at=target or centre, fov_deg=a.fov, fov_axis=a.fov_axis)

    S.render_png(a.out)
    return {
        "ok": True,
        "out": a.out,
        "bytes": os.path.getsize(a.out) if os.path.exists(a.out) else 0,
        "hdri": os.path.basename(hdri_path),
        "hdri_route": how,
        "sky": sky_info,
        "bpy": list(S.blender_version()),
        "device": S.device_report(),
        "meshes": len(meshes),
        "radius": round(radius, 4),
        "samples": a.samples,
        "res": [w, h],
        "seconds": round(time.time() - t0, 2),
    }


def main(argv: list[str] | None = None) -> int:
    # `argv` so another script can drive this in-process rather than shelling out to a
    # second Blender (render_from_manifest.py) -- one implementation of scene
    # construction, which is the goal's "don't fork logic" constraint. Default None
    # keeps the CLI path reading Blender's own argv after the bare `--`.
    a = parse_args(argv)
    try:
        result = render(a)
    except Exception as exc:  # noqa: BLE001 — the service needs a parseable failure
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        print("RENDER_STILL " + json.dumps(result), file=sys.stderr)
        return 1
    print("RENDER_STILL " + json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
