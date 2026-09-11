"""AGX-PARITY, Blender half — push known linear values through the scene view transform.

Companion to `scripts/dev-probes/agx-parity.mjs`, which does the same for three's
`AgXToneMapping`. Between them they answer the first of the *Open experiments* in
`docs/skills/blender.md`: the whole graphics-realism arc compares an app screenshot
against a Cycles reference in displayed 8-bit counts, on the recorded assumption that
"both tone-map with AgX" — and the two are different implementations (Blender applies
the OCIO AgX config; three applies Filament's port, whose sigmoid is a 6th-order
polynomial approximation and whose look step is commented out).

**No render.** `Image.save_render()` applies the scene's colour management to a buffer
we supply, so the transfer function can be sampled directly: exact, instantaneous, and
free of the sampling noise, material translation and pose error a scene comparison would
fold into the answer. Cycles is not involved and neither is a camera.

Deliberately reads the probe values from the caller (`--values`, JSON) rather than
re-deriving them, so the two halves cannot silently drift onto different inputs — the
comparison script refuses to diff sets that do not match.

    blender --background --factory-startup \
      --python python/scripts/blender/agx_lut.py -- \
      --values /tmp/agx/three.json --out /tmp/agx/blender.json

`--view-transform` / `--look` / `--exposure` default to this build's own defaults (AgX,
None, 0.0) — which is the configuration every reference in the arc was rendered under,
and therefore the one the parity question is about.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cli_argv  # noqa: E402


def parse_args(argv: list[str] | None = None):
    import argparse

    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Sample the scene view transform at given linear values.")
    p.add_argument("--values", required=True,
                   help="path to a JSON file with a `values` array of [r,g,b] LINEAR triples "
                        "(the three-side probe output is accepted directly)")
    p.add_argument("--out", required=True, help="path to write the resulting JSON")
    p.add_argument("--view-transform", default=None,
                   help="override scene.view_settings.view_transform (default: leave the build's "
                        "own, which is AgX)")
    p.add_argument("--look", default=None, help="override scene.view_settings.look")
    p.add_argument("--exposure", type=float, default=None,
                   help="scene exposure in STOPS (default: leave 0.0)")
    p.add_argument("--verify-cycles", action="store_true",
                   help="ALSO render the same probe values as emissive planes through Cycles and "
                        "report where the two disagree. This is the check that licenses using the "
                        "no-render LUT to reason about rendered references: `save_render` and the "
                        "render pipeline are only ASSUMED to share a display transform until it "
                        "is measured.")
    # `cli_argv.normalise` so a negative `--exposure` works in both `--flag value` and
    # `--flag=value` form -- see the parser's own docstring for why this is not optional.
    return p.parse_args(cli_argv.normalise(p, argv))


def sample(values, view_transform=None, look=None, exposure=None):
    """Return the 8-bit sRGB counts the view transform maps each linear triple to."""
    scene = bpy.context.scene
    vs = scene.view_settings
    if view_transform:
        vs.view_transform = view_transform
    if look:
        vs.look = look
    if exposure is not None:
        vs.exposure = exposure

    n = len(values)
    # One row, one pixel per probe. A float buffer is REQUIRED: an 8-bit image cannot hold a
    # value above 1, and half the probe set is above 1 (a blown window is the interesting end).
    img = bpy.data.images.new("agx_probe", width=n, height=1, float_buffer=True)
    # Tag the buffer as scene-referred linear so `save_render` treats it as radiance rather than
    # as already-encoded sRGB. Set at creation: `blender.md` records that setting a colour space
    # AFTER filling a buffer reinterprets it and zeroes the contents.
    img.colorspace_settings.name = "Linear Rec.709"
    px = []
    for r, g, b in values:
        px += [float(r), float(g), float(b), 1.0]
    img.pixels.foreach_set(px)
    img.update()

    # PNG at 8 bits: the arc's comparisons are in 8-bit display counts, so the quantisation is
    # part of the quantity being measured, not an error in it.
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.color_mode = "RGB"
    # Blender dithers 8-bit output by DEFAULT (`dither_intensity` 1.0). That is right for a
    # picture and wrong for a LUT: it adds sub-LSB noise to the exact quantity being sampled.
    scene.render.dither_intensity = 0.0
    tmp = os.path.join(tempfile.mkdtemp(prefix="agx_lut_"), "lut.png")
    img.save_render(tmp, scene=scene)

    out = bpy.data.images.load(tmp)
    # A loaded PNG is tagged sRGB; read `pixels` raw and undo nothing — we want the FILE's bytes.
    out.colorspace_settings.name = "Non-Color"
    buf = [0.0] * (len(out.pixels))
    out.pixels.foreach_get(buf)
    counts = []
    for i in range(n):
        o = i * 4
        counts.append([int(round(buf[o] * 255)), int(round(buf[o + 1] * 255)), int(round(buf[o + 2] * 255))])
    return counts, tmp


def verify_cycles(values):
    """Render the probe values as emission shaders and return the counts Cycles produces.

    An emission shader at strength 1 leaves the surface radiance EQUAL to its colour, so the
    render carries the probe value exactly and needs no light rig, no albedo and no bounce --
    and it is noise-free, so one sample suffices. An orthographic camera looks straight down a
    row of unit planes, one per probe, with film exposure left at 1.0.
    """
    scene = bpy.context.scene
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    # No world light: a non-black world would ADD to the emission and the probe value would no
    # longer be the surface radiance.
    if scene.world is None:
        scene.world = bpy.data.worlds.new("w")
    scene.world.use_nodes = False
    scene.world.color = (0.0, 0.0, 0.0)

    n = len(values)
    for i, (r, g, b) in enumerate(values):
        bpy.ops.mesh.primitive_plane_add(size=1.0, location=(i + 0.5, 0.0, 0.0))
        plane = bpy.context.active_object
        plane.rotation_euler = (1.5707963267948966, 0.0, 0.0)  # face -Y, toward the camera
        mat = bpy.data.materials.new(f"emit_{i}")
        mat.use_nodes = True
        nt = mat.node_tree
        for node in list(nt.nodes):
            nt.nodes.remove(node)
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (float(r), float(g), float(b), 1.0)
        emit.inputs["Strength"].default_value = 1.0
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        plane.data.materials.append(mat)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = float(n)
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (n / 2.0, -5.0, 0.0)
    cam.rotation_euler = (1.5707963267948966, 0.0, 0.0)
    scene.camera = cam

    # One pixel per probe would land the sample on a plane EDGE; 8 lets the read take a centre.
    cell = 8
    scene.render.resolution_x = n * cell
    scene.render.resolution_y = cell
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.dither_intensity = 0.0
    # The pixel filter is a RECONSTRUCTION filter: at the default 1.5 px width it mixes
    # neighbouring cells, and adjacent probes here differ by an entire primary. Narrow it, so the
    # check measures the display transform rather than the filter.
    scene.render.filter_size = 0.01
    tmp = os.path.join(tempfile.mkdtemp(prefix="agx_cyc_"), "cyc.png")
    scene.render.filepath = tmp
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.color_mode = "RGB"
    bpy.ops.render.render(write_still=True)

    img = bpy.data.images.load(tmp)
    img.colorspace_settings.name = "Non-Color"
    buf = [0.0] * len(img.pixels)
    img.pixels.foreach_get(buf)
    w = n * cell
    y = cell // 2
    counts = []
    for i in range(n):
        x = i * cell + cell // 2
        o = (y * w + x) * 4
        counts.append([int(round(buf[o] * 255)), int(round(buf[o + 1] * 255)), int(round(buf[o + 2] * 255))])
    return counts, tmp


def main(argv=None):
    a = parse_args(argv)
    with open(a.values) as f:
        values = json.load(f)["values"]
    counts, png = sample(values, a.view_transform, a.look, a.exposure)
    cycles = None
    if a.verify_cycles:
        cyc_counts, cyc_png = verify_cycles(values)
        deltas = [c[k] - counts[i][k] for i, c in enumerate(cyc_counts) for k in range(3)]
        cycles = {
            "counts": cyc_counts,
            "png": cyc_png,
            "max_abs_delta": max(abs(d) for d in deltas),
            "mean_abs_delta": round(sum(abs(d) for d in deltas) / len(deltas), 4),
            "n_nonzero": sum(1 for d in deltas if d != 0),
            "n": len(deltas),
        }
        print("AGXLUT cycles-vs-lut " + json.dumps(
            {k: cycles[k] for k in ("max_abs_delta", "mean_abs_delta", "n_nonzero", "n")}))
    vs = bpy.context.scene.view_settings
    result = {
        "side": "blender",
        "version": ".".join(str(x) for x in bpy.app.version),
        "view_transform": vs.view_transform,
        "look": vs.look,
        "exposure": vs.exposure,
        "display_device": bpy.context.scene.display_settings.display_device,
        "png": png,
        "values": values,
        "counts": counts,
        "cycles": cycles,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(result, f, indent=2)
    print("AGXLUT " + json.dumps({k: result[k] for k in
                                  ("version", "view_transform", "look", "exposure", "display_device")}))
    print(f"AGXLUT wrote {a.out} ({len(values)} probes)")
    return result


if __name__ == "__main__":
    main()
