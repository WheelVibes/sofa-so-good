"""LIGHTMAP-GAIN-FIT — fit `IRRADIANCE_GAIN` in LINEAR light, split by who carries a map.

    node scripts/dev-probes/lightmap-gain-linear.mjs   # one process PER GAIN, see below
    blender --background --factory-startup \
      --python python/scripts/blender/exr_dump.py -- <ref.exr> /tmp/ref.npy
    python3 scripts/dev-probes/lightmap-gain-fit.py --app /tmp/gain-6 --ref /tmp/ref.npy

The analysis half of `lightmap-gain-linear.mjs`, which renders the frames and stops there.

**Why a whole-frame fit is wrong (LIGHTMAP-COVERAGE).** At the default living/dining pose the
app's mean sits a few counts from a physical Cycles reference *because two errors cancel*:
lightmapped surfaces are far too bright and analytic-fill-only surfaces are too dark. A gain
fitted against the whole frame is fitting the cancellation, and it moves the two classes in
OPPOSITE directions. So the pixels are split first, by the one property that defines the class:
whether the pixel responds to the gain at all.

**The classifier is free.** `replace`-mode injection makes the rendered radiance exactly AFFINE
in the gain on a lightmapped pixel and CONSTANT on a fill-only one, so the sweep that fits the
coefficient also labels the pixels. No geometry query, no hand-placed patches.

**The statistic is a RATIO OF RATIOS, and that is deliberate.** The app's sun is artistic and
Cycles' exposure is arbitrary, so an absolute level gap means nothing (blender.md, 2026-09-03).
`imbalance(g) = [LM_app(g)/LM_ref] / [FILL_app/FILL_ref]` is invariant to any scalar on either
side; it asks only whether the two classes are lit in the same PROPORTION as physics. The fit is
`imbalance = 1`, solved on the affine form rather than searched.

**Read the fitted value as a FLOOR.** The Cycles reference has a lit ground but no estate block
opposite the window, so it under-lights the room — which biases a fitted gain DOWNWARD.

Everything is done in LINEAR (AGX-PARITY): app frames are rendered through `ssg_linear_view`, so
`linear = srgb_to_linear(byte/255) / toneMappingExposure`, and the reference is its own
scene-referred EXR buffer. Counts are never compared across the two.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
#: The HUD boxes and the glazing box are NOT duplicated here -- they are read out of
#: `ref-linear-compare.mjs`, which is where they were verified for this pose. Two copies of a
#: region table is how a mask silently stops matching the frame it masks.
MASK_SRC = os.path.join(HERE, "ref-linear-compare.mjs")


def exclude_regions() -> list[dict]:
    src = open(MASK_SRC).read()
    block = src[src.index("export const EXCLUDE"):]
    block = block[: block.index("]")]
    out = []
    for m in re.finditer(
        r"name:\s*'([^']+)',\s*x:\s*([0-9.]+),\s*y:\s*([0-9.]+),\s*w:\s*([0-9.]+),\s*h:\s*([0-9.]+)",
        block,
    ):
        out.append(
            dict(name=m.group(1), x=float(m.group(2)), y=float(m.group(3)),
                 w=float(m.group(4)), h=float(m.group(5)))
        )
    if not out:
        raise SystemExit(f"{MASK_SRC}: EXCLUDE table did not parse — shape changed?")
    return out


def build_mask(w: int, h: int) -> np.ndarray:
    mask = np.ones((h, w), dtype=bool)
    for r in exclude_regions():
        x0, y0 = round(r["x"] * w), round(r["y"] * h)
        mask[y0: y0 + round(r["h"] * h), x0: x0 + round(r["w"] * w)] = False
    return mask


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lum(a: np.ndarray) -> np.ndarray:
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def app_linear(path: str, exposure: float, size: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Returns (linear RGB at `size`, clipped-pixel mask at `size`).

    Decoded to linear BEFORE resampling: averaging sRGB bytes is averaging a curve, and the
    resample is 1280x800 -> the reference's native size.
    """
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float64) / 255.0
    clipped = (np.asarray(im).max(axis=2) >= 250).astype(np.float64)
    lin = srgb_to_linear(a) / exposure
    w, h = size
    chans = [
        np.asarray(Image.fromarray(lin[..., c].astype(np.float32), mode="F")
                   .resize((w, h), Image.BOX), dtype=np.float64)
        for c in range(3)
    ]
    clip = np.asarray(Image.fromarray(clipped.astype(np.float32), mode="F")
                      .resize((w, h), Image.BOX), dtype=np.float64)
    return np.stack(chans, axis=-1), clip > 0.0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--app", required=True, help="dir of app-g<gain>.png from lightmap-gain-linear")
    p.add_argument("--ref", required=True, help=".npy linear buffer (python/…/exr_dump.py)")
    p.add_argument("--exposure", type=float, default=1.38,
                   help="three's toneMappingExposure; the manifest records it. 1.38 in this app, "
                        "and a frame inverted at 1.0 is wrong by half a stop.")
    p.add_argument("--respond", type=float, default=0.05,
                   help="a pixel is LIGHTMAPPED if the top gain lifts its linear luminance by "
                        "this fraction over the ~zero-gain arm")
    p.add_argument("--exclude-top", type=float, default=0.0, metavar="FRACTION",
                   help="drop this fraction of the frame's ROWS from the top. Use 0.22 at the "
                        "default living-window pose to drop the CEILING, and read the two fits "
                        "together rather than picking one. Why: `docs/skills/blender.md` records "
                        "that a Cycles reference of this export CANNOT adjudicate the ceiling -- "
                        "with apertures open and emissives killed it renders at irradiance 0.015 "
                        "against walls 0.26-0.47, roughly 9x below what a radiosity estimate from "
                        "the reference's OWN wall and floor values gives, and it is neither "
                        "occlusion nor albedo. Measured here at 800x500: the reference's row mean "
                        "is 0.004-0.02 above row 105 and 0.04-0.14 below it, so the app/ref ratio "
                        "reads 12-43 on the ceiling against 0.45-1.25 everywhere else. The "
                        "ceiling is also the surface the SHIPPED set mostly covers, so a fit that "
                        "includes it is fitting an unmeasurable surface -- and it drives the "
                        "fitted gain NEGATIVE, which is the tell.")
    p.add_argument("--json", default=None)
    a = p.parse_args()

    ref = np.load(a.ref)
    H, W = ref.shape[:2]
    mask = build_mask(W, H)

    arms = {}
    for f in sorted(glob.glob(os.path.join(a.app, "app-g*.png"))):
        g = float(re.search(r"app-g([0-9.]+)\.png$", f).group(1))
        arms[g] = app_linear(f, a.exposure, (W, H))
    if len(arms) < 2:
        raise SystemExit(f"{a.app}: need at least two gain arms, found {len(arms)}")
    gains = sorted(arms)
    g_lo, g_hi = gains[0], gains[-1]
    if g_lo > 0.01:
        raise SystemExit(
            f"lowest arm is gain {g_lo}: the classifier needs a ~zero arm. NOTE aoGain=0 does "
            "NOT ablate the lightmap (VisibilityLightmaps.tsx gates on > 0) — use 0.001."
        )

    lo, hi = lum(arms[g_lo][0]), lum(arms[g_hi][0])
    clipped = np.zeros_like(mask)
    for g in gains:
        clipped |= arms[g][1]
    valid = mask & ~clipped & (lum(ref) > 0)
    if a.exclude_top > 0:
        valid[: int(round(a.exclude_top * H))] = False

    resp = (hi - lo) / np.maximum(lo, 1e-6)
    lm = valid & (resp > a.respond)
    fill = valid & ~lm

    ref_l = lum(ref)
    ref_lm, ref_fill = ref_l[lm].mean(), ref_l[fill].mean()

    rows = []
    for g in gains:
        al = lum(arms[g][0])
        r_lm = al[lm].mean() / ref_lm
        r_fill = al[fill].mean() / ref_fill
        rows.append(dict(gain=g, lm_app=al[lm].mean(), fill_app=al[fill].mean(),
                         ratio_lm=r_lm, ratio_fill=r_fill, imbalance=r_lm / r_fill))

    # The affine solve. mean_LM(g) = A + B g exactly, so the crossing is closed-form and does not
    # depend on which two arms happen to bracket it.
    gs = np.array([r["gain"] for r in rows])
    ys = np.array([r["lm_app"] for r in rows])
    B, A = np.polyfit(gs, ys, 1)
    k = np.mean([r["ratio_fill"] for r in rows])
    # TWO fits, because they ask different questions and the honest answer is the band between.
    #   `balance` — LM/ref == FILL/ref. Invariant to any scalar on either side, so it survives the
    #     fact that the app's sun is artistic; it accepts the fill's own level error as the target.
    #   `absolute` — LM/ref == 1. What LIGHTMAP-COVERAGE actually measures (+35.5 counts on
    #     lightmapped surfaces, -18.6 on fill-only): the gain's job is to make MAPPED surfaces
    #     physically right, and the fill's deficit is a separate lever. Costs the assumption that
    #     the two linear buffers are in the same units.
    fitted_balance = (k * ref_lm - A) / B
    fitted_absolute = (ref_lm - A) / B
    fitted = fitted_absolute
    pred = A + B * gs
    resid = float(np.max(np.abs(pred - ys) / ys))

    out = dict(
        app=a.app, ref=a.ref, exposure=a.exposure, respond=a.respond,
        size=[W, H],
        px_total=int(W * H), px_valid=int(valid.sum()),
        px_lm=int(lm.sum()), px_fill=int(fill.sum()),
        lm_share_of_valid=float(lm.sum() / valid.sum()),
        lm_share_of_frame=float(lm.sum() / (W * H)),
        ref_lm=float(ref_lm), ref_fill=float(ref_fill),
        affine=dict(intercept=float(A), slope=float(B), max_rel_residual=resid),
        rows=rows, fitted_gain=float(fitted),
        fitted_balance=float(fitted_balance), fitted_absolute=float(fitted_absolute),
    )
    print(f"{a.app}  ref={os.path.basename(a.ref)}  {W}x{H}")
    print(f"  valid {valid.sum()} px ({valid.sum()/(W*H)*100:.1f} % of frame); "
          f"LIGHTMAPPED {lm.sum()} ({lm.sum()/(W*H)*100:.1f} % of frame, "
          f"{lm.sum()/valid.sum()*100:.1f} % of valid), FILL-only {fill.sum()}")
    print(f"  affine check: max relative residual of mean_LM(g) vs a line = {resid*100:.3f} %")
    print(f"  {'gain':>7} {'LM app':>10} {'FILL app':>10} {'LM/ref':>9} {'FILL/ref':>9} "
          f"{'imbalance':>10}")
    for r in rows:
        print(f"  {r['gain']:7.3f} {r['lm_app']:10.5f} {r['fill_app']:10.5f} "
              f"{r['ratio_lm']:9.3f} {r['ratio_fill']:9.3f} {r['imbalance']:10.3f}")
    print(f"  FITTED GAIN  absolute (LM/ref = 1): {fitted_absolute:.2f}   "
          f"balance (imbalance = 1): {fitted_balance:.2f}")
    print("  Both are FLOORS: the reference has a lit ground but no estate block opposite the "
          "window,\n  so it under-lights the room, which biases a fitted gain DOWNWARD.")
    if a.json:
        with open(a.json, "w") as fh:
            json.dump(out, fh, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
