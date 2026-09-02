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
