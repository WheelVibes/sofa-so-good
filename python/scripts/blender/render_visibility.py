"""Render APERTURE (SKY) VISIBILITY as an image — the ground truth for item (w).

    blender --background --factory-startup \
      --python python/scripts/blender/render_visibility.py -- \
      --dir /tmp/ld2 --samples 128

`v0.31.7.8` established that the app's indirect light is *visibility-blind*: its
`HemisphereLight` + `AmbientLight` give every surface the same skylight whether or not it can
see the sky, which reads as a ~3x error on a wall that can barely see the window. The proposed
fix is to modulate indirect irradiance by aperture visibility. Before building a bake
pipeline for that, the claim itself should be falsifiable: **does aperture visibility actually
predict the measured error pattern?**

This renders the quantity directly. Every material is replaced with a pure white Lambertian
surface, the world is a constant white emitter, and there is no sun. Under those conditions a
diffuse surface's radiance is proportional to the fraction of the hemisphere from which it can
see the world — i.e. **the render IS the visibility map**, up to one global constant.

The test it enables: if the missing term is aperture visibility, then

    (app / physics)  x  visibility   ==  approximately flat

because the app supplies unshadowed skylight where physics supplies `visibility x skylight`.
A flat product confirms the diagnosis; a sloped one refutes it and the term is something else.

Reads the pose from a `BLENDREF` manifest for the same reason `render_from_manifest.py` does:
the pose must be read, never retyped. Uses more samples than a normal render by default,
because a white-on-white scene is pure indirect light and therefore the noisiest case Cycles
has.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glb_fix  # noqa: E402
import sofa_scene as S  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="render_visibility.py")
    p.add_argument("--dir", required=True, help="a BLENDREF directory")
    p.add_argument("--out", default=None, help="default <dir>/visibility.png")
    p.add_argument("--samples", type=int, default=128)
    p.add_argument("--res", default=None, help="WxH; default the manifest aspect at 800 wide")
    p.add_argument("--albedo", type=float, default=1.0,
                   help="white-diffuse albedo. 1.0 makes the render proportional to visibility "
                        "INCLUDING interreflection between surfaces; a low value (e.g. 0.05) "
                        "suppresses bounce so the result is nearly PURE first-bounce sky "
                        "visibility. Both are informative and they are different quantities.")
    p.add_argument("--json", action="store_true")
    return p.parse_args(argv)


def make_visibility_world(strength: float = 1.0) -> None:
    """A constant white world: every direction emits the same radiance.

    Not a sky model on purpose. A sky gradient would weight directions by their radiance and
    the render would measure `visibility x sky`, which is what the reference render already
    measures. A CONSTANT world makes the render measure visibility alone.
    """
    world = bpy.data.worlds.new("visibility") if not bpy.context.scene.world else bpy.context.scene.world
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def open_apertures() -> tuple[int, list[str]]:
    """Delete the glazing, BEFORE whitening — otherwise the room has no windows.

    **This is not an optimisation; without it the measurement is zero.** Replacing every
    material with an opaque diffuse turns the window glass into a solid white wall, sealing
    the room into a box with no aperture. The first run of this script produced an image whose
    maximum pixel value was **2 of 255** for exactly that reason.

    Deleting rather than making transmissive is the right model of the question. "Aperture
    visibility" means the fraction of the sky a point can see *through the opening*; a physical
    pane's Fresnel and absorption belong to the app's own glass shading, not to the geometric
    visibility term being measured here.

    Detection is by transmissive/transparent shading on the ORIGINAL material, since that is
    what glazing is, in any exporter's output.
    """
    doomed: list[bpy.types.Object] = []
    names: list[str] = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        transmissive = False
        for mat in obj.data.materials:
            if mat is None:
                continue
            if not mat.node_tree:
                continue
            for node in mat.node_tree.nodes:
                for sock_name in ("Transmission Weight", "Alpha"):
                    sock = node.inputs.get(sock_name) if hasattr(node, "inputs") else None
                    if sock is None or sock.is_linked:
                        continue
                    val = sock.default_value
                    if sock_name == "Transmission Weight" and val > 0.5:
                        transmissive = True
                    if sock_name == "Alpha" and val < 0.9:
                        transmissive = True
        if transmissive:
            doomed.append(obj)
            names.append(obj.name)
    for obj in doomed:
        bpy.data.objects.remove(obj, do_unlink=True)
    return len(doomed), names[:8]


def whiten_all_materials(albedo: float) -> int:
    """Replace every material with one white diffuse surface.

    Diffuse rather than Principled: a Principled BSDF carries specular and coat lobes whose
    directional response would contaminate a measurement that is supposed to be pure cosine-
    weighted visibility.

    Call `open_apertures()` FIRST — see its docstring for why this is load-bearing.
    """
    mat = bpy.data.materials.new("visibility_white")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    d = nt.nodes.new("ShaderNodeBsdfDiffuse")
    d.inputs["Color"].default_value = (albedo, albedo, albedo, 1.0)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(d.outputs["BSDF"], out.inputs["Surface"])
    n = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if not obj.data.materials:
            obj.data.materials.append(mat)
            n += 1
            continue
        for i in range(len(obj.data.materials)):
            obj.data.materials[i] = mat
            n += 1
    return n


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    d = os.path.abspath(a.dir)
    with open(os.path.join(d, "manifest.json")) as fh:
        manifest = json.load(fh)
    cam = manifest["camera"]
    aspect = cam.get("aspect") or 16 / 9
    res = a.res or f"800x{int(round(800 / aspect))}"
    w, h = (int(v) for v in res.split("x"))
    out = a.out or os.path.join(d, "visibility.png")

    glb = os.path.join(d, manifest.get("glb", "scene.glb"))
    fixed, stripped = glb_fix.strip_noop_dispersion(glb)

    S.reset_scene()
    S.import_glb(fixed)
    S.setup_cycles(samples=a.samples, res=(w, h))
    make_visibility_world()
    opened, opened_names = open_apertures()
    slots = whiten_all_materials(a.albedo)
    # No sun: a sun would add a direct term, and visibility is an indirect quantity.
    # This helper pins the vertical FOV via sensor_fit itself, which is the whole reason
    # to use it rather than place_camera().
    S.place_camera_from_three(
        tuple(cam["position"]),
        look_at_three=tuple(cam["target"]),
        fov_deg_vertical=cam["fovVerticalDeg"],
    )
    S.render_png(out)
    result = {
        "ok": True,
        "out": out,
        "res": [w, h],
        "samples": a.samples,
        "albedo": a.albedo,
        "material_slots_whitened": slots,
        "glazing_meshes_removed": opened,
        "glazing_examples": opened_names,
        "dispersion_stripped": stripped,
        "world": "constant white (visibility, not sky-weighted)",
        "sun": None,
    }
    print("RENDER_VISIBILITY " + json.dumps(result))
    if a.json:
        print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
