"""THREE's AgX, applied to a linear image — so a Cycles reference can be displayed the way the APP
displays it, and a count comparison between the two becomes legitimate.

**Why this exists.** AGX-PARITY (2026-09-11) measured Blender's AgX against three's and found they
differ by up to 14 counts on the neutral axis and 44 in a channel on saturated colour. That
invalidates the construction the whole graphics-realism arc rests on — comparing an app screenshot
to a reference PNG in displayed 8-bit counts. Inverting AgX to recover linear is not a 1-D problem
once a pixel has chroma, so the fix is to go the other way: take the reference's SCENE-REFERRED
LINEAR buffer (`render_still.py --linear-exr`) and push it through three's transform.

**This is a PORT, and a port is a liability.** `docs/skills/blender.md` records the rule from the
geometry-hash work: two implementations wrong the same way agree with each other perfectly, so a
port must be checked against the REAL thing, not against its own fixture. `--verify` does exactly
that — it replays the probe values measured out of a live three.js WebGL context
(`scripts/dev-probes/agx-parity.mjs --out <dir>`, which writes `three.json`) and asserts this
implementation reproduces them. Run it; it takes under a second and it is the only reason to
believe anything below.

    # verify the port against the real three.js, then convert
    blender --background --factory-startup --python python/scripts/blender/agx_three.py -- \
      --verify /tmp/agx-dense/three.json
    blender --background --factory-startup --python python/scripts/blender/agx_three.py -- \
      --image /tmp/bref/cyc.exr --out /tmp/bref/cyc-three-agx.png

Source of the maths: `three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`
at r184. Every constant below is transcribed from that file, including the fact that three's "AgX
look" step is COMMENTED OUT there — so this is look=None, which matches what Blender was measured
under.
"""

from __future__ import annotations

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cli_argv  # noqa: E402

# three applies AgX in Rec.2020. These are the two matrices from `colorspace_pars_fragment` /
# the AgX chunk, in ROW-major order as written there (three's `mat3(vec3 a, vec3 b, vec3 c)`
# constructor takes COLUMNS, so the transcription below multiplies accordingly -- see `_mul3`).
LINEAR_SRGB_TO_LINEAR_REC2020 = (
    (0.6274, 0.3293, 0.0433),
    (0.0691, 0.9195, 0.0114),
    (0.0164, 0.0880, 0.8956),
)
LINEAR_REC2020_TO_LINEAR_SRGB = (
    (1.6605, -0.5876, -0.0728),
    (-0.1246, 1.1329, -0.0083),
    (-0.0182, -0.1006, 1.1187),
)
# `mat3(vec3, vec3, vec3)` in GLSL builds from COLUMNS, so the inset/outset matrices are
# transposed relative to how they read in the source. Getting this backwards is silent: the
# result still looks like a tone curve, just the wrong one. `--verify` is what catches it.
_AGX_INSET_COLUMNS = (
    (0.856627153315983, 0.137318972929847, 0.11189821299995),
    (0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    (0.0482516061458583, 0.101439036467562, 0.811302368396859),
)
_AGX_OUTSET_COLUMNS = (
    (1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    (-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    (-0.016493938717834573, -0.016493938717834257, 1.2519364065950405),
)
AGX_MIN_EV = -12.47393
AGX_MAX_EV = 4.026069


def _transpose(m):
    return tuple(tuple(m[r][c] for r in range(3)) for c in range(3))


AGX_INSET = _transpose(_AGX_INSET_COLUMNS)
AGX_OUTSET = _transpose(_AGX_OUTSET_COLUMNS)


def _mul3(m, v):
    return tuple(m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2] for r in range(3))


def _contrast_approx(x):
    """three's `agxDefaultContrastApprox` -- a 6th-order polynomial, NOT the OCIO sigmoid."""
    x2 = x * x
    x4 = x2 * x2
    return (
        15.5 * x4 * x2
        - 40.14 * x4 * x
        + 31.96 * x4
        - 6.868 * x2 * x
        + 0.4298 * x2
        + 0.1191 * x
        - 0.00232
    )


def _srgb_oetf(c):
    """The encode three's renderer applies after tone mapping (`outputColorSpace = SRGBColorSpace`)."""
    if c <= 0.0031308:
        return 12.92 * c
    return 1.055 * (c ** (1.0 / 2.4)) - 0.055


def agx(rgb, exposure=1.0):
    """three r184's `AgXToneMapping` followed by the sRGB encode. Input linear-sRGB, output 0..1."""
    import math

    c = [v * exposure for v in rgb]
    c = list(_mul3(LINEAR_SRGB_TO_LINEAR_REC2020, c))
    c = list(_mul3(AGX_INSET, c))
    c = [math.log2(max(v, 1e-10)) for v in c]
    c = [(v - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV) for v in c]
    c = [min(1.0, max(0.0, v)) for v in c]
    c = [_contrast_approx(v) for v in c]
    c = list(_mul3(AGX_OUTSET, c))
    c = [max(0.0, v) ** 2.2 for v in c]
    c = list(_mul3(LINEAR_REC2020_TO_LINEAR_SRGB, c))
    c = [min(1.0, max(0.0, v)) for v in c]
    return [_srgb_oetf(v) for v in c]


def verify(three_json_path, tolerance=1):
    """Replay values measured from a live three.js context and assert this port reproduces them."""
    with open(three_json_path) as f:
        data = json.load(f)
    if data.get("toneMapping") not in (None, "AgX"):
        raise SystemExit(f"{three_json_path} was captured with toneMapping={data['toneMapping']!r}, not AgX")
    worst = 0
    worst_row = None
    deltas = []
    for value, expected in zip(data["values"], data["counts"]):
        got = [int(round(v * 255)) for v in agx(value)]
        for g, e in zip(got, expected):
            d = abs(g - e)
            deltas.append(d)
            if d > worst:
                worst, worst_row = d, (value, got, expected)
    report = {
        "probes": len(data["values"]),
        "channels": len(deltas),
        "max_abs_delta": worst,
        "mean_abs_delta": round(sum(deltas) / len(deltas), 4),
        "n_exact": sum(1 for d in deltas if d == 0),
        "renderer": data.get("renderer"),
    }
    print("AGXTHREE verify " + json.dumps(report))
    if worst > tolerance:
        print(f"AGXTHREE worst row: linear={worst_row[0]} port={worst_row[1]} three={worst_row[2]}")
        raise SystemExit(
            f"port disagrees with the real three.js by {worst} counts (tolerance {tolerance}). "
            "Do NOT use it to convert a reference until this is understood."
        )
    return report


def convert(image_path, out_path, exposure=1.0):
    """Apply the port to a linear image and write an 8-bit sRGB PNG."""
    img = bpy.data.images.load(image_path)
    # An EXR is scene-referred linear; say so explicitly rather than trusting the loader's guess,
    # because a wrong tag here would silently pre-transform the data.
    img.colorspace_settings.name = "Linear Rec.709"
    w, h = img.size
    buf = [0.0] * (w * h * 4)
    img.pixels.foreach_get(buf)
    out = bpy.data.images.new("agx_three", width=w, height=h, alpha=False)
    # `Non-Color` because the port has ALREADY applied the sRGB encode -- letting Blender encode
    # again would gamma the image twice, which is the classic silent double-transform.
    out.colorspace_settings.name = "Non-Color"
    dst = [0.0] * (w * h * 4)
    for i in range(w * h):
        r, g, b = agx(buf[i * 4 : i * 4 + 3], exposure)
        dst[i * 4] = r
        dst[i * 4 + 1] = g
        dst[i * 4 + 2] = b
        dst[i * 4 + 3] = 1.0
    out.pixels.foreach_set(dst)
    out.update()
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.dither_intensity = 0.0
    # `view_transform = Standard` so `save_render` passes the already-encoded values through
    # untouched -- AgX has been applied by the port, and applying Blender's on top would be the
    # exact confusion this whole file exists to remove.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0.0
    out.save_render(out_path, scene=scene)
    print(f"AGXTHREE wrote {out_path} ({w}x{h})")
    return out_path


def parse_args(argv=None):
    import argparse

    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="agx_three.py")
    p.add_argument("--verify", default=None,
                   help="path to `three.json` from `agx-parity.mjs --out <dir>`; asserts this port "
                        "reproduces the real three.js to within --tolerance counts")
    p.add_argument("--tolerance", type=int, default=1,
                   help="max allowed per-channel disagreement in the verify (default 1: the port "
                        "and the GPU round independently, so exact equality is not the bar)")
    p.add_argument("--image", default=None, help="linear image (.exr) to convert")
    p.add_argument("--out", default=None, help="output PNG for --image")
    p.add_argument("--exposure", type=float, default=1.0,
                   help="three's `toneMappingExposure`, applied before the curve")
    return p.parse_args(cli_argv.normalise(p, argv))


def main(argv=None):
    a = parse_args(argv)
    if a.verify:
        verify(a.verify, a.tolerance)
    if a.image:
        if not a.out:
            raise SystemExit("--image needs --out")
        convert(a.image, a.out, a.exposure)
    if not a.verify and not a.image:
        raise SystemExit("nothing to do: pass --verify and/or --image")
    return 0


if __name__ == "__main__":
    main()
