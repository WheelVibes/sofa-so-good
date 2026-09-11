"""Render one BLENDREF pose under every weather condition, calibrated by measurement.

    blender --background --factory-startup \
      --python python/scripts/blender/render_weather.py -- \
      --dir /tmp/weather/walk --samples 96 --device GPU

Produces `<dir>/w-<condition>.png` + `.exr` for each of `clear`, `partlyCloudy`, `overcast`,
`rain`, plus `<dir>/weather-calibration.json` recording what was solved and what was achieved.

## Why this exists, and how it stays honest

The model is in `weather_sky.py`; this file is the driver. Three properties are deliberate:

1. **`clear` is the SHIPPED reference, unchanged.** With `clear_fraction = 1` and
   `dome_strength = 0` the world is exactly what `sofa_scene.setup_world_sky_from_three_direction`
   builds, with the same `sun_intensity` `render_still.py` would have passed. So the clear arm
   is a control that must reproduce `render_from_manifest.py` — if it does not, the harness is
   wrong before any weather claim is made.
2. **Scene construction is NOT forked.** `render_from_manifest.main()` does the whole job as
   usual; this module only swaps the one world-building function it reaches through
   (`sofa_scene.setup_world_sky_from_three_direction`), which is a module attribute looked up at
   call time. The camera, the pose, the exposure, the GLB fix-ups and the linear-EXR sidecar all
   come from the existing path, so a weather reference and an ordinary one are the same
   measurement apart from the sky.
3. **The cloud dome's strength is SOLVED, not chosen.** `weather_sky.py` states a target
   horizontal irradiance per condition from Kasten & Czeplak; this file measures the actual
   irradiance each world delivers (a white Lambertian plane, single bounce, radiance `E_h/π`)
   and solves the one free parameter. It then RE-MEASURES the assembled world and prints
   achieved-vs-target, because a solve that is never checked is an assertion.

## Reading a 16-bit PNG without a library

The calibration has to get a number back out of Blender, and the readback paths inside `bpy`
are not trustworthy here: `bpy.data.images.load(...).pixels` returned zeros for a render that
had plainly succeeded, and then returned `1.50` for a background of exactly `1.0`. Rather than
build on that, the probe writes a 16-bit PNG and this module decodes it with `zlib` + `struct`
— the same "Blender's bundled Python has no imaging library, so hand-roll the 40 lines" call
`hdri.py` already makes for its Radiance writer. 16-bit plus an exposure offset is what keeps
a sunlit sky (far above 1.0) and an overcast one inside one file format without clipping.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import zlib

import bpy
import mathutils

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cli_argv  # noqa: E402
import render_from_manifest  # noqa: E402
import render_visibility as RV  # noqa: E402
import sofa_scene as S  # noqa: E402
import weather_sky as W  # noqa: E402

#: Exposure offset, in stops, applied to the calibration probe only. A clear tropical noon sky
#: puts the probe far above 1.0 and a stratus deck ~2.5 stops below it, so ONE offset holds for
#: every arm — which matters, because a per-arm offset would be a second thing to get right.
#: Auto-lowered if the brightest arm still clips.
PROBE_EXPOSURE_STOPS = -8.0

#: Lambertian ground added under BOTH the calibration probe and the rendered scene.
#:
#: **Blender's atmospheric sky has no lit ground, and the export has no ground either** — the
#: estate (`scene/estate/Estate.tsx`) is `noExport`, so a `scene-glb` GLB is a flat floating in
#: space. That is tolerable for a clear-sky reference and fatal for a weather one: at a tropical
#: noon the sun is ~87° up, a VERTICAL window sees the beam at `cos 87° = 0.05`, and the single
#: largest contributor to what comes through that window is the SUNLIT GROUND outside it.
#: Measured without a ground, the vertical irradiance at the window reads **0.0027** of the sky's
#: horizontal irradiance under `clear` against **0.0572** under `overcast` — i.e. the model says an
#: overcast sky delivers 21x more light to the window than a clear one, which is nonsense and is
#: entirely the missing ground.
#: `ShaderNodeTexSky.ground_albedo` does not supply it: it tints the SKY, it does not create a lit
#: lower hemisphere.
#: Depth and albedo are the app's own: `estateLayout.ts` puts the ground at the storey's true
#: depth (storey #08, 20.4 m below the flat) and `estateTextures.ts` paints it as grass/paving,
#: for which 0.2 is the standard albedo.
GROUND_DEPTH_M = 20.4
GROUND_ALBEDO = 0.2

# ── 16-bit PNG decode ────────────────────────────────────────────────────────


def read_png16(path: str) -> tuple[int, int, list[tuple[float, float, float]]]:
    """Decode a 16-bit RGB/RGBA PNG to float triples in 0..1. No external dependency."""
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    pos, idat, w, h, depth, ctype = 8, [], 0, 0, 0, 0
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
        pos += 12 + length
    if depth != 16 or ctype not in (2, 6):
        raise ValueError(f"expected 16-bit RGB(A) PNG, got depth={depth} colour_type={ctype}")
    channels = 3 if ctype == 2 else 4
    stride = w * channels * 2
    raw = zlib.decompress(b"".join(idat))
    out: list[tuple[float, float, float]] = []
    prev = bytearray(stride)
    at = 0
    for _y in range(h):
        ftype = raw[at]
        line = bytearray(raw[at + 1 : at + 1 + stride])
        at += 1 + stride
        bpp = channels * 2
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ftype == 1:
                line[i] = (line[i] + a) & 0xFF
            elif ftype == 2:
                line[i] = (line[i] + b) & 0xFF
            elif ftype == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif ftype == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        for x in range(w):
            o = x * bpp
            px = struct.unpack(">3H", bytes(line[o : o + 6]))
            out.append(tuple(v / 65535.0 for v in px))
        prev = line
    return w, h, out


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ── irradiance probe ─────────────────────────────────────────────────────────


def add_ground(z: float = -GROUND_DEPTH_M, albedo: float = GROUND_ALBEDO) -> None:
    """A large Lambertian ground plane at the flat's true storey depth. See `GROUND_DEPTH_M`."""
    bpy.ops.mesh.primitive_plane_add(size=1200.0, location=(0.0, 0.0, z))
    obj = bpy.context.active_object
    obj.name = "weather_ground"
    mat = bpy.data.materials.new("weather_ground")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfDiffuse")
    bsdf.inputs["Color"].default_value = (albedo, albedo, albedo, 1.0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    obj.data.materials.append(mat)


def measure_horizontal_irradiance(
    build_world, tmp_png: str, stops: float, normal=(0.0, 0.0, 1.0), ground: bool = True
) -> float:
    """Irradiance on a plane with Blender-space `normal` (arbitrary but consistent units).

    A white Lambertian plane with `diffuse_bounces = 0` radiates `E · ρ / π` with `ρ = 1`, so
    the rendered value IS the irradiance up to the constant `π` — and every arm is divided by
    the clear arm's, so the constant never appears in a published number.

    **`normal` matters more than it looks, and the default is the wrong one for a room.** A
    horizontal up-facing plane measures the sky's `E_h`, which is what the Kasten & Czeplak
    transmittances are defined against and therefore what the solve has to use. But a room is lit
    through a VERTICAL window, and a vertical surface sees half the sky plus half the GROUND —
    including, under a clear sky, the sunlit ground, which is the largest single contributor at a
    high sun. Solving on `E_h` and then reading the interior without ever measuring `E_v` is how a
    weather model can be internally consistent and still predict the wrong thing indoors.
    """
    S.reset_scene()
    sc = bpy.context.scene
    S.setup_cycles(samples=64, res=(8, 8), device="CPU")
    sc.cycles.diffuse_bounces = 0
    sc.cycles.max_bounces = 0
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = stops
    sc.render.dither_intensity = 0
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "16"

    if ground:
        add_ground()
    n = mathutils.Vector(normal).normalized()
    bpy.ops.mesh.primitive_plane_add(size=400.0, location=(0.0, 0.0, 0.0))
    plane = bpy.context.active_object
    # A default plane's normal is +Z; rotate it onto `n`.
    plane.rotation_mode = "QUATERNION"
    plane.rotation_quaternion = mathutils.Vector((0.0, 0.0, 1.0)).rotation_difference(n)
    mat = bpy.data.materials.new("probe_white")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfDiffuse")
    bsdf.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    plane.data.materials.append(mat)

    cam_data = bpy.data.cameras.new("probe_cam")
    cam_data.lens = 120.0  # narrow, so every sampled ray lands well inside the plane
    cam = bpy.data.objects.new("probe_cam", cam_data)
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    # Stand off along the plane's own normal and look back down it. A `TRACK_TO` constraint
    # reproduces Blender's look-at exactly (skill file); a hand-rolled euler is a second
    # implementation that can silently disagree.
    cam.location = n * 6.0
    target = bpy.data.objects.new("probe_target", None)
    bpy.context.collection.objects.link(target)
    target.location = (0.0, 0.0, 0.0)
    con = cam.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y" if abs(n.z) > 0.9 else "UP_Z"

    build_world()
    sc.render.filepath = tmp_png
    bpy.ops.render.render(write_still=True)
    path = tmp_png if tmp_png.endswith(".png") else tmp_png + ".png"
    _w, _h, px = read_png16(path)
    # Centre pixel only: the corners of even a narrow frame see the plane at a grazing angle.
    mid = px[len(px) // 2]
    lin = [_srgb_to_linear(c) * (2.0**-stops) for c in mid]
    if max(mid) > 0.999:
        raise RuntimeError(
            f"probe clipped at exposure {stops} stops (byte-normalised {mid}); "
            "lower PROBE_EXPOSURE_STOPS"
        )
    if max(lin) <= 0.0:
        raise RuntimeError(f"probe read pure black at exposure {stops} stops — world is unlit")
    # Rec.709 luminance: the probe is white, so this is the scalar irradiance.
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


# ── calibration ──────────────────────────────────────────────────────────────


def calibrate(sun_travel, base_sun_intensity: float, tmp_dir: str, stops: float,
              window_normal_three=None) -> dict:
    """Solve each condition's `dome_strength` against its Kasten & Czeplak target.

    Returns a dict keyed by condition carrying the solved world parameters plus the achieved
    irradiance ratio, which is the line to read before believing any render.
    """
    tmp = os.path.join(tmp_dir, "probe.png")

    def clear_world():
        W.build_world(
            "clear", sun_travel, clear_fraction=1.0, dome_strength=0.0,
            sun_intensity=base_sun_intensity,
        )

    def dome_unit_world():
        # Colour is irrelevant to the SOLVE (it is renormalised per condition below) but the
        # profile is not, so the unit dome is built exactly as a real one.
        W.build_world(
            "overcast", sun_travel, clear_fraction=0.0, dome_strength=1.0,
            sun_intensity=base_sun_intensity,
        )

    # The SOLVE is against the sky's own horizontal irradiance, so it runs WITHOUT the ground —
    # Kasten & Czeplak's transmittances are a property of the sky, and a ground under the probe
    # would fold the scene's own albedo into the calibration.
    e_clear = measure_horizontal_irradiance(clear_world, tmp, stops, ground=False)
    e_dome_unit = measure_horizontal_irradiance(dome_unit_world, tmp, stops, ground=False)
    print(f"  calibration: E_clear={e_clear:.6g}  E_dome(strength 1)={e_dome_unit:.6g}")

    # The clear sky's own DIFFUSE fraction, measured rather than assumed: the same node with
    # the disc switched off. This is the k_d the mixture arithmetic needs.
    def clear_dome_only():
        W.build_world(
            "clear", sun_travel, clear_fraction=1.0, dome_strength=0.0, sun_intensity=0.0,
        )

    e_clear_diffuse = measure_horizontal_irradiance(clear_dome_only, tmp, stops, ground=False)
    k_d = e_clear_diffuse / e_clear
    print(f"  clear-sky diffuse fraction k_d = {k_d:.4f} (beam {1 - k_d:.4f})")

    solved: dict[str, dict] = {}
    for cond in W.CONDITIONS:
        target = W.GLOBAL_TRANSMITTANCE[cond]
        a = W.CLEAR_FRACTION[cond]
        dome_target = target - a  # `a` scales the WHOLE clear sky, whose own E_h is 1 by norm
        if dome_target < -1e-9:
            raise ValueError(
                f"{cond}: clear fraction {a} already exceeds the target transmittance {target}"
            )
        strength = max(0.0, dome_target) * e_clear / e_dome_unit

        def build(c=cond, a=a, s=strength):
            return W.build_world(
                c, sun_travel, clear_fraction=a, dome_strength=s,
                sun_intensity=base_sun_intensity,
            )

        info = build()
        achieved = measure_horizontal_irradiance(build, tmp, stops, ground=False) / e_clear
        info.update(
            target_transmittance=round(target, 5),
            dome_target=round(dome_target, 5),
            achieved_transmittance=round(achieved, 5),
            achieved_over_target=round(achieved / target, 5),
        )
        if window_normal_three is not None:
            wn = S.three_to_blender(window_normal_three)
            info["vertical_window"] = round(
                measure_horizontal_irradiance(build, tmp, stops, normal=wn) / e_clear, 5
            )
        solved[cond] = info
        print(
            f"  {cond:<13} A={a:<4} dome={strength:9.4f}  target {target:.3f}  "
            f"achieved {achieved:.3f}  ({achieved / target:.3f}x)"
            + (
                f"   E_v(window) {solved[cond]['vertical_window']:.4f}"
                if window_normal_three is not None
                else ""
            )
        )
    return {
        "e_clear": e_clear,
        "e_dome_unit": e_dome_unit,
        "clear_diffuse_fraction": round(k_d, 5),
        "probe_exposure_stops": stops,
        "base_sun_intensity": base_sun_intensity,
        "conditions": solved,
    }


def kill_all_emissive() -> tuple[int, float]:
    """Zero every `Emission Strength` in the imported scene. Returns (materials, total strength).

    **This is not tidiness; without it the weather does not reach the picture.** `render_still.py
    --no-glazing-emissive` already exists for item `(z15)` — the panes' artistic sky-catch — but it
    selects through `render_visibility.find_glazing()`, and on a default-flat export that predicate
    matches **nothing**: it zeroed 0 sockets here. A census of the same GLB found **21 emissive
    materials**, including 52 instances of a 1.76 m cool-blue bar at strength 1.4 (the window's
    grille/mullion sky-catch) and the warm fixture-glow discs at 1.6–2.05.

    Measured consequence, and it is the reason this function exists: with them live, the interior
    mean of the `clear` and `overcast` arms agreed to **0.1 %** — and so did the GLAZING region,
    which is the one part of the frame that cannot possibly be weather-invariant. The room was
    being lit by the app's own look devices, not by the sky, so every ratio was 1.000.

    Two things follow that are worth knowing beyond this feature. **`lightOn: 'no'` per item does
    NOT extinguish the fixture GLOW** — it removes the point light (`manifest.lights.point` is
    empty) while `fixtureGlow`'s emissive rides `lightsMode`, which the export left at `'on'`. And
    every emitter here is a LOOK device rather than a physical source, so a daylight reference is
    more faithful without them, not less.
    """
    killed = 0
    total = 0.0
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        hit = False
        for node in mat.node_tree.nodes:
            if not hasattr(node, "inputs"):
                continue
            sock = node.inputs.get("Emission Strength")
            if sock is None or sock.is_linked:
                continue
            if sock.default_value > 0:
                total += float(sock.default_value)
                sock.default_value = 0.0
                hit = True
        if hit:
            killed += 1
    return killed, total


# ── driver ───────────────────────────────────────────────────────────────────


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="render_weather.py")
    p.add_argument("--dir", required=True, help="a BLENDREF directory (manifest.json + scene.glb)")
    p.add_argument("--conditions", default=",".join(W.CONDITIONS))
    p.add_argument("--samples", type=int, default=96)
    p.add_argument("--res", default=None)
    p.add_argument("--device", default="GPU", choices=("CPU", "GPU"))
    p.add_argument("--section-cut", type=float, default=None, dest="section_cut")
    p.add_argument("--prefix", default="w-")
    p.add_argument("--calibrate-only", action="store_true")
    p.add_argument("--linear-stops", type=float, default=None, dest="linear_stops",
                   help="ALSO write a LINEAR-RECOVERABLE 16-bit PNG per condition "
                        "(`wl-<condition>.png`): `--view-transform Standard` at this exposure in "
                        "stops, so `linear = srgb_to_linear(byte) * 2^-stops` exactly. This is "
                        "the arm to measure from. The AgX PNG is for looking at and the .exr "
                        "cannot be read without a library, while Blender's own in-process "
                        "readback is not trustworthy on this build (see the module docstring) -- "
                        "so the measurable output is a PNG whose transform is invertible in "
                        "closed form. 16-bit because 8-bit sRGB quantises the shadow end, which "
                        "is exactly where an overcast room lives.")
    p.add_argument("--probe-stops", type=float, default=PROBE_EXPOSURE_STOPS)
    p.add_argument("--no-ground", action="store_true", dest="no_ground",
                   help="do NOT add the ground plane. See GROUND_DEPTH_M for why it is on: "
                        "without it the clear arm loses the sunlit ground outside the window, "
                        "which at a near-zenith sun is the LARGEST contributor to a vertical "
                        "window's illuminance.")
    p.add_argument("--keep-glazing", action="store_true", dest="keep_glazing",
                   help="do NOT delete the window glazing. Off by default because with the panes "
                        "in place NO DAYLIGHT REACHES THE ROOM AT ALL in Cycles: measured on the "
                        "default-flat export at the living/dining pose (Standard, +3 stops), the "
                        "sealed scene with every emissive zeroed renders at interior mean 2.3e-6 "
                        "-- black -- while deleting the 9 glazing objects gives 235/255. The "
                        "panes carry `Transmission Weight` 0.92, so this is not an opaque "
                        "material: light through a refractive surface onto a diffuse one is a "
                        "CAUSTIC path and Cycles' next-event estimation cannot sample the sky "
                        "through it. `docs/skills/blender.md` already records the mirror image of "
                        "this for visibility bakes ('whitening every material SEALS THE "
                        "WINDOWS'). The cost is the pane's ~8 %% loss and its tint, both "
                        "weather-INDEPENDENT, so they cancel in every ratio quoted here.")
    p.add_argument("--keep-emissive", action="store_true", dest="keep_emissive",
                   help="do NOT zero the exported emissive materials. Off by default because a "
                        "weather reference has to be lit by the SKY: see `kill_all_emissive`.")
    p.add_argument("--sun-intensity", type=float, default=1.0, dest="sun_intensity",
                   help="`ShaderNodeTexSky.sun_intensity`, i.e. the DISC multiplier. Default 1.0 "
                        "= the physical sun. NOTE this deliberately differs from the rest of the "
                        "arc: `render_still.py --sun-energy` defaults to 3.0 and is passed "
                        "straight into this socket, so every existing Cycles reference renders a "
                        "sun THREE TIMES its physical strength. Measured here, that leaves the "
                        "clear sky's diffuse share at 3.4 %% of global against a real ~13-17 %% "
                        "-- and this whole study is about moving energy between the beam and the "
                        "diffuse share, so it has to start from a physical split or the cloudy "
                        "arms are normalised against an inflated clear total.")
    return p.parse_args(cli_argv.normalise(p, argv))


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    d = os.path.abspath(a.dir)
    with open(os.path.join(d, "manifest.json")) as fh:
        manifest = json.load(fh)
    directional = (manifest.get("lights") or {}).get("directional") or []
    if not directional:
        raise ValueError("manifest has no directional light — there is no sun to place a sky by")
    sun_travel = tuple(directional[0]["travel"])

    base_sun_intensity = a.sun_intensity

    # The window faces the way the walk camera is LOOKING at this pose — the manifest records
    # that forward vector, so `E_v` is measured on the surface the room is actually lit through
    # rather than on a horizontal plane nothing in the scene is parallel to.
    fwd = (manifest.get("camera") or {}).get("forward")
    cal = calibrate(sun_travel, base_sun_intensity, d, a.probe_stops,
                    window_normal_three=tuple(fwd) if fwd else None)
    with open(os.path.join(d, "weather-calibration.json"), "w", encoding="utf-8") as fh:
        json.dump(cal, fh, indent=1)
    if a.calibrate_only:
        print(json.dumps(cal["conditions"], indent=1))
        return 0

    # `render_from_manifest.py` exposes no `--device`, and `render_still.py` defaults to CPU —
    # which is ~6x slower than Metal on this build (`docs/skills/blender.md`, Cycles device).
    # Overriding the ONE call that selects it keeps the device a driver concern without adding a
    # flag to a script this change does not own. `enable_gpu()` inside `setup_cycles` is what
    # actually resolves Metal, and `device_report()` lands in each render's JSON line, so a
    # silent fall back to CPU is visible rather than looking like a slow GPU.
    original_setup = S.setup_cycles

    def setup_on(*args, device="CPU", **kw):  # noqa: ARG001 — `device` is the point
        out = original_setup(*args, device=a.device, **kw)
        if a.linear_stops is not None:
            # `setup_cycles` pins PNG 8-bit; the linear arm needs 16.
            bpy.context.scene.render.image_settings.color_depth = "16"
            bpy.context.scene.render.image_settings.color_mode = "RGB"
            bpy.context.scene.render.dither_intensity = 0
        return out

    # The emissive sweep has to run AFTER `import_glb` and BEFORE the render. `render_still.py`
    # offers no hook there, so it rides the camera placement — the last thing it does before
    # `render_png`. Wrapping a call that is guaranteed to happen exactly once per render is the
    # same seam the world swap uses, and it keeps every edit inside this file.
    original_place = S.place_camera_from_three

    def place_and_strip(*args, **kw):
        out = original_place(*args, **kw)
        if not a.keep_emissive:
            n, tot = kill_all_emissive()
            print(f"  kill_all_emissive: zeroed {n} material(s), total strength {tot:.2f}")
        if not a.keep_glazing:
            removed, _names = RV.open_apertures()
            print(f"  open_apertures: deleted {removed} glazing object(s)")
        if not a.no_ground:
            add_ground()
            print(f"  add_ground: Lambertian albedo {GROUND_ALBEDO} at -{GROUND_DEPTH_M} m")
        return out

    original = S.setup_world_sky_from_three_direction
    S.setup_cycles = setup_on
    S.place_camera_from_three = place_and_strip
    try:
        for cond in [c.strip() for c in a.conditions.split(",") if c.strip()]:
            if cond not in W.CONDITIONS:
                raise ValueError(f"unknown condition {cond!r}; expected one of {W.CONDITIONS}")
            params = cal["conditions"][cond]

            def patched(travel, strength=1.0, sun_intensity=1.0, _c=cond, _p=params, **kw):
                """Stand in for the one-sky builder `render_still.py` reaches through."""
                return W.build_world(
                    _c,
                    travel,
                    clear_fraction=_p["clear_fraction"],
                    dome_strength=_p["dome_strength"],
                    sun_intensity=sun_intensity,
                )

            S.setup_world_sky_from_three_direction = patched
            out = os.path.join(d, f"{a.prefix}{cond}.png")
            # `--sun-energy` is `render_still.py`'s name for the sky node's `sun_intensity`, so
            # passing it here is what makes the rendered disc agree with the calibrated one
            # rather than the 3.0 default the rest of the arc inherits.
            # `--no-glazing-emissive` is NOT optional here, and it was found the hard way.
            # Item `(z15)`: the app's window panes carry an artistic sky-catch EMISSIVE that is
            # exported into the GLB, and Cycles treats it as a real emitter. It therefore lights
            # the room by itself, independently of the sky — measured, the first four-arm run came
            # back with the interior mean, p95 and even the GLAZING region all agreeing to within
            # 0.1 % across clear/partlyCloudy/overcast/rain, i.e. the weather did not reach the
            # picture at all. The exterior control is what caught it: a window is the one region
            # that CANNOT be weather-invariant.
            flags = ["--dir", d, "--out", out, "--samples", str(a.samples),
                     "--sun-energy", str(base_sun_intensity), "--no-glazing-emissive"]
            # The APERTURES are opened in `place_and_strip` above rather than by a flag here:
            # `--open-apertures` belongs to `render_still.py` and `render_from_manifest.py` does
            # not forward it. See `--keep-glazing` for why it is not optional.
            if a.res:
                flags += ["--res", a.res]
            if a.section_cut is not None:
                flags += ["--section-cut", str(a.section_cut)]
            if a.linear_stops is not None:
                out = os.path.join(d, f"wl-{cond}.png")
                flags = [f if f != os.path.join(d, f"{a.prefix}{cond}.png") else out for f in flags]
                flags += ["--view-transform", "Standard",
                          "--exposure", str(a.linear_stops), "--no-linear-exr"]
            print(f"\n== {cond} -> {out}")
            render_from_manifest.main(flags)
    finally:
        S.setup_world_sky_from_three_direction = original
        S.setup_cycles = original_setup
        S.place_camera_from_three = original_place
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
