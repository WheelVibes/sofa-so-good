"""Weather-conditioned Cycles world: clear / partly cloudy / overcast / rain.

`sofa_scene.setup_world_sky_from_three_direction` builds ONE sky — Blender's atmospheric
model with the sun disc in it — which is a **cloudless** sky by construction. There is no
`cloudiness` input on `ShaderNodeTexSky`, so an overcast reference cannot be produced by
tweaking it, and that is why `v0.34.1.12` had to record "weather cannot be compared" as a gap.

## The model, and where every number comes from

An overcast sky is not a dimmer clear sky. It is a *different distribution*: the direct beam
is gone and the whole dome becomes the source. So the world here is the sum of two terms —

    world  =  A · SkyTexture(sun disc scaled)   +   B · CIE-overcast grey dome

- **`A` is the CLEAR FRACTION of the dome.** It scales the atmospheric sky node, which
  carries both the blue dome and the sun disc, so one number takes the beam and the blue sky
  down together. That is right: with half the sky covered, half the blue dome is hidden and
  (time-averaged) the sun is behind cloud half the time.
- **`B` is the CLOUD DOME.** A cloud deck is a bright, near-neutral, near-uniform source —
  the thing that replaces the beam rather than merely removing it.

The targets are **Kasten & Czeplak (1980)** global-radiation transmittances, relative to the
clear-sky global horizontal irradiance at the same sun position:

| condition | model | G / G_clear |
| --- | --- | --- |
| `clear` | N = 0 oktas | 1.00 |
| `partlyCloudy` | N = 4 oktas, `G/G₀ = 1 − 0.75·(N/8)^3.4` | 0.929 |
| `overcast` | stratus (St), their per-cloud-type mean | 0.18 |
| `rain` | nimbostratus (Ns), their per-cloud-type mean | 0.16 |

Two consequences worth stating before anyone "corrects" them:

- **Rain is only ~11 % darker than plain overcast** (0.16 vs 0.18). The dramatic part of a
  rainy room is not its level; it is the colour and the dead-flat shading.
- **Partly cloudy is barely darker than clear at all** (0.93). Its whole visible effect is
  the redistribution — half the beam, three times the dome.

`A` for `partlyCloudy` is the cover fraction (0.5 at 4 oktas). `B` is then whatever makes the
total horizontal irradiance hit the table, and it is **calibrated by rendering**, not asserted:
`measure_horizontal_irradiance()` puts a white Lambertian plane under the world and reads the
linear radiance off it, which is `E_h · albedo / π`. So the clear-sky diffuse fraction — the
one number this model would otherwise have to assume — is *measured from the same sky node the
reference uses*, by rendering it once with the disc on and once with it off.

## Angular shape and colour

The cloud dome follows the **CIE Standard Overcast Sky**, `L(θ) = L_z·(1 + 2·cos θ)/3` — the
zenith is three times the horizon. Below the horizon it is a constant ground term derived from
the same `ground_albedo = 0.3` the clear arm uses: integrating the CIE profile gives
`E_h = (7π/9)·L_z`, so a Lambertian ground of albedo ρ radiates `ρ·E_h/π = 0.233·L_z`.

Colour comes from the **CIE daylight locus** at the condition's correlated colour temperature
(`daylight_linear_srgb`), not from a picked hex. D65 is the sRGB white point, so a 6500 K
overcast dome is exactly neutral in this pipeline while the clear sky's *global* illuminant
(sun + blue sky, ~5500 K) is warm — which is the whole reason an overcast room reads cooler.

## Verified bpy facts this file depends on

- `ShaderNodeTexCoord` → `Generated` in a WORLD shader is the **world-space view-ray
  direction**: probed on this build, looking straight down reads `z = −0.99` and straight up
  `z = +1`. (`Geometry → Incoming` also works but is the *reverse* on some builds; do not
  swap them without re-probing.)
- The angular profile is carried on the Background node's **Strength** (a scalar socket) and
  the chroma on its **Color**, so no `Mix`/`MixRGB` node is needed — those were renamed
  between 3.x and 4.x and are the kind of thing that breaks silently.
- `ShaderNodeTexSky.sun_intensity` scales **only the disc**, so the beam and the dome are
  separable: `sun_intensity = beam / A` with Background strength `A` lands the disc at `beam`
  and the dome at `A`.
"""

from __future__ import annotations

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sofa_scene as S  # noqa: E402

#: Ordered lightest → heaviest, matching `WEATHER_CONDITIONS` in `src/state/slices/timeSlice.ts`.
CONDITIONS = ("clear", "partlyCloudy", "overcast", "rain")

#: Kasten & Czeplak (1980) global transmittance relative to the clear sky at the same sun
#: position. `partlyCloudy` is their cover formula at 4 oktas; `overcast`/`rain` are their
#: per-cloud-type means for stratus and nimbostratus.
GLOBAL_TRANSMITTANCE = {
    "clear": 1.0,
    "partlyCloudy": 1.0 - 0.75 * (4.0 / 8.0) ** 3.4,
    "overcast": 0.18,
    "rain": 0.16,
}

#: Fraction of the sky dome still showing clear blue (and, time-averaged, the fraction of the
#: time the disc is unobscured). 4 oktas → 0.5; a full deck → 0.
CLEAR_FRACTION = {"clear": 1.0, "partlyCloudy": 0.5, "overcast": 0.0, "rain": 0.0}

#: Correlated colour temperature of the CLOUD dome, K. A stratus deck sits near D65 (which is
#: the sRGB white point, so it renders neutral); a rain-bearing nimbostratus deck is thicker,
#: scatters more at short wavelengths out of the beam and reads colder.
CLOUD_CCT = {"partlyCloudy": 6500.0, "overcast": 6600.0, "rain": 7300.0}

#: `ShaderNodeTexSky.ground_albedo` for the clear component. It TINTS THE SKY and does not create
#: a lit lower hemisphere — which is why `render_weather.py` adds a real Lambertian ground plane.
GROUND_ALBEDO = 0.3

#: Radiance of the cloud dome BELOW the horizon, as a fraction of its zenith. **Zero, and that is
#: a correction.** The first version put a synthetic ground term here, derived from the CIE
#: integral (`ρ·E_h/π = 0.233·L_z`). With `render_weather.py`'s real ground plane in the scene that
#: double-counts the ground — and not harmlessly: the synthetic term was BRIGHTER than a real
#: albedo-0.2 ground, so adding the real ground made the overcast arm's vertical irradiance at the
#: window FALL, 0.0572 → 0.0183, which is physically impossible and is what exposed it. A sky model
#: should model the sky; the ground is geometry. Kept as a named constant so the removal is visible
#: rather than an absence.
GROUND_OVER_ZENITH = 0.0


def daylight_linear_srgb(cct: float) -> tuple[float, float, float]:
    """CIE D-series daylight chromaticity at `cct` K → **linear sRGB**, normalised to LUMINANCE 1.

    Derived rather than picked so "an overcast sky is cooler" is a consequence of the colour
    temperature rather than of a hex somebody liked. D65 comes back at (1, 1, 1) to within
    rounding, which is the check that the chain is right: D65 *is* the sRGB white point.

    **Normalised by Rec. 709 luminance, not by peak channel** — the same rule
    `altitudeCurve.ts:daytimeSkyTint()` follows, and for the same reason. Peak-normalising makes
    a bluer dome dimmer at the same strength, so the irradiance solve would land ~9 % short for
    `rain` purely because of its colour temperature (measured: achieved/target 0.910). Carrying
    chroma only keeps strength and irradiance proportional at every CCT.
    """
    t = float(cct)
    if t < 4000 or t > 25000:
        raise ValueError(f"CIE daylight locus is defined for 4000–25000 K, got {t}")
    if t <= 7000:
        x = -4.6070e9 / t**3 + 2.9678e6 / t**2 + 0.09911e3 / t + 0.244063
    else:
        x = -2.0064e9 / t**3 + 1.9018e6 / t**2 + 0.24748e3 / t + 0.237040
    y = -3.000 * x * x + 2.870 * x - 0.275
    # xyY (Y = 1) → XYZ → linear sRGB (sRGB primaries, D65 white).
    big_x = x / y
    big_z = (1.0 - x - y) / y
    r = 3.2406 * big_x - 1.5372 * 1.0 - 0.4986 * big_z
    g = -0.9689 * big_x + 1.8758 * 1.0 + 0.0415 * big_z
    b = 0.0557 * big_x - 0.2040 * 1.0 + 1.0570 * big_z
    rgb = [max(0.0, v) for v in (r, g, b)]
    luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    if luma <= 0:
        return (1.0, 1.0, 1.0)
    return (rgb[0] / luma, rgb[1] / luma, rgb[2] / luma)


def sun_angles_from_three(travel_dir_three: tuple[float, float, float]) -> tuple[float, float]:
    """(elevation, rotation) in radians for `ShaderNodeTexSky`, from the app's sun TRAVEL vector.

    Same conversion `sofa_scene.setup_world_sky_from_three_direction` does — the app's vector
    points where light *goes*, so the sun is the other way, and three is Y-up while Blender is
    Z-up.
    """
    tx, ty, tz = travel_dir_three
    bx, by, bz = S.three_to_blender((-tx, -ty, -tz))
    n = math.sqrt(bx * bx + by * by + bz * bz)
    if n < 1e-9:
        raise ValueError("sun direction is zero-length")
    bx, by, bz = bx / n, by / n, bz / n
    return math.asin(max(-1.0, min(1.0, bz))), math.atan2(by, bx)


def _world() -> bpy.types.World:
    w = bpy.data.worlds[0] if bpy.data.worlds else bpy.data.worlds.new("sofa_weather")
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes.clear()
    return w


def _cie_overcast_dome(nt, strength: float, colour: tuple[float, float, float]):
    """A Background node whose Strength carries the CIE overcast profile. Returns the node.

    `L(θ) = L_z·(1 + 2·cos θ)/3` above the horizon, a constant ground term below it. The
    profile rides **Strength** (scalar) so the graph needs only `Math` nodes, which have not
    been renamed across Blender versions the way the mix nodes have.
    """
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (colour[0], colour[1], colour[2], 1.0)
    if strength <= 0:
        bg.inputs["Strength"].default_value = 0.0
        return bg

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    z = sep.outputs["Z"]  # +1 straight up, −1 straight down (probed, see module docstring)

    # sky = (1 + 2z)/3  — clamped at 0 so the branch below the horizon cannot go negative.
    prof = nt.nodes.new("ShaderNodeMath")
    prof.operation = "MULTIPLY_ADD"
    prof.inputs[1].default_value = 2.0 / 3.0
    prof.inputs[2].default_value = 1.0 / 3.0
    prof.use_clamp = True
    nt.links.new(z, prof.inputs[0])

    # mask = z > 0 (1 above the horizon, 0 below)
    mask = nt.nodes.new("ShaderNodeMath")
    mask.operation = "GREATER_THAN"
    mask.inputs[1].default_value = 0.0
    nt.links.new(z, mask.inputs[0])

    # value = mask·sky + (1 − mask)·ground, written as ground + mask·(sky − ground) so it is
    # three Math nodes and no mix node.
    delta = nt.nodes.new("ShaderNodeMath")
    delta.operation = "SUBTRACT"
    delta.inputs[1].default_value = GROUND_OVER_ZENITH
    nt.links.new(prof.outputs[0], delta.inputs[0])

    gated = nt.nodes.new("ShaderNodeMath")
    gated.operation = "MULTIPLY"
    nt.links.new(delta.outputs[0], gated.inputs[0])
    nt.links.new(mask.outputs[0], gated.inputs[1])

    scaled = nt.nodes.new("ShaderNodeMath")
    scaled.operation = "MULTIPLY_ADD"  # (gated + ground) · strength, via a·b + c
    scaled.inputs[1].default_value = strength
    scaled.inputs[2].default_value = GROUND_OVER_ZENITH * strength
    nt.links.new(gated.outputs[0], scaled.inputs[0])
    nt.links.new(scaled.outputs[0], bg.inputs["Strength"])
    return bg


def build_world(
    condition: str,
    sun_travel_three: tuple[float, float, float],
    *,
    clear_fraction: float,
    dome_strength: float,
    sun_intensity: float = 1.0,
    sky_type: str = "MULTIPLE_SCATTERING",
) -> dict:
    """Assemble `A · SkyTexture + B · CIE-dome` for one condition. Returns what it built.

    `sun_intensity` is the DISC multiplier *before* `clear_fraction` scales the whole sky node,
    so the caller passes `beam / clear_fraction` to land the beam at `beam`.
    """
    elevation, rotation = sun_angles_from_three(sun_travel_three)
    w = _world()
    nt = w.node_tree
    out = nt.nodes.new("ShaderNodeOutputWorld")
    shaders = []

    if clear_fraction > 0:
        sky = nt.nodes.new("ShaderNodeTexSky")
        sky.sky_type = sky_type
        sky.sun_elevation = elevation
        sky.sun_rotation = rotation
        sky.sun_intensity = sun_intensity
        sky.sun_disc = sun_intensity > 0
        sky.ground_albedo = GROUND_ALBEDO
        bg = nt.nodes.new("ShaderNodeBackground")
        bg.inputs["Strength"].default_value = clear_fraction
        nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
        shaders.append(bg)

    colour = daylight_linear_srgb(CLOUD_CCT.get(condition, 6500.0))
    if dome_strength > 0:
        shaders.append(_cie_overcast_dome(nt, dome_strength, colour))

    if not shaders:
        raise ValueError("a world with neither a clear sky nor a cloud dome is black")
    if len(shaders) == 1:
        nt.links.new(shaders[0].outputs["Background"], out.inputs["Surface"])
    else:
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(shaders[0].outputs["Background"], add.inputs[0])
        nt.links.new(shaders[1].outputs["Background"], add.inputs[1])
        nt.links.new(add.outputs["Shader"], out.inputs["Surface"])

    return {
        "condition": condition,
        "sky_type": sky_type,
        "sun_elevation_deg": round(math.degrees(elevation), 3),
        "sun_rotation_deg": round(math.degrees(rotation), 3),
        "clear_fraction": round(clear_fraction, 5),
        "sun_intensity": round(sun_intensity, 5),
        "dome_strength": round(dome_strength, 5),
        "dome_cct": CLOUD_CCT.get(condition),
        "dome_linear_srgb": [round(c, 4) for c in colour],
    }
