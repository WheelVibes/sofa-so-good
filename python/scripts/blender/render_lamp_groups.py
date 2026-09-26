"""Night, lamps-only Cycles reference with the app's fixture lights split into GROUPS (R7-AH).

    blender --background --factory-startup \
      --python python/scripts/blender/render_lamp_groups.py -- \
      --dir /tmp/r7ah/app --out /tmp/r7ah/cycles --res 600x450 --samples 1024

    blender --background --factory-startup \
      --python python/scripts/blender/render_lamp_groups.py -- --selftest --out /tmp/r7ah/selftest

`--dir` is what `scripts/dev-probes/room-lights-cycles.mjs` writes: a WALK-mode `scene.glb` and a
`manifest.json` with every fixture light, the camera of each pose and which lights the app's
room-scoped pool carried there. Per pose this renders two linear EXRs (plus `.npy` dumps):

  * `<pose>-pool.exr`  — only the lamps the pool keeps for that pose's room;
  * `<pose>-rest.exr`  — only the lamps the pool drops;
  * `<pose>-none.exr`  — no lamps: the camera-only emissives, which every render carries.

Light is additive, so `(pool - none) + (rest - none) + none` is the whole rig, and `rest - none` is what Cycles says the dropped
lamps are physically worth at each pixel (walls occlude, bounce through open doorways counts).
Plus `<pose>-pos.npy` / `<pose>-nrm.npy` (world position and normal, Blender Z-up) for region masks.

**Light units — the conversion this whole comparison rests on.** three r155+ point lights carry
an intensity `I` in candela and shade a Lambert surface to `albedo/pi * I * cos / d^2` (times the
`distance` window below); the pixel is that number, no luminous efficacy anywhere. A Cycles point
lamp of power `P` watts has radiant intensity `P / (4*pi)` per steradian and shades the same
surface to `albedo/pi * P/(4*pi) * cos / d^2`. So `P = 4*pi*I` — NOT the glTF importer's
`4*pi*I/683` "physical" mode, which would make every lamp 683x too dim against the app's pixels.
`--selftest` measures this on a plane rather than trusting the algebra.

**The app's `distance` window is reproduced** (`--no-window` drops it): three multiplies the
inverse square by `clamp(1 - (d/distance)^4, 0, 1)^2`, so a lamp contributes nothing beyond
`distance`. A light-shader node tree multiplies the lamp's emission by the same function of the
Light Path node's Ray Length (the lamp-to-shading-point distance for a shadow ray). With it, the
only differences left between this rig and the app's are the two physics ones under test:
visibility (Cycles' walls occlude, the app's fixtures cast no shadows) and interreflection.

**What else is deliberately made to match the app, not reality.**
  * Emissive materials (lamp shades' glow, the glazing sky-catch) are CAMERA-ONLY: they are look
    devices in the app and light nothing there, so here they light nothing either.
  * Fixture meshes around each bulb (shade, pendant, bulb housing: a small mesh whose bounds
    contain the bulb) are camera-visible only. The app's point lights are omnidirectional and
    ignore their own shade; an opaque Cycles shade would swallow a table lamp's light entirely.
  * The world is black: the night sky and everything else non-lamp is measured on the app side
    as its lights-off frame and subtracted there.
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
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cli_argv  # noqa: E402
import sofa_scene as S  # noqa: E402

#: three (Y-up) -> Blender (Z-up): (x, y, z) -> (x, -z, y), as a 4x4 on the left.
Y_UP_TO_Z_UP = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--dir", help="room-lights-cycles.mjs output (scene.glb + manifest.json)")
    p.add_argument("--out", required=True)
    p.add_argument("--res", default="600x450")
    p.add_argument("--samples", type=int, default=1024)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--poses", default=None, help="comma list; default every pose in the manifest")
    p.add_argument("--groups", default="none,pool,rest",
                   help="none = no lamps (the camera-only emissives alone: subtract it from the "
                        "others, which all carry it), pool, rest, all")
    p.add_argument("--no-window", action="store_true", help="pure inverse square, no `distance`")
    p.add_argument("--no-denoise", action="store_true")
    p.add_argument("--direct-only", action="store_true",
                   help="0 bounces: the lamps' DIRECT light only (still shadowed) -- the term the "
                        "app's point lights compute, for checking the pipeline and splitting GI")
    p.add_argument("--no-passes", action="store_true", help="skip the position/normal passes")
    p.add_argument("--device", default="GPU", choices=("CPU", "GPU"))
    p.add_argument("--emitter-radius", type=float, default=0.02)
    p.add_argument("--selftest", action="store_true")
    return p.parse_args(cli_argv.normalise(p, argv))


# ── lights ────────────────────────────────────────────────────────────────────


def _window_tree(light: bpy.types.Light, distance: float) -> None:
    """Emission x clamp(1 - (d/distance)^4, 0, 1)^2, d = Light Path Ray Length."""
    light.use_nodes = True
    nt = light.node_tree
    emit = next(n for n in nt.nodes if n.type == "EMISSION")
    lp = nt.nodes.new("ShaderNodeLightPath")
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = "DIVIDE"
    m.inputs[1].default_value = distance
    nt.links.new(lp.outputs["Ray Length"], m.inputs[0])
    p4 = nt.nodes.new("ShaderNodeMath")
    p4.operation = "POWER"
    p4.inputs[1].default_value = 4.0
    nt.links.new(m.outputs[0], p4.inputs[0])
    one_minus = nt.nodes.new("ShaderNodeMath")
    one_minus.operation = "SUBTRACT"
    one_minus.use_clamp = True
    one_minus.inputs[0].default_value = 1.0
    nt.links.new(p4.outputs[0], one_minus.inputs[1])
    sq = nt.nodes.new("ShaderNodeMath")
    sq.operation = "POWER"
    sq.inputs[1].default_value = 2.0
    nt.links.new(one_minus.outputs[0], sq.inputs[0])
    nt.links.new(sq.outputs[0], emit.inputs["Strength"])


def add_lamp(rec: dict, name: str, window: bool, radius: float) -> bpy.types.Object:
    data = bpy.data.lights.new(name, type="POINT")
    data.energy = 4.0 * math.pi * float(rec["intensity"])  # P = 4*pi*I, see module docstring
    data.color = tuple(float(c) for c in rec["color"])
    data.shadow_soft_size = radius
    if hasattr(data, "use_soft_falloff"):
        data.use_soft_falloff = False
    dist = float(rec.get("distance") or 0.0)
    if window and dist > 0:
        _window_tree(data, dist)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = S.three_to_blender(tuple(float(v) for v in rec["position"]))
    obj.visible_camera = False
    return obj


# ── scene preparation ─────────────────────────────────────────────────────────


def camera_only(obj: bpy.types.Object) -> None:
    obj.visible_diffuse = False
    obj.visible_glossy = False
    obj.visible_transmission = False
    obj.visible_volume_scatter = False
    obj.visible_shadow = False


def emissive_camera_only() -> int:
    """Multiply every non-zero Emission Strength by Light Path `Is Camera Ray`."""
    n = 0
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        nt = mat.node_tree
        for node in list(nt.nodes):
            sock = node.inputs.get("Emission Strength") if hasattr(node, "inputs") else None
            if sock is None:
                continue
            col = node.inputs.get("Emission Color")
            lit = sock.is_linked or sock.default_value > 0
            if col is not None and not col.is_linked and max(col.default_value[:3]) <= 0:
                lit = False
            if not lit:
                continue
            lp = nt.nodes.new("ShaderNodeLightPath")
            mul = nt.nodes.new("ShaderNodeMath")
            mul.operation = "MULTIPLY"
            if sock.is_linked:
                src = sock.links[0].from_socket
                nt.links.new(src, mul.inputs[0])
            else:
                mul.inputs[0].default_value = sock.default_value
            nt.links.new(lp.outputs["Is Camera Ray"], mul.inputs[1])
            nt.links.new(mul.outputs[0], sock)
            n += 1
    return n


def world_bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def fixture_meshes(lamps: list[Vector], pad: float = 0.12, max_dim: float = 1.6) -> list[str]:
    hit = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        lo, hi = world_bbox(o)
        if max(hi - lo) > max_dim:
            continue
        for p in lamps:
            if all(lo[i] - pad <= p[i] <= hi[i] + pad for i in range(3)):
                camera_only(o)
                hit.append(o.name)
                break
    return hit


def camera_from_three(matrix_world: list[float], fov_v_deg: float) -> bpy.types.Object:
    m3 = Matrix([matrix_world[i::4] for i in range(4)])  # three stores column-major
    data = bpy.data.cameras.new("camera")
    data.sensor_fit = "VERTICAL"
    data.lens_unit = "FOV"
    data.angle = math.radians(fov_v_deg)
    data.clip_start = 0.02
    cam = bpy.data.objects.new("camera", data)
    bpy.context.collection.objects.link(cam)
    # Both cameras look down local -Z with +Y up, so only the world frame changes.
    cam.matrix_world = Y_UP_TO_Z_UP @ m3
    bpy.context.scene.camera = cam
    return cam


def black_world() -> None:
    w = bpy.data.worlds.new("black")
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Strength"].default_value = 0.0
    bpy.context.scene.world = w


# ── output ────────────────────────────────────────────────────────────────────


def render_exr(path: str) -> np.ndarray:
    """Render, save the raw float buffer as EXR, reload it (the trusted route, see
    `exr_dump.py`) and return a top-down HxWx3 float32 array (also saved as .npy)."""
    sc = bpy.context.scene
    bpy.ops.render.render(write_still=False)
    res = bpy.data.images.get("Render Result")
    st = sc.render.image_settings
    st.file_format, st.color_depth, st.color_mode = "OPEN_EXR", "32", "RGB"
    res.save_render(path, scene=sc)
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = "Linear Rec.709"
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    a = buf.reshape(h, w, 4)[::-1, :, :3].copy()
    np.save(os.path.splitext(path)[0] + ".npy", a)
    return a


def data_pass(path: str, which: str) -> np.ndarray:
    """One-sample render of a data pass (Position / Normal) routed to the composite."""
    sc = bpy.context.scene
    vl = sc.view_layers[0]
    vl.use_pass_position = True
    vl.use_pass_normal = True
    tree = bpy.data.node_groups.new(f"pass_{which}", "CompositorNodeTree")
    rl = tree.nodes.new("CompositorNodeRLayers")
    out = tree.nodes.new("NodeGroupOutput")
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    tree.links.new(rl.outputs[which], out.inputs[0])
    prev = (sc.cycles.samples, sc.cycles.use_denoising, sc.view_settings.view_transform)
    sc.compositing_node_group = tree
    sc.cycles.samples = 1
    sc.cycles.use_denoising = False
    sc.view_settings.view_transform = "Standard"
    try:
        return render_exr(path)
    finally:
        sc.compositing_node_group = None
        sc.cycles.samples, sc.cycles.use_denoising, sc.view_settings.view_transform = prev


# ── the self-test: does P = 4*pi*I (and the window) reproduce three's shading? ─


def selftest(a: argparse.Namespace) -> dict:
    """A 0.5-albedo Lambert floor, one lamp 2 m above it, orthographic camera straight down.
    three's value at floor distance r from the foot: 0.5/pi * I * h/d^3 * window(d)."""
    S.reset_scene()
    S.setup_cycles(samples=a.samples, res=(201, 201), device=a.device, seed=a.seed)
    sc = bpy.context.scene
    sc.cycles.use_denoising = False
    sc.view_settings.view_transform = "Standard"
    black_world()
    bpy.ops.mesh.primitive_plane_add(size=40)
    plane = bpy.context.active_object
    mat = bpy.data.materials.new("lambert")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    plane.data.materials.append(mat)
    h, intensity, dist = 2.0, 9.0, 6.5
    out = {}
    for label, window in (("window", True), ("no_window", False)):
        for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]:
            bpy.data.objects.remove(o, do_unlink=True)
        add_lamp({"intensity": intensity, "color": [1, 1, 1], "position": [0, h, 0],
                  "distance": dist}, "lamp", window, a.emitter_radius)
        cam_d = bpy.data.cameras.new("ortho")
        cam_d.type = "ORTHO"
        cam_d.ortho_scale = 14.0  # 201 px across 14 m
        cam = bpy.data.objects.new("ortho", cam_d)
        bpy.context.collection.objects.link(cam)
        cam.location = (0, 0, 10)
        sc.camera = cam
        img = render_exr(os.path.join(a.out, f"selftest-{label}.exr"))
        row = img[100, :, 0]
        rows = []
        for px in (100, 110, 120, 130, 140, 150, 160, 170, 180, 190):
            r = (px - 100) * 14.0 / 201
            d = math.hypot(h, r)
            win = max(0.0, min(1.0, 1 - (d / dist) ** 4)) ** 2 if window else 1.0
            want = 0.5 / math.pi * intensity * h / d**3 * win
            got = float(np.mean(row[px - 1:px + 2]))
            rows.append({"r_m": round(r, 3), "three": round(want, 5), "cycles": round(got, 5),
                         "ratio": round(got / want, 4) if want > 1e-6 else None})
        out[label] = rows
    return out


# ── main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    a = parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    if a.selftest:
        res = selftest(a)
        print("SELFTEST " + json.dumps(res))
        return 0
    man = json.load(open(os.path.join(a.dir, "manifest.json"), encoding="utf-8"))
    w, h = (int(v) for v in a.res.lower().split("x"))
    S.reset_scene()
    S.import_glb(os.path.join(a.dir, "scene.glb"))

    # Verify what the export carried before replacing it: KHR_lights_punctual -> Blender lights.
    imported = [o for o in bpy.data.objects if o.type == "LIGHT"]
    carried = [{"type": o.data.type, "at": [round(v, 3) for v in o.matrix_world.translation],
                "energy_W": round(o.data.energy, 4),
                "cutoff": getattr(o.data, "use_custom_distance", None) and o.data.cutoff_distance}
               for o in imported]
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)

    S.setup_cycles(samples=a.samples, res=(w, h), device=a.device, seed=a.seed)
    sc = bpy.context.scene
    sc.cycles.use_denoising = not a.no_denoise
    sc.cycles.max_bounces = 16
    sc.cycles.diffuse_bounces = 12
    sc.cycles.glossy_bounces = 4
    sc.cycles.transparent_max_bounces = 16
    if a.direct_only:
        sc.cycles.max_bounces = 0
        sc.cycles.diffuse_bounces = 0
        sc.cycles.glossy_bounces = 0
    sc.cycles.sample_clamp_indirect = 0.0
    sc.render.film_transparent = False
    sc.render.dither_intensity = 0.0
    sc.view_settings.view_transform = "Standard"
    black_world()
    n_emit = emissive_camera_only()

    lights = man["lights"]
    lamp_pos = [Vector(S.three_to_blender(tuple(l["position"]))) for l in lights]
    fixtures = fixture_meshes(lamp_pos)
    lamp_objs = [add_lamp(l, f"lamp_{i:02d}", not a.no_window, a.emitter_radius)
                 for i, l in enumerate(lights)]

    def pool_indices(pose: dict) -> set[int]:
        keep = set()
        for s in pose["poolSlots"]:
            j = min(range(len(lights)), key=lambda k: sum(
                (lights[k]["position"][i] - s["position"][i]) ** 2 for i in range(3)))
            d = math.dist(lights[j]["position"], s["position"])
            if d > 0.01 or abs(lights[j]["intensity"] - s["intensity"]) > 1e-3:
                raise RuntimeError(f"pool slot {s} matches no fixture light (nearest {d:.3f} m)")
            keep.add(j)
        return keep

    report = {"imported_lights": carried, "emissive_camera_only": n_emit,
              "fixture_meshes": len(fixtures), "fixture_mesh_names": fixtures[:60],
              "window": not a.no_window, "samples": a.samples, "res": [w, h],
              "device": S.device_report(), "poses": {}}
    names = a.poses.split(",") if a.poses else list(man["poses"].keys())
    groups = a.groups.split(",")
    for name in names:
        pose = man["poses"][name]
        for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
            bpy.data.objects.remove(o, do_unlink=True)
        camera_from_three(pose["camera"]["matrixWorld"], pose["camera"]["fov"])
        keep = pool_indices(pose)
        rec = {"pool": sorted(keep), "rest": sorted(set(range(len(lights))) - keep), "t": {}}
        if not a.no_passes:
            data_pass(os.path.join(a.out, f"{name}-pos.exr"), "Position")
            data_pass(os.path.join(a.out, f"{name}-nrm.exr"), "Normal")
        for g in groups:
            on = {"pool": keep, "rest": set(rec["rest"]), "none": set()}.get(g, set(range(len(lights))))
            for i, o in enumerate(lamp_objs):
                o.hide_render = i not in on
            t = time.time()
            img = render_exr(os.path.join(a.out, f"{name}-{g}.exr"))
            rec["t"][g] = round(time.time() - t, 1)
            rec[f"mean_{g}"] = float(img.mean())
            print(f"[lamp-groups] {name} {g}: {len(on)} lamps, mean {img.mean():.5f}, "
                  f"{rec['t'][g]} s", flush=True)
        report["poses"][name] = rec
    report["elapsed_s"] = round(time.time() - t0, 1)
    with open(os.path.join(a.out, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
    print("LAMP_GROUPS " + json.dumps({k: v for k, v in report.items()
                                       if k not in ("fixture_mesh_names", "imported_lights")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
