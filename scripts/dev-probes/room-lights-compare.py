"""R7-AH — compare the app's two light-pool arms against the lamps-only Cycles reference, in linear.

    python3 scripts/dev-probes/room-lights-compare.py --app /tmp/r7ah/app --cyc /tmp/r7ah/cyc \
        --out /tmp/r7ah/cmp [--sheets docs/research/assets/room-scoped-lights-cycles-2026-09-26]

Inputs: `room-lights-cycles.mjs` (app frames captured in `ssg_linear_view`, one boot) and
`python/scripts/blender/render_lamp_groups.py` (Cycles: `none`, `pool`, `rest` per pose).

Everything is compared as LAMP CONTRIBUTION, in scene-linear Rec.709 luminance:
  app arm   A = lin(arm frame) - lin(lights-off frame),  lin = srgb_to_linear(byte) / exposure
  Cycles    C = (pool - none) + (rest - none),  Cr = rest - none (the lamps the pool drops)
The app frame is downsampled 2x2 (mean in linear) to the Cycles resolution. Excluded pixels: any
channel clipped (255) in either app arm, camera-only emissives (Cycles `none` > 0), and anything
Cycles lights at < 1e-4 (sky / exterior through glass).

Regions are not hand-placed: each is (room the camera stands in) x (surface orientation), from
Cycles' own position + normal passes -- e.g. bedroom 2's `wall facing +x` is its west wall and
the wardrobe front.
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

# three (x, z) room rectangles of the default plan, from the probe's manifest (`rooms`).
POSE_ROOM = {
    "bedroom2": "bedroom2",
    "corridor": "corridor",
    "kitchen": "kitchen",
    "living": "livingDining",
    "bedroom": "mainBedroom",
}


def srgb_to_linear(b: np.ndarray) -> np.ndarray:
    c = b.astype(np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def down2(a: np.ndarray) -> np.ndarray:
    h, w = a.shape[0] // 2, a.shape[1] // 2
    return a[: h * 2, : w * 2].reshape(h, 2, w, 2, *a.shape[2:]).mean(axis=(1, 3))


def load_app(path: str, exposure: float) -> tuple[np.ndarray, np.ndarray]:
    b = np.asarray(Image.open(path).convert("RGB"))
    clipped = (b >= 255).any(-1)
    lin = srgb_to_linear(b) / exposure
    return down2(lin), down2(clipped.astype(np.float32)) > 0


def luma(a: np.ndarray) -> np.ndarray:
    return a @ LUMA


def orient(n: np.ndarray) -> np.ndarray:
    """Dominant axis of a Blender-space normal, as a three-space label."""
    lab = np.full(n.shape[:2], "", dtype=object)
    ax = np.abs(n)
    k = ax.argmax(-1)
    strong = ax.max(-1) > 0.9
    # Blender (x, y, z) = three (x, -z, y)
    names = {(0, 1): "wall facing +x", (0, -1): "wall facing -x",
             (1, 1): "wall facing -z", (1, -1): "wall facing +z",
             (2, 1): "floor/up-facing", (2, -1): "ceiling/down-facing"}
    for (axis, sign), name in names.items():
        sel = strong & (k == axis) & (np.sign(n[..., axis]) == sign)
        lab[sel] = name
    lab[~strong] = "other (furniture, oblique)"
    return lab


def tone(y: np.ndarray, k: float) -> np.ndarray:
    """Shared display for sheets: x/(1+x) on exposure-scaled linear, sRGB-encoded."""
    x = np.clip(y * k, 0, None)
    x = x / (1 + x)
    s = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)
    return (np.clip(s, 0, 1) * 255).astype(np.uint8)


def heat(v: np.ndarray, full: float, mask: np.ndarray) -> np.ndarray:
    """Diverging: red = negative, green = positive, full intensity at |v| = full; grey = masked."""
    k = np.clip(np.abs(v) / full, 0, 1)
    out = np.zeros(v.shape + (3,), dtype=np.uint8)
    out[..., 0] = np.where(v < 0, k * 255, 0)
    out[..., 1] = np.where(v > 0, k * 255, 0)
    out[~mask] = (60, 60, 70)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--app", required=True)
    p.add_argument("--cyc", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--sheets", default=None)
    p.add_argument("--min-px", type=int, default=400)
    p.add_argument("--cyc-direct", default=None, help="a --direct-only render_lamp_groups.py dir")
    p.add_argument("--poses", default=None, help="comma list; default every pose in the manifest")
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    man = json.load(open(os.path.join(a.app, "manifest.json")))
    rooms = {r["id"]: r for r in man["rooms"]}
    result = {}
    for pose, rec in man["poses"].items():
        if a.poses and pose not in a.poses.split(","):
            continue
        cyc = {g: np.load(os.path.join(a.cyc, f"{pose}-{g}.npy")) for g in ("none", "pool", "rest")}
        pos = np.load(os.path.join(a.cyc, f"{pose}-pos.npy"))
        nrm = np.load(os.path.join(a.cyc, f"{pose}-nrm.npy"))
        exp = {k: v["state"]["exposure"] for k, v in rec["shots"].items()}
        app, clip = {}, {}
        for k in ("pool", "legacy", "pool2", "dark"):
            app[k], clip[k] = load_app(os.path.join(a.app, f"{pose}-{k}.png"), exp[k])
        Cn = luma(cyc["none"])
        Cp = luma(cyc["pool"]) - Cn
        Cr = luma(cyc["rest"]) - Cn
        C = Cp + Cr
        # Optional: the pool lamps' DIRECT light alone (render_lamp_groups.py --direct-only), the
        # term the app's shadowless point lights compute -- its pipeline check and the GI split.
        Cd = None
        if a.cyc_direct:
            Cd = (luma(np.load(os.path.join(a.cyc_direct, f"{pose}-pool.npy")))
                  - luma(np.load(os.path.join(a.cyc_direct, f"{pose}-none.npy"))))
        dark = luma(app["dark"])
        A = {k: luma(app[k]) - dark for k in ("pool", "legacy", "pool2")}
        valid = ~(clip["pool"] | clip["legacy"] | clip["pool2"]) & (Cn < 1e-3) & (C > 1e-4)
        room = rooms[POSE_ROOM[pose]]
        x3, z3, y3 = pos[..., 0], -pos[..., 1], pos[..., 2]
        pad = 0.15
        inroom = ((x3 > room["origin"][0] - pad) & (x3 < room["origin"][0] + room["width"] + pad)
                  & (z3 > room["origin"][1] - pad) & (z3 < room["origin"][1] + room["depth"] + pad))
        lab = orient(nrm)
        # Shell vs furniture by POSITION: a wall label only if the surface lies on that room
        # boundary (the bedroom-2 pose has a wood panel 8 cm from the lens facing +x, which the
        # normal alone would call "west wall"); floor / ceiling by height.
        ox, oz = room["origin"]
        x0, x1, z0, z1 = ox, ox + room["width"], oz, oz + room["depth"]
        tol = 0.2
        on_plane = {
            "wall facing +x": np.abs(x3 - x0) < tol, "wall facing -x": np.abs(x3 - x1) < tol,
            "wall facing +z": np.abs(z3 - z0) < tol, "wall facing -z": np.abs(z3 - z1) < tol,
            "floor/up-facing": y3 < 0.05, "ceiling/down-facing": y3 > 2.3,
        }
        short = {"floor/up-facing": "floor", "ceiling/down-facing": "ceiling"}
        regs = {"whole frame (valid px)": valid}
        shell = np.zeros_like(valid)
        for name, plane in on_plane.items():
            m = valid & inroom & (lab == name) & plane
            shell |= m
            regs[f"{POSE_ROOM[pose]}: {short.get(name, name)}"] = m
        regs[f"{POSE_ROOM[pose]}: furniture / fittings"] = valid & inroom & ~shell
        regs["outside the camera's room"] = valid & ~inroom
        rows = []
        for name, m in regs.items():
            n = int(m.sum())
            if n < a.min_px:
                continue
            c, cr = float(C[m].mean()), float(Cr[m].mean())
            ap, al, a2 = (float(A[k][m].mean()) for k in ("pool", "legacy", "pool2"))
            rows.append({
                "region": name, "px": n,
                "cycles": c, "cycles_dropped_share": cr / c,
                "cycles_direct": float(Cd[m].mean()) if Cd is not None else None,
                "app_pool": ap, "app_legacy": al,
                "app_removed_share": 1 - ap / al if al > 0 else None,
                "control_pool2_vs_pool": a2 / ap - 1 if ap > 0 else None,
                "err_pool": ap / c - 1, "err_legacy": al / c - 1,
            })
        # Shape, not level: each arm scaled by ITS OWN per-pose scalar that matches it to Cycles
        # over the whole frame (errS), so a uniform level gap cannot favour either arm.
        whole = rows[0]
        k = whole["cycles"] / whole["app_pool"]
        k_leg = whole["cycles"] / whole["app_legacy"]
        for r in rows:
            r["err_pool_scaled"] = r["app_pool"] * k / r["cycles"] - 1
            r["err_legacy_scaled"] = r["app_legacy"] * k_leg / r["cycles"] - 1
        # Pixel-weighted mean |errS| over the camera room's regions (shell + furniture).
        inr = [r for r in rows[1:] if not r["region"].startswith("outside")]
        wsum = sum(r["px"] for r in inr)
        m = valid
        removed = (A["legacy"] - A["pool"])[m].sum()
        result[pose] = {
            "exposure": exp, "pool_lamps": len(rec["poolSlots"]),
            "scale_pool_to_cycles": k, "scale_legacy_to_cycles": k_leg,
            "valid_px": int(valid.sum()), "px": int(valid.size),
            "cycles_dropped_share_frame": float(Cr[m].sum() / C[m].sum()),
            "cycles_dropped_share_max_region": max(abs(r["cycles_dropped_share"]) for r in rows),
            "app_removed_share_frame": float(removed / A["legacy"][m].sum()),
            "mean_abs_errS_pool": sum(r["px"] * abs(r["err_pool_scaled"]) for r in inr) / wsum,
            "mean_abs_errS_legacy": sum(r["px"] * abs(r["err_legacy_scaled"]) for r in inr) / wsum,
            "rows": rows,
        }
        print(f"\n== {pose}  (pool carries {len(rec['poolSlots'])} lamps; exposure {exp['pool']};"
              f" valid {valid.mean() * 100:.0f} % of px; k = {k:.2f})")
        print(f"{'region':44s} {'px':>6s} {'Cyc':>7s} {'Cyc drop%':>9s} {'pool':>7s} {'legacy':>7s}"
              f" {'app rm%':>7s} {'err pool':>8s} {'err leg':>8s} {'errS pool':>9s} {'errS leg':>8s} {'ctl%':>6s}"
              f" {'CycDir':>7s}")
        for r in rows:
            cd = f" {r['cycles_direct']:7.4f}" if r["cycles_direct"] is not None else ""
            print(f"{r['region'][:44]:44s} {r['px']:6d} {r['cycles']:7.4f} {r['cycles_dropped_share'] * 100:8.2f}%"
                  f" {r['app_pool']:7.4f} {r['app_legacy']:7.4f} {r['app_removed_share'] * 100:6.1f}%"
                  f" {r['err_pool'] * 100:7.1f}% {r['err_legacy'] * 100:7.1f}%"
                  f" {r['err_pool_scaled'] * 100:8.1f}% {r['err_legacy_scaled'] * 100:7.1f}%"
                  f" {r['control_pool2_vs_pool'] * 100:5.2f}%{cd}")

        if a.sheets:
            os.makedirs(a.sheets, exist_ok=True)
            # Display: every panel = lamp light + the app's own lights-off frame, in colour, one
            # shared exposure per pose. Cycles' lamp light is divided by k (the one per-pose scalar
            # that level-matches it to the pool arm over the frame), so the panels compare SHAPE --
            # unscaled, Cycles is k x brighter and washes out.
            c_rgb = (cyc["pool"] + cyc["rest"] - 2 * cyc["none"]) / k + app["dark"] + cyc["none"] / k
            kd = 1.0 / max(float(np.percentile((A["legacy"] + dark)[valid], 60)), 1e-6)
            panels = [
                (f"Cycles lamps / {k:.1f} + app night", tone(c_rgb, kd)),
                ("app: pool ON (room-scoped)", tone(app["pool"], kd)),
                ("app: pool OFF (all 19, no shadows)", tone(app["legacy"], kd)),
                ("app change ON vs OFF (red = darker, full at 50%)",
                 heat((A["pool"] - A["legacy"]) / np.maximum(A["legacy"], 1e-4), 0.5, valid)),
                ("Cycles: share from the dropped lamps (full at 50%)",
                 heat(Cr / np.maximum(C, 1e-4), 0.5, valid)),
                ("closer to Cycles (each arm own scale): green = pool",
                 heat((np.abs(A["legacy"] * k_leg - C) - np.abs(A["pool"] * k - C)) / np.maximum(C, 1e-4),
                      0.5, valid)),
            ]
            tw, th = 300, 225
            sheet = Image.new("RGB", (tw * 3, (th + 16) * 2), (20, 20, 24))
            d = ImageDraw.Draw(sheet)
            for i, (title, img) in enumerate(panels):
                im = Image.fromarray(img)
                im = im.resize((tw, th), Image.BILINEAR)
                x, y = (i % 3) * tw, (i // 3) * (th + 16)
                sheet.paste(im, (x, y + 16))
                d.text((x + 4, y + 2), title, fill=(230, 230, 230))
            # 256-colour palette: the sheets are committed, and they are for looking, not measuring.
            sheet.quantize(256, dither=Image.Dither.NONE).save(
                os.path.join(a.sheets, f"{pose}.png"), optimize=True)
    with open(os.path.join(a.out, "compare.json"), "w") as fh:
        json.dump(result, fh, indent=1)
    print("\npose       app removed  Cycles dropped (frame / worst region)  mean|errS| pool  legacy"
          "   k pool  k legacy")
    for pose, r in result.items():
        print(f"  {pose:9s} {r['app_removed_share_frame'] * 100:8.1f}%  {r['cycles_dropped_share_frame'] * 100:10.3f}%"
              f" / {r['cycles_dropped_share_max_region'] * 100:6.3f}%        {r['mean_abs_errS_pool'] * 100:8.1f}%"
              f" {r['mean_abs_errS_legacy'] * 100:7.1f}%  {r['scale_pool_to_cycles']:6.2f}"
              f" {r['scale_legacy_to_cycles']:8.2f}")


if __name__ == "__main__":
    main()
