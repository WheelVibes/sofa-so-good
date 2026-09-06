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
import bpy  # noqa: E402
import cli_argv  # noqa: E402
import render_visibility as RV  # noqa: E402
import hdri  # noqa: E402
import sofa_scene as S  # noqa: E402
from mathutils import Vector  # noqa: E402


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
    p.add_argument("--no-glazing-emissive", action="store_true", dest="no_glazing_emissive",
                   help="zero the EMISSIVE on window glazing before rendering. The app's panes "
                        "carry an artistic sky-catch emissive that is exported into the GLB, and in "
                        "Cycles an emissive surface is a real emitter — so a reference built from a "
                        "scene-glb export is partly lit by the app's own look device, at a strength "
                        "comparable to the sky. Item (z15).")
    p.add_argument("--point-lights", default=None,
                   help="path to a JSON list of the app's interior POINT lights (as written by "
                        "scene-glb.mjs into the manifest's lights.point). Omit and the reference "
                        "is lit by sun and sky ALONE, which is item (z5): every comparison taken "
                        "at the app's default lightsMode:on was then measuring a lit interior "
                        "against an unlit reference")
    p.add_argument("--point-light-scale", type=float, default=1.0,
                   help="multiplier on the candela->watt conversion, for calibrating it")
    p.add_argument("--view-transform", default=None,
                   help="OCIO view transform, e.g. 'Standard' or 'AgX'. OMIT to keep Blender's "
                        "default, which is AgX and is what the app's three.js tiers also use -- "
                        "that match is deliberate, so this is an opt-in for ONE purpose: "
                        "comparing in a shoulder-free transform. Above ~175 displayed counts AgX "
                        "compresses hard, so two very different linear values land on similar "
                        "bytes and a percentage taken there is not a fraction of energy "
                        "(v0.31.7.170 had to qualify exactly that). `Standard` is plain sRGB with "
                        "no shoulder, so ratios survive. The enum reads only NONE under "
                        "--factory-startup and is still assignable, like `engine`.")
    p.add_argument("--exposure", type=float, default=None,
                   help="scene exposure in STOPS, applied before the view transform. Pair with "
                        "`--view-transform Standard` to get an exactly invertible reference: "
                        "Standard is plain sRGB with no shoulder, so linear = sRGB_EOTF(byte/255) "
                        "* 2**-exposure. Needed because a bright interior CLIPS under Standard — "
                        "v0.31.7.181 measured a ceiling at 255.0 with sd 0.0, which carries no "
                        "information at all. Stops down, measure, multiply back.")
    p.add_argument("--open-apertures", action="store_true", dest="open_apertures",
                   help="delete the glazing before rendering, exactly as the irradiance BAKE does. "
                        "Not a rendering preference — it makes the reference and the bake the same "
                        "lighting scenario. bake_material.py calls `open_apertures()` on the "
                        "grounds that 'whitened or not, sealed glazing makes the interior nearly "
                        "black', so a reference WITH glass and a bake WITHOUT it are not measuring "
                        "the same room, and the difference is geometry-dependent: a wall that sees "
                        "the aperture gains more than a ceiling that does not.")
    p.add_argument("--diffuse-bounces", type=int, default=None, dest="diffuse_bounces",
                   help="override Cycles' diffuse bounce limit. `0` gives a DIRECT-ONLY render, "
                        "which is the reference the app's GI-off frame should be compared against: "
                        "with the feature on, `replace` discards the analytic fill, so the app's "
                        "non-bounce light and Cycles' direct light are the same quantity. "
                        "v0.31.7.186 found the per-surface gain spanning ~6x and implicated the "
                        "app's direct term; this is how that is checked rather than argued.")
    p.add_argument("--albedo", action="store_true",
                   help="render Cycles' DIFFUSE COLOUR pass instead of shaded light, so the output "
                        "pixel IS the surface albedo. Forces the `Standard` view transform, because "
                        "the pass is DATA and a filmic curve would make it unreadable. "
                        "Exists to unblock v0.31.7.187: the per-surface equality gains span ~6x, "
                        "and splitting that into an albedo part and a bake part needs rho per "
                        "surface -- the quantity that contaminated three earlier fits because it "
                        "was assumed from `material.color` while these materials carry a "
                        "base-colour MAP.")
    p.add_argument("--section-cut", type=float, default=None, dest="section_cut",
                   help="delete every mesh whose bounding box sits ENTIRELY at or above this "
                        "height (metres, three/glTF +Y), so the reference renders the same "
                        "building SECTION the orbit dollhouse shows. Needed for any orbit "
                        "reference: the app does not HIDE the ceiling in orbit, its tiles are "
                        "single-sided planes whose back face the rasteriser culls "
                        "(`ceiling/Ceiling.tsx`), and `buildExportRoot` prunes by tag and type "
                        "and 'never by appearance' — so a path tracer, which has no backface "
                        "culling, renders a solid roof over the whole flat and the dollhouse "
                        "interior is not in the frame at all. Measured before this existed: the "
                        "orbit reference came back 62.96 % of pixels brighter than luma 235, a "
                        "sunlit white slab. 2.35 clears both the 2.6 m general and 2.4 m "
                        "bathroom ceilings on the default flat.")
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

    n_cut = 0
    if a.section_cut is not None:
        cut = a.section_cut
        keep, doomed = [], []
        for o in meshes:
            zs = [(o.matrix_world @ Vector(c)).z for c in o.bound_box]
            # Blender is Z-up and `import_glb` applies the glTF Y-up conversion, so the
            # imported Z IS the app's Y — no second conversion here.
            (doomed if min(zs) >= cut else keep).append(o.name)
        for name in doomed:
            obj = bpy.data.objects.get(name)
            if obj is not None:
                bpy.data.objects.remove(obj, do_unlink=True)
        n_cut = len(doomed)
        # Re-fetch by NAME: a removed object leaves every other reference in the old list
        # a dead StructRNA, and touching one raises
        # "ReferenceError: StructRNA of type Object has been removed".
        meshes = [o for o in (bpy.data.objects.get(n) for n in keep) if o is not None]
        print(f"  section-cut {cut} m: removed {n_cut} mesh(es) entirely above it")

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

    # `(z15)`: the app's panes carry an artistic emissive that Cycles treats as a real emitter.
    # Zeroed BEFORE the lamps are placed, so the printed counts read in the order they apply.
    if a.no_glazing_emissive:
        killed, tot = RV.kill_glazing_emissive()
        print(f"  no-glazing-emissive: zeroed {killed} emission socket(s), total strength {tot:.2f}")

    # Interior lamps, item `(z5)`. Placed for BOTH sky and non-sky routes: they are indoor
    # fittings and have nothing to do with which outdoor model is in use.
    n_point = 0
    if a.point_lights:
        with open(a.point_lights, encoding="utf-8") as fh:
            recs = json.load(fh)
        if isinstance(recs, dict):
            recs = recs.get("point") or []
        n_point = len(S.add_point_lights_from_three(recs, scale=a.point_light_scale))
        print(f"  point lights: placed {n_point} of {len(recs)}")

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

    if a.albedo:
        # The pass has to be ENABLED on the view layer and then ROUTED to the composite output;
        # enabling it alone changes nothing about the saved file, which is the same trap as
        # `Image.save()` ignoring `scene.render.image_settings` in the bake path.
        vl = bpy.context.scene.view_layers[0]
        vl.use_pass_diffuse_color = True
        # BLENDER 5 MOVED THE COMPOSITOR. `scene.node_tree` no longer exists (it raised
        # `AttributeError: 'Scene' object has no attribute 'node_tree'`); the tree is now a node
        # GROUP on `scene.compositing_node_group`, which has to be created and assigned. Same
        # class of API drift as `sofa_scene`'s note that Cycles is assignable while absent from
        # the engine enum -- check the attribute, never assume the 3.x/4.x shape.
        bpy.context.scene.use_nodes = True
        tree = bpy.data.node_groups.new("albedo_pass", "CompositorNodeTree")
        bpy.context.scene.compositing_node_group = tree
        rl = tree.nodes.new("CompositorNodeRLayers")
        out = tree.nodes.new("NodeGroupOutput")
        tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        # The socket is "Diffuse Color" on this build; 4.x called it "DiffCol". Named lookup with
        # a fallback, and a loud failure rather than silently wiring the beauty pass -- an albedo
        # render that is actually shaded light would be indistinguishable from a plausible result.
        src = None
        for name in ("Diffuse Color", "DiffCol"):
            if name in rl.outputs:
                src = rl.outputs[name]
                break
        if src is None:
            raise KeyError(
                f"no diffuse-colour output on the render-layers node; have "
                f"{[o.name for o in rl.outputs]}"
            )
        tree.links.new(src, out.inputs[0])
        # DATA, not a look: a filmic transform would remap the very values being read.
        bpy.context.scene.view_settings.view_transform = "Standard"
        bpy.context.scene.view_settings.exposure = 0.0
    if a.diffuse_bounces is not None:
        bpy.context.scene.cycles.diffuse_bounces = a.diffuse_bounces
        # `max_bounces` gates every category, so raising diffuse alone is inert if the total is
        # lower -- the trap that would make a bounce experiment report "no effect".
        bpy.context.scene.cycles.max_bounces = max(
            bpy.context.scene.cycles.max_bounces, a.diffuse_bounces
        )
    if a.open_apertures:
        removed, _names = RV.open_apertures()
        print(f"  open_apertures: deleted {removed} glazing object(s)")
    if a.exposure is not None:
        bpy.context.scene.view_settings.exposure = a.exposure
    if a.view_transform:
        # Set on `view_settings`, not `image_settings`: the latter is the FILE encoding and
        # silently ignores a view transform, which is the same class of trap as `Image.save()`
        # ignoring `scene.render.image_settings` in the bake path (v0.31.7.105).
        bpy.context.scene.view_settings.view_transform = a.view_transform
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
        # Reported so a reference cannot silently be the unlit one -- `(z5)` went unnoticed
        # precisely because nothing in the output said how many lamps were in the scene.
        "point_lights": n_point,
        "glazing_emissive_killed": bool(a.no_glazing_emissive),
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
