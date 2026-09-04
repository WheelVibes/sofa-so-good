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
import cli_argv  # noqa: E402
import glb_fix  # noqa: E402
import sofa_scene as S  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="render_visibility.py")
    p.add_argument("--dir", required=True, help="a BLENDREF directory")
    p.add_argument("--out", default=None, help="default <dir>/visibility.png")
    p.add_argument("--device", default="CPU", choices=("CPU", "GPU"),
                   help="Cycles compute device. GPU also enables the backend in add-on "
                        "preferences (factory-startup leaves it at NONE, which silently "
                        "falls back to CPU). Metal measured 2.6x faster than CPU once its "
                        "kernel cache is warm; the FIRST GPU render on a machine pays ~100 s "
                        "of one-time kernel compilation.")
    p.add_argument("--samples", type=int, default=128)
    p.add_argument("--res", default=None, help="WxH; default the manifest aspect at 800 wide")
    p.add_argument("--no-sun-disc", action="store_true",
                   help="with --sky, drop the SUN DISC and keep only diffuse skylight. This is "
                        "the variant that matches what the app is actually missing: three.js "
                        "computes DIRECT sun (and its shadows) already, so a baked term that "
                        "includes the sun double-counts it -- and at albedo 1.0 a sun patch is "
                        "far brighter relative to its surroundings than on a real floor, which "
                        "measurably made full irradiance a WORSE predictor of physics than "
                        "sun-free visibility (v0.31.7.67).")
    p.add_argument("--mask-from-index", default=None, metavar="INDEX.JSON",
                   help="render a BINARY MASK of exactly the meshes a bake covered, read "
                        "from that bake's own index.json. Guarantees the same set by "
                        "construction rather than by re-deriving --min-area/--limit, which "
                        "would be a second selection rule free to disagree. Needed because a "
                        "partial bake makes a frame a MIXTURE of two lighting models, and "
                        "measuring the mixture is not measuring the map (v0.31.7.91).")
    p.add_argument("--mask-glazing", action="store_true",
                   help="render a BINARY MASK of the glazing (white glass, black "
                        "everything else) at the manifest pose, instead of a "
                        "visibility render. Use it to measure the window PANES alone "
                        "-- a rectangular crop also contains the grille, the curtains "
                        "and the sill, which dilutes every window figure.")
    p.add_argument("--sky", action="store_true",
                   help="light with the manifest's PHYSICAL SKY AND SUN instead of a constant "
                        "white world. Turns the output from VISIBILITY into IRRADIANCE: the "
                        "same white-Lambertian surfaces, but weighted by the real radiance "
                        "distribution of the sky and lit by the sun. Sky-dependent and so less "
                        "reusable than visibility -- valid only for the time of day it was made "
                        "at -- but it is the ACTUAL missing term rather than a proxy for it.")
    p.add_argument("--albedo", type=float, default=1.0,
                   help="white-diffuse albedo. 1.0 makes the render proportional to visibility "
                        "INCLUDING interreflection between surfaces; a low value (e.g. 0.05) "
                        "suppresses bounce so the result is nearly PURE first-bounce sky "
                        "visibility. Both are informative and they are different quantities.")
    p.add_argument("--json", action="store_true")
    return p.parse_args(cli_argv.normalise(p, argv))


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
    doomed = find_glazing()
    names = [o.name for o in doomed]
    for obj in doomed:
        bpy.data.objects.remove(obj, do_unlink=True)
    return len(doomed), names[:8]


def find_glazing() -> list:
    """The glazing meshes, by transmissive/transparent shading on the ORIGINAL material.

    Split out of `open_apertures()` so the same predicate can also MARK the glass
    instead of deleting it -- see `mask_glazing()`. One predicate, so a mask and an
    aperture can never disagree about what a window is.
    """
    found = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        transmissive = False
        for mat in obj.data.materials:
            if mat is None or not mat.node_tree:
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
            found.append(obj)
    return found


def mask_objects(names: set) -> tuple[int, list[str]]:
    """Binary mask of the NAMED meshes: white for those, black for everything else.

    Same emission trick as `mask_glazing()`, different selector. Reading the names
    from a bake's `index.json` is deliberate: the bake already recorded which
    objects it covered, so the mask cannot drift from the set it is describing.
    """
    black = bpy.data.materials.new("mask_black")
    black.use_nodes = True
    nt = black.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    e.inputs["Strength"].default_value = 0.0
    nt.links.new(e.outputs["Emission"], nt.nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])

    white = bpy.data.materials.new("mask_white")
    white.use_nodes = True
    nt2 = white.node_tree
    nt2.nodes.clear()
    e2 = nt2.nodes.new("ShaderNodeEmission")
    e2.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    # Overdriven for the same reason mask_glazing overdrives: the mask is
    # thresholded, and emission 1.0 through AgX lands well short of 255.
    e2.inputs["Strength"].default_value = 50.0
    nt2.links.new(e2.outputs["Emission"], nt2.nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])

    hit = 0
    missing = sorted(names)
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.materials:
            continue
        marked = obj.name in names
        for i in range(len(obj.data.materials)):
            obj.data.materials[i] = white if marked else black
        if marked:
            hit += 1
            if obj.name in missing:
                missing.remove(obj.name)
    make_visibility_world(strength=0.0)
    # Report what was asked for but not found -- a silently smaller mask would
    # quietly shrink the population under measurement.
    return hit, missing[:8]


def mask_glazing() -> tuple[int, list[str]]:
    """Render-ready BINARY MASK of the glazing: white glass, black everything else.

    **Why a mask is needed.** Comparing the window through a rectangular crop is
    confounded: the crop also contains the mullion grille, the curtain panels and
    whatever furniture sits below the sill, all opaque mid-grey in both pipelines.
    `v0.31.7.74`/`.75` measured three separate levers at +5-8 % each on a crop mean
    and could not tell how much of that dilution was geometry -- the share of the
    crop above 219 counts stayed pinned at 1.11 % against the reference's 49.58 %,
    which is the signature of measuring mostly not-glass.

    Generated in Blender from the SAME pose and the SAME geometry the reference
    render uses, so the mask is exact rather than hand-drawn, and it applies to the
    app's frame too because both sides are the same scene at the same camera.
    """
    glazing = set(o.name for o in find_glazing())
    black = bpy.data.materials.new("mask_black")
    black.use_nodes = True
    nt = black.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    e.inputs["Strength"].default_value = 0.0
    nt.links.new(e.outputs["Emission"], nt.nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])

    white = bpy.data.materials.new("mask_white")
    white.use_nodes = True
    nt2 = white.node_tree
    nt2.nodes.clear()
    e2 = nt2.nodes.new("ShaderNodeEmission")
    e2.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    # Emission strength 1.0 through AgX lands well short of 255; the mask is
    # thresholded, not measured, so overdrive it to make the binary unambiguous.
    e2.inputs["Strength"].default_value = 50.0
    nt2.links.new(e2.outputs["Emission"], nt2.nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])

    n = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data.materials:
            continue
        mat = white if obj.name in glazing else black
        for i in range(len(obj.data.materials)):
            obj.data.materials[i] = mat
        if mat is white:
            n += 1
    # A lit world would show through the glass and pollute the mask.
    make_visibility_world(strength=0.0)
    return n, sorted(glazing)[:8]


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
    S.setup_cycles(samples=a.samples, res=(w, h), device=a.device)
    sky_info = None
    if a.mask_from_index:
        with open(os.path.abspath(a.mask_from_index)) as fh:
            idx = json.load(fh)
        wanted = {m["object"] for m in idx.get("maps", []) if m.get("object")}
        if not wanted:
            raise ValueError(f"{a.mask_from_index} lists no objects to mask")
        masked, mask_names = mask_objects(wanted)
        if masked != len(wanted):
            raise ValueError(
                f"index names {len(wanted)} objects but only {masked} are in the scene; "
                f"missing e.g. {mask_names} -- the mask would describe a different set"
            )
        opened, opened_names = 0, []
        slots = 0
    elif a.mask_glazing:
        masked, mask_names = mask_glazing()
        opened, opened_names = 0, []
        slots = 0
    elif a.sky:
        # Order still matters exactly as for visibility: open the apertures BEFORE
        # whitening, or the whitened glazing seals the room. The difference is only
        # which world is overhead.
        directional = manifest.get("lights", {}).get("directional") or []
        if not directional:
            raise ValueError(
                "--sky needs a directional light in the manifest to place the sun from; "
                "this reference has none (re-capture with the app's sun enabled)"
            )
        sky_info = S.setup_world_sky_from_three_direction(
            tuple(directional[0]["travel"]), sun_disc=not a.no_sun_disc
        )
    else:
        make_visibility_world()
    if not (a.mask_glazing or a.mask_from_index):
        # Skipped in mask mode: deleting the glazing would remove the very thing
        # being masked, and whitening would erase the black/white distinction.
        opened, opened_names = open_apertures()
        slots = whiten_all_materials(a.albedo)
    # Without --sky there is no sun: a sun would add a direct term, and visibility is
    # an indirect quantity. WITH --sky the sun is part of the sky node itself, so the
    # direct term is included on purpose -- irradiance means all of it.
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
        "world": "black (OBJECT MASK)"
        if a.mask_from_index
        else "black (GLAZING MASK)"
        if a.mask_glazing
        else "physical sky + sun (IRRADIANCE)"
        if a.sky
        else "constant white (visibility, not sky-weighted)",
        "masked_glazing": masked if (a.mask_glazing or a.mask_from_index) else None,
        "mask_examples": mask_names if (a.mask_glazing or a.mask_from_index) else None,
        "sky": sky_info,
        "sun": None,
    }
    print("RENDER_VISIBILITY " + json.dumps(result))
    if a.json:
        print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)


def kill_glazing_emissive() -> tuple[int, float]:
    """Zero the EMISSIVE on glazing materials, and report what was removed.

    **Why this exists (item `(z15)`).** The app gives its window panes an emissive "sky catch"
    (`GLASS_SKYCATCH_COLOR` at `glassSkyCatchIntensity`) as a LOOK device -- it makes a window read
    as a bright aperture on a rasteriser that cannot produce the highlight any other way. That
    emissive is exported into the GLB, and in Cycles an emissive surface is a real light source. So
    every reference render and every bake built from a `scene-glb` export has been partly lit by the
    app's own artistic choice, at a strength comparable to the sky itself: `v0.31.7.294` measured
    `emissiveStrength` **8.32** with factor `[0.624, 0.776, 0.914]`, against a sky whose baked
    radiance is about 2.97 in the same units.

    That matters most where it is most circular: `(l)`'s window calibration tuned the app's pane
    against a reference whose window was lit by that same pane.

    Uses `find_glazing()`'s predicate rather than a new one, so a mask, an aperture and this can
    never disagree about what a window is.
    """
    removed = 0
    total = 0.0
    seen = set()
    for obj in find_glazing():
        for mat in obj.data.materials:
            if mat is None or not mat.node_tree or mat.name in seen:
                continue
            seen.add(mat.name)
            for node in mat.node_tree.nodes:
                if not hasattr(node, "inputs"):
                    continue
                for sock_name in ("Emission Strength", "Emission Color"):
                    sock = node.inputs.get(sock_name)
                    if sock is None or sock.is_linked:
                        continue
                    if sock_name == "Emission Strength":
                        if sock.default_value > 0:
                            total += float(sock.default_value)
                            sock.default_value = 0.0
                            removed += 1
                    else:
                        sock.default_value = (0.0, 0.0, 0.0, 1.0)
    return removed, total
