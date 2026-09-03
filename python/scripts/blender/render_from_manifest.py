"""Render the matched-pose Cycles reference straight from a `BLENDREF` manifest.

    blender --background --factory-startup \
      --python python/scripts/blender/render_from_manifest.py -- \
      --dir /tmp/bref --samples 64

`light-distribution.mjs BLENDREF=<dir>` writes `<dir>/manifest.json` + `scene.glb` + the
app's own raster from one pose. This turns that directory into the physical reference for
the same pose, in one command.

**Why this exists rather than a documented `render_still.py` invocation.** Every reference
in the graphics arc so far was assembled by hand from the manifest's numbers — camera
position, look-at target, vertical FOV, and the sun's travel vector, each needing a
different flag and the right frame. That is four chances to mis-transcribe a pose, and a
mis-transcribed pose is the single most expensive error class in this arc: `v0.31.6.4` and
`v0.31.6.9` both lost a round to framing that looked fine and was not. The manifest is the
authority, so the pose should be *read*, never retyped.

It also makes a second reference cheap, which is the point — every conclusion drawn against
`bedroom3` at 13:00 is an n = 1 claim until another room agrees.

Deliberately thin: it resolves the flags and calls `render_still.main()`, so there is one
implementation of scene construction (the goal's "don't fork logic" constraint). Anything
this script cannot express is a missing `render_still.py` flag, not a reason to duplicate.

The GLB is passed through `glb_fix.strip_noop_dispersion()` first — Blender 5.2.1's importer
creates the dispersion settings node only when `dispersion != 0` but reads it whenever the
extension is present, and three's exporter writes an empty `KHR_materials_dispersion` for
glass, so 4 glass materials out of 897 will otherwise block the whole import.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cli_argv  # noqa: E402
import glb_fix  # noqa: E402
import render_still  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="render_from_manifest.py")
    p.add_argument("--dir", required=True, help="a BLENDREF directory (manifest.json + scene.glb)")
    p.add_argument("--out", default=None, help="output PNG (default <dir>/cyc.png)")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--res", default=None,
                   help="WxH; default matches the manifest's aspect at 800 wide, so the "
                        "reference and the app raster frame the same scene region")
    p.add_argument("--sun-energy", type=float, default=None,
                   help="override the physical sky's sun; omit to let --sky place it")
    p.add_argument("--view-transform", default=None,
                   help="passthrough to render_still.py; omit to keep AgX, which is what the app "
                        "uses. Set BOTH sides to a low-shoulder transform (the app's TONE=neutral "
                        "pairs with 'Khronos PBR Neutral') when a RATIO matters -- v0.31.7.171 "
                        "measured the same gap as 116/146 counts there against 33/79 under AgX.")
    p.add_argument("--json", action="store_true")
    return p.parse_args(cli_argv.normalise(p, argv))


def flags_for(manifest: dict, d: str, args: argparse.Namespace) -> list[str]:
    """Translate a manifest into `render_still.py` flags.

    Every value comes from the manifest; nothing here is a remembered constant.
    """
    cam = manifest["camera"]
    lights = manifest["lights"]
    glb = os.path.join(d, manifest.get("glb", "scene.glb"))
    fixed, stripped = glb_fix.strip_noop_dispersion(glb)
    if stripped:
        print(f"  glb_fix: stripped {stripped} no-op KHR_materials_dispersion blocks")

    aspect = cam.get("aspect") or 16 / 9
    if args.res:
        res = args.res
    else:
        w = 800
        res = f"{w}x{int(round(w / aspect))}"

    out = args.out or os.path.join(d, "cyc.png")
    # `--flag=value` for every VECTOR flag, not `--flag value`. A coordinate or a sun
    # component can be negative, and argparse treats a value whose first character is `-`
    # as another option, failing with "expected one argument". Passing argv as a LIST does
    # not avoid it -- the rule is about the value's first character, not shell quoting,
    # which is why this bit again here after being recorded once already.
    vec = lambda xs: ",".join(str(v) for v in xs)  # noqa: E731
    flags = [
        "--scene", fixed,
        "--out", out,
        "--res", res,
        "--samples", str(args.samples),
        # three's PerspectiveCamera.fov is VERTICAL; Blender's AUTO sensor fit would
        # measure the LARGER axis instead, which at 16:9 turns 50 deg into ~78 deg.
        "--fov", str(cam["fovVerticalDeg"]),
        "--fov-axis", "vertical",
        f"--cam-pos={vec(cam['position'])}",
        # Not defaulted by render_still.py on purpose: an unstated frame silently
        # misplaces the camera. The manifest states it, so pass it through.
        "--cam-space", cam.get("space", "three"),
        f"--cam-target={vec(cam['target'])}",
    ]

    # The physical atmospheric sky, placed by the app's own sun vector, is what makes this
    # an absolute reference rather than something calibrated to the app (v0.31.6.6). The
    # manifest records lights as TRAVEL direction vectors in three space, which is exactly
    # what --sun-dir wants -- no unit conversion, unlike the app's radian sun angles.
    directional = lights.get("directional") or []
    if directional:
        flags += ["--sky", f"--sun-dir={vec(directional[0]['travel'])}"]
    else:
        print("  NOTE: manifest has no directional light -- rendering without a sun")
    if args.sun_energy is not None:
        flags += ["--sun-energy", str(args.sun_energy)]
    if args.view_transform:
        flags += ["--view-transform", args.view_transform]
    return flags


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    d = os.path.abspath(args.dir)
    with open(os.path.join(d, "manifest.json")) as fh:
        manifest = json.load(fh)
    flags = flags_for(manifest, d, args)
    print(f"  render_still {' '.join(flags)}")
    rc = render_still.main(flags)
    if args.json:
        print(json.dumps({"dir": d, "flags": flags, "rc": rc}))
    return rc


if __name__ == "__main__":
    sys.exit(main() or 0)
