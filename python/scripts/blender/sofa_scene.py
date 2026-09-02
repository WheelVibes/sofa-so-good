"""Shared Blender/Cycles scene helpers for sofa-so-good.

Every bpy entry point in this repo — the Part B standalone scripts and the render
service the app calls — goes through this module, so there is exactly one place
that knows how our scenes are built.

VERIFIED AGAINST THE INSTALLED BUILD: **Blender 5.2.1 LTS** (build 2026-08-25),
`bpy.app.version == (5, 2, 1)`. The notes below were measured on that build, not
recalled — see `.claude/skills/blender/SKILL.md` for the probe transcripts.

Three facts that bite if assumed rather than checked:

1. **Cycles is assignable but does not appear in the engine enum.**
   `RenderSettings.bl_rna.properties['engine'].enum_items` lists only
   `BLENDER_EEVEE` under `--factory-startup`, yet `scene.render.engine = 'CYCLES'`
   succeeds and renders. So NEVER gate on the enum — a validity check against it
   falsely concludes Cycles is unavailable.

2. **`view_transform` is likewise dynamic** (OCIO-driven): its `enum_items` reads
   only `NONE` while the actual default is **AgX**. Convenient for us — the app's
   three.js tiers also tone-map with AgX, so leaving the default alone is the
   closest match rather than a thing to configure.

3. **Principled BSDF sockets use the 4.x+/5.x names.** There is no `Specular` and
   no scalar `Subsurface`; it is `Specular IOR Level`, `Transmission Weight`,
   `Coat Weight`, `Emission Color`/`Emission Strength`, plus 5.x's `Thin Wall`,
   `Diffuse Roughness` and `Thin Film IOR`. Writing a 3.x socket name raises
   `KeyError` at best and silently does nothing at worst.
"""

from __future__ import annotations

import math
import os

import bpy
from mathutils import Vector

#: Socket names on the installed build, so callers never hardcode a 3.x name.
PRINCIPLED = {
    "base_color": "Base Color",
    "metallic": "Metallic",
    "roughness": "Roughness",
    "ior": "IOR",
    "alpha": "Alpha",
    "emission_color": "Emission Color",
    "emission_strength": "Emission Strength",
    "specular_ior_level": "Specular IOR Level",
    "transmission_weight": "Transmission Weight",
    "coat_weight": "Coat Weight",
}


def blender_version() -> tuple[int, int, int]:
    """The running build, for scripts that want to assert their assumptions."""
    return tuple(bpy.app.version)  # type: ignore[return-value]


def reset_scene() -> None:
    """Empty the factory startup scene (cube + light + camera).

    `--factory-startup` gives a default cube, a point light and a camera; every
    one of them would otherwise appear in the render. Deleting datablocks rather
    than objects also drops the orphaned meshes, so repeated imports in one
    session do not accumulate.
    """
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def import_glb(path: str) -> list[bpy.types.Object]:
    """Import a GLB and return the objects it created.

    `bpy.ops.import_scene.gltf` and `bpy.ops.wm.gltf_import` both exist on 5.2.1;
    the former is the long-standing name and is used here. glTF is +Y up and
    metres, matching our exporter (`src/export/sceneGltf.ts`), so no unit or axis
    conversion is applied — the importer's default `+Y up` handling is correct for
    us and overriding it silently rotates the whole scene.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"GLB not found: {path}")
    # Pre-pass for an importer bug in this Blender build: a material carrying
    # `KHR_materials_dispersion` with no properties aborts the ENTIRE import. Lossless
    # and a no-op when there is nothing to fix -- see `glb_fix` for the diagnosis.
    import glb_fix

    path, fixed = glb_fix.strip_noop_dispersion(path)
    if fixed:
        print(f"[sofa_scene] stripped no-op KHR_materials_dispersion from {fixed} material(s)")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def setup_cycles(samples: int = 64, res: tuple[int, int] = (1280, 720), device: str = "CPU") -> None:
    """Select Cycles and set sampling/resolution.

    Assigned directly — see note 1 in the module docstring on why the engine enum
    must not be consulted. Adaptive sampling is left on (5.2.1 default) so the
    `samples` figure is a ceiling rather than a fixed cost.
    """
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = device
    sc.cycles.samples = samples
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.film_transparent = False


def setup_world_hdri(hdr_path: str, strength: float = 1.0, rotation_deg: float = 0.0) -> None:
    """Light the scene from an equirectangular HDRI.

    Rotation is applied via a Mapping node on the environment's vector rather than
    by rotating the world, because the app exposes HDRI orientation the same way
    and a world rotation would also turn any sun added afterwards.
    """
    if not os.path.exists(hdr_path):
        raise FileNotFoundError(f"HDRI not found: {hdr_path}")
    world = bpy.data.worlds.new("sofa_world") if not bpy.data.worlds else bpy.data.worlds[0]
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    mapping = nt.nodes.new("ShaderNodeMapping")
    texco = nt.nodes.new("ShaderNodeTexCoord")
    env.image = bpy.data.images.load(hdr_path, check_existing=True)
    bg.inputs["Strength"].default_value = strength
    mapping.inputs["Rotation"].default_value[2] = math.radians(rotation_deg)
    nt.links.new(texco.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def add_sun(elevation_deg: float, azimuth_deg: float, energy: float = 3.0,
            color: tuple[float, float, float] = (1.0, 0.95, 0.9)) -> bpy.types.Object:
    """Add a directional sun from angles **in degrees**.

    ⚠️ **The app's values are RADIANS, not degrees.** `src/scene/lighting/sunPosition.ts`
    returns `SunCalc.getPosition`'s output unchanged and feeds `altitude` straight to
    `Math.cos`/`Math.sin`. Forwarding a store value into this function would be wrong by
    57.3×, and — because every plausible solar altitude in radians (0–1.5) is also a
    plausible-looking altitude in degrees — it would render as a *believable* low sun
    rather than failing. Programmatic callers should use `add_sun_from_app()`, which takes
    radians and makes the unit part of the function name instead of a thing to remember.

    Degrees are kept here because this is what the CLI flags carry (`--sun-elevation 45`).
    """
    data = bpy.data.lights.new("sun", type="SUN")
    data.energy = energy
    data.color = color
    obj = bpy.data.objects.new("sun", data)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = (
        math.radians(90.0 - elevation_deg),
        0.0,
        math.radians(azimuth_deg),
    )
    return obj


def add_sun_from_app(altitude_rad: float, azimuth_rad: float, energy: float = 3.0,
                     color: tuple[float, float, float] = (1.0, 0.95, 0.9)) -> bpy.types.Object:
    """Add a sun from the app's own angles, which are **radians**.

    Exists so Part A's service can forward `sunPosition()` output directly and the unit is
    settled by which function you call, not by remembering to convert. `add_sun()` takes
    degrees for the CLI; this takes radians for the app. Nothing takes "an angle".
    """
    return add_sun(math.degrees(altitude_rad), math.degrees(azimuth_rad), energy, color)


def place_camera(location: tuple[float, float, float],
                 look_at: tuple[float, float, float] | None = None,
                 fov_deg: float = 50.0,
                 fov_axis: str = "vertical") -> bpy.types.Object:
    """Create the active camera at `location`, optionally aimed at `look_at`.

    ⚠️ **`fov_axis` is not decoration.** three.js's `PerspectiveCamera.fov` is the
    **VERTICAL** field of view, while Blender's `camera.angle` under the default
    `sensor_fit = 'AUTO'` is the angle along the **larger** sensor dimension —
    horizontal for any landscape render. Passing three's vertical FOV straight into
    an AUTO camera therefore yields a *wider* frame than the app shows, and the
    error grows with aspect ratio: at 16:9 a 50° vertical FOV is ~78° horizontal.
    A matched-pose comparison would silently be comparing different framings, which
    is precisely the confound `.247` spent a round on.

    So the default is `vertical`, matching three, and it is enforced by setting
    `sensor_fit` rather than by converting — the axis is stated in the data, not
    remembered by the caller.

    Aiming uses a TRACK_TO constraint on an empty rather than trigonometry, so the
    result matches Blender's own look-at behaviour exactly (including roll) and
    there is no chance of a hand-rolled euler disagreeing with it.
    """
    if fov_axis not in ("vertical", "horizontal"):
        raise ValueError(f"fov_axis must be 'vertical' or 'horizontal', got {fov_axis!r}")
    data = bpy.data.cameras.new("camera")
    data.sensor_fit = "VERTICAL" if fov_axis == "vertical" else "HORIZONTAL"
    data.lens_unit = "FOV"
    data.angle = math.radians(fov_deg)
    cam = bpy.data.objects.new("camera", data)
    bpy.context.collection.objects.link(cam)
    cam.location = location
    bpy.context.scene.camera = cam
    if look_at is not None:
        target = bpy.data.objects.new("cam_target", None)
        bpy.context.collection.objects.link(target)
        target.location = look_at
        con = cam.constraints.new("TRACK_TO")
        con.target = target
        con.track_axis = "TRACK_NEGATIVE_Z"
        con.up_axis = "UP_Y"
    return cam


def setup_world_sky_from_three_direction(travel_dir_three: tuple[float, float, float],
                                         strength: float = 1.0,
                                         sun_intensity: float = 1.0,
                                         sun_disc: bool = True,
                                         ground_albedo: float = 0.3,
                                         sky_type: str = "MULTIPLE_SCATTERING") -> dict:
    """Light the scene with a **physically-based atmospheric sky** placed by the app's sun.

    This is what makes Cycles usable as an *absolute* reference rather than another
    thing to calibrate. The app's own light intensities are artistic — its sun sits at
    ~1.0, which is neither watts nor a plausible lux for sunlight (~100 000 lx) — so
    matching Cycles to them would make the reference agree with the very thing under
    measurement. Instead the atmosphere model supplies sky *and* sun radiance from a sun
    position, and the app's distance from it is then the measurement.

    ⚠️ **There is no `NISHITA` on this build.** Blender 5.2.1's `sky_type` enum is
    `HOSEK_WILKIE`, `MULTIPLE_SCATTERING`, `PREETHAM`, `SINGLE_SCATTERING`, defaulting to
    `MULTIPLE_SCATTERING` — the Nishita successor. Code written against 4.x's `NISHITA`
    raises on assignment.

    With `sun_disc=True` the sky node carries the sun itself, so **no separate SUN lamp is
    added** — one physical source rather than a lamp whose energy would be a second free
    parameter to invent.

    Returns the derived angles so a caller can log/verify them rather than trust them.
    """
    # The app's vector is the direction light TRAVELS; the sun sits the other way.
    tx, ty, tz = travel_dir_three
    bx, by, bz = three_to_blender((-tx, -ty, -tz))
    n = Vector((bx, by, bz))
    if n.length < 1e-9:
        raise ValueError("sun direction is zero-length")
    n.normalize()
    elevation = math.asin(max(-1.0, min(1.0, n.z)))
    rotation = math.atan2(n.y, n.x)

    world = bpy.data.worlds.new("sofa_sky") if not bpy.data.worlds else bpy.data.worlds[0]
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = sky_type
    sky.sun_elevation = elevation
    sky.sun_rotation = rotation
    sky.sun_intensity = sun_intensity
    sky.sun_disc = sun_disc
    sky.ground_albedo = ground_albedo
    bg.inputs["Strength"].default_value = strength
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return {
        "sky_type": sky_type,
        "sun_elevation_deg": round(math.degrees(elevation), 3),
        "sun_rotation_deg": round(math.degrees(rotation), 3),
        "sun_disc": sun_disc,
        "sun_intensity": sun_intensity,
        "strength": strength,
    }


def add_sun_from_three_direction(travel_dir_three: tuple[float, float, float],
                                 energy: float = 3.0,
                                 color: tuple[float, float, float] = (1.0, 0.95, 0.9)
                                 ) -> bpy.types.Object:
    """Add a sun from the light's **travel direction** in three.js space.

    Preferred over both `add_sun` (degrees) and `add_sun_from_app` (radians): a vector
    in a named frame has no angle convention to get wrong, no degrees/radians question,
    and no azimuth-zero-direction question. Read it off the app's actual
    `DirectionalLight` as `normalize(target - position)` and pass it straight in — what
    the app really did, rather than a re-derivation of it.

    A Blender SUN emits along its local **−Z**, so the rotation is built with
    `to_track_quat('-Z', 'Y')` rather than by composing eulers.
    """
    d = Vector(three_to_blender(travel_dir_three))
    if d.length < 1e-9:
        raise ValueError("travel direction is zero-length")
    d.normalize()
    data = bpy.data.lights.new("sun", type="SUN")
    data.energy = energy
    data.color = color
    obj = bpy.data.objects.new("sun", data)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return obj


def three_to_blender(v: tuple[float, float, float]) -> tuple[float, float, float]:
    """Convert a three.js / glTF **Y-up** vector to Blender's **Z-up** frame.

    VERIFIED on this build: importing `pool-table-6ft.glb` yields extents
    x=1.93, y=1.073, **z=0.80** with `z_min = 0.0` — i.e. the table's *height* lands on
    Z and it sits on the floor, so `bpy.ops.import_scene.gltf` applies the Y-up → Z-up
    conversion to geometry.

    That means **camera and light positions taken from the app must be converted too**,
    or they land somewhere else entirely while the geometry is correct. glTF is Y-up,
    right-handed; Blender is Z-up, right-handed; the mapping is
    `(x, y, z) → (x, −z, y)`.

    Third instance of the implicit-frame class in this bridge, after radians/degrees on
    the sun and vertical/horizontal on the FOV. Hence a named function rather than an
    inline expression: the frame is stated at the call site.
    """
    x, y, z = v
    return (x, -z, y)


def place_camera_from_three(location_three: tuple[float, float, float],
                            look_at_three: tuple[float, float, float] | None = None,
                            fov_deg_vertical: float = 50.0) -> bpy.types.Object:
    """Place the camera from **three.js-space** coordinates and a **vertical** FOV.

    The two conversions this bridge keeps getting wrong, both applied and both named:
    Y-up → Z-up on the positions, and vertical FOV (three's `PerspectiveCamera.fov`)
    pinned via `sensor_fit`. A caller forwarding app values should use *this*, never
    `place_camera`.
    """
    return place_camera(
        three_to_blender(location_three),
        look_at=three_to_blender(look_at_three) if look_at_three is not None else None,
        fov_deg=fov_deg_vertical,
        fov_axis="vertical",
    )


def render_png(out_path: str) -> str:
    """Render the active camera to `out_path` and return it."""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    return out_path


def scene_bounds() -> tuple[tuple[float, float, float], float]:
    """World-space centre and bounding radius of every mesh object.

    Used to frame a camera on an imported asset of unknown size. Corners are
    transformed by `matrix_world` rather than read from `object.dimensions`,
    because `dimensions` is local and ignores parent transforms — and an imported
    glTF hierarchy is almost always parented, so the local reading is wrong for
    exactly the assets this is for.
    """
    pts: list[Vector] = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        pts.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
    if not pts:
        return ((0.0, 0.0, 0.0), 1.0)
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    centre = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2)
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    return (centre, max(span / 2, 1e-3))
