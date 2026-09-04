"""Measure the LINEAR -> DISPLAY transfer curve of each OCIO view transform, directly.

    blender --background --factory-startup \
      --python python/scripts/blender/calibrate_transfer.py -- \
      --out /tmp/cal --transforms Standard,AgX,"Khronos PBR Neutral" \
      --values 0.005,0.01,0.02,0.05,0.1,0.2,0.5,1,2,5

Why this exists, and why it is a MEASUREMENT and not a formula. The GI ceiling thread reached an
impasse at a ~13x gap between prediction (0.885) and measurement (~0.065) with every other
candidate eliminated by experiment: bake ratio, albedo, bounce depth, the app's direct term,
`visGain`, bilinear/holes, exposure, shader injection, metalness and patch placement. The one
quantity never validated end-to-end is the step that turns a REFERENCE RENDER'S DISPLAY COUNTS
back into linear radiance so it can be compared with the app -- my Khronos->linear inversion,
which was an analytic guess at a curve I never sampled. `v0.31.7.186`'s "equality gains" were
already retracted in `.189` for interpolating a gain through display space, which is the same
mistake in a different place.

The design keeps it impossible to misread. Each sample is a FULL-FRAME flat emission at a known
linear radiance, rendered on its own: no geometry to aim at, no patch rectangle to place, no
falloff, no bounce, no albedo. The image mean IS the transferred value. Emission is noiseless, so
16 samples suffice. `Standard` is plain sRGB and exactly invertible, so it doubles as a check that
the harness itself is sound -- if `Standard` does not reproduce the sRGB OETF to within a count,
nothing else printed here can be trusted, and the script says so rather than leaving it to the
reader.

Output is one JSON file plus a printed table, so the numbers can be pasted into a docstring
without being retyped (this arc has already published a mis-transcribed figure).
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import cli_argv  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="calibrate_transfer.py")
    p.add_argument("--out", required=True, help="output DIRECTORY for the PNGs + curve.json")
    p.add_argument(
        "--transforms",
        default="Standard,AgX,Khronos PBR Neutral",
        help="comma-separated OCIO view transform names",
    )
    p.add_argument(
        "--values",
        default="0.005,0.01,0.02,0.05,0.1,0.2,0.5,1,2,5",
        help="comma-separated LINEAR radiance values to sample",
    )
    p.add_argument("--res", type=int, default=64, help="square render size (flat frames)")
    p.add_argument("--samples", type=int, default=16)
    p.add_argument("--exposure", type=float, default=0.0, help="view_settings.exposure, in STOPS")
    p.add_argument(
        "--depth",
        default="8",
        choices=["8", "16"],
        help="PNG bit depth. Use 16 to check whether a deep-toe reading is quantisation: at "
        "linear 0.002 Khronos lands on 0.14 of 255, i.e. BELOW one 8-bit count, so the 8-bit "
        "mean there is a count-0/count-1 dither ratio and not a measurement of the curve.",
    )
    return p.parse_args(cli_argv.normalise(p, argv))


def srgb_oetf(x: float) -> float:
    """Linear -> sRGB display, 0..1. The exact curve `Standard` should reproduce."""
    if x <= 0.0031308:
        return 12.92 * x
    return 1.055 * (x ** (1.0 / 2.4)) - 0.055


def build_flat_scene() -> bpy.types.Object:
    """An empty world and one emissive plane filling the camera. Returns the emission node."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    # No world light at all: the only radiance in the frame must be the emission being measured.
    world = bpy.data.worlds.new("black")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[1].default_value = 0.0
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=100.0, location=(0.0, 0.0, 0.0))
    plane = bpy.context.active_object
    mat = bpy.data.materials.new("emit")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    plane.data.materials.append(mat)

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    # Straight down at the plane from close range: the plane is 100 m across, so the frame is
    # entirely emission with no edge in view at any sane focal length.
    cam.location = (0.0, 0.0, 2.0)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    scene.camera = cam
    return emit


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    transforms = [t.strip() for t in a.transforms.split(",") if t.strip()]
    values = [float(v) for v in a.values.split(",") if v.strip()]

    emit = build_flat_scene()
    scene = bpy.context.scene
    scene.render.resolution_x = a.res
    scene.render.resolution_y = a.res
    scene.render.resolution_percentage = 100
    scene.cycles.samples = a.samples
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = a.depth
    scene.view_settings.exposure = a.exposure
    scene.view_settings.look = "None"

    # Availability is checked by ASSIGNING, not by reading `bl_rna` enum_items: `view_transform`
    # is populated from the OCIO config at runtime, so the RNA introspection reports only a
    # placeholder (it came back as `['None']` on Blender 5.2.1 and rejected every real name).
    missing = []
    for t in transforms:
        try:
            scene.view_settings.view_transform = t
        except TypeError:
            missing.append(t)
    if missing:
        raise SystemExit(f"view transform(s) not available in this Blender: {missing}")

    curve: dict[str, list[dict[str, float]]] = {}
    for tname in transforms:
        scene.view_settings.view_transform = tname
        rows = []
        for v in values:
            emit.inputs["Strength"].default_value = v
            png = os.path.join(a.out, f"{tname.replace(' ', '_')}_{v}.png")
            scene.render.filepath = png
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(png)
            px = list(img.pixels)
            n = len(px) // 4
            mean01 = sum(px[i * 4] for i in range(n)) / max(n, 1)
            bpy.data.images.remove(img)
            # THE READ-BACK PATH DEPENDS ON BIT DEPTH, and getting this wrong silently rescales
            # every number here. Measured on Blender 5.2.1: an 8-bit PNG comes back through
            # `img.pixels` DISPLAY-REFERRED (Standard reproduces the sRGB OETF to 0.08 counts),
            # while a 16-bit PNG comes back SCENE-LINEAR (Standard's ratio is exactly 1.000, i.e.
            # counts = linear x 255). The harness check caught the 16-bit case as a 50-count
            # deviation rather than letting it publish. Encoding the linear read back to display
            # makes the two paths comparable, and they then agree to 0.01 counts -- Khronos at
            # linear 0.05 reads display01 0.1328 one way and 4.05/255 the other, whose sRGB
            # decode is 4.06. That agreement is what makes the toe below a measurement of the
            # CURVE rather than of 8-bit quantisation.
            if a.depth == "16":
                mean01 = srgb_oetf(mean01)
            rows.append(
                {"linear": v, "display01": round(mean01, 6), "counts": round(mean01 * 255.0, 2)}
            )
        curve[tname] = rows

    # HARNESS CHECK, printed before anything else is believed: `Standard` is plain sRGB and must
    # reproduce the OETF. If it does not, the read-back path is wrong and every other row here is
    # meaningless -- say so loudly rather than publishing a curve nobody validated.
    verdict = "not run (Standard not sampled)"
    if "Standard" in curve:
        worst = 0.0
        for row in curve["Standard"]:
            expect = min(1.0, srgb_oetf(min(1.0, row["linear"])))
            worst = max(worst, abs(expect * 255.0 - row["counts"]))
        verdict = f"worst deviation from the sRGB OETF: {worst:.2f} counts"
        if worst > 1.5:
            verdict += "  <-- HARNESS SUSPECT, do not trust the other transforms"
    print(f"  harness check: {verdict}")

    for tname, rows in curve.items():
        print(f"\n  {tname}")
        print(f"    {'linear':>10}  {'counts':>8}  {'ratio':>8}")
        for row in rows:
            ratio = row["counts"] / (row["linear"] * 255.0) if row["linear"] > 0 else float("nan")
            print(f"    {row['linear']:>10.4f}  {row['counts']:>8.2f}  {ratio:>8.3f}")

    out_json = os.path.join(a.out, "curve.json")
    with open(out_json, "w") as fh:
        json.dump(
            {"exposure_stops": a.exposure, "harness_check": verdict, "curve": curve}, fh, indent=2
        )
    print(f"\n  wrote {out_json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
