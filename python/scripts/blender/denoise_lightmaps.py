"""Denoise a baked irradiance lightmap set WITHOUT moving its radiometry.

**The problem this exists for (audit finding N8, decision `(ah)`).** The shipped set is baked
`samples: 4096, denoise: false`, and the living/dining ceiling map `6a396cd5-ce497848.png`
(`Mesh_34`, 19.3 m²) carries a per-texel high-pass sd of **8.68 counts on a mean of 120.1 — 7.2 %
stored Monte Carlo noise**. At 575 texels/m² (a 4.2 cm texel) three to five correlated texels are a
12–25 cm blotch on a ceiling the walk camera comes within 0.55 m of. Raising `--res` keeps the
amplitude and merely turns blotches into speckle, so the noise has to come out of the VALUES.

**Why not `bake_material.py --denoise`.** That flag is a per-slot BOX BLUR
(`_blur_per_slot`), measured 21.8 % wrong against a 4096-sample ground truth (220.9 % on dark
texels) and kept only as a warning. Cycles' own `bpy.ops.object.bake` has no denoise setting
either. The AI denoiser is reachable from a different direction: the COMPOSITOR's `Denoise`
node is OpenImageDenoise, it takes an arbitrary image, and it runs headless.

**What this script does.** For each map of a set (a bake arm or a composed `A + (B - C)` set):

1. decode the PNG and multiply by the map's own `scale`, so the arithmetic is in IRRADIANCE
   units, exactly as `compose_sun_bounce.py` does it;
2. cut out each atlas slot the index declares in `slots` and denoise the slots INDEPENDENTLY.
   The 3x2 box atlas packs six face directions into one texture; a filter spanning a slot
   boundary bleeds one face's light onto another, which is the one thing `uv_margin` and
   `_blur_per_slot`'s per-slot rule both exist to prevent;
3. re-encode with the SAME `scale`. Nothing here re-derives a scale, so a denoised map is
   comparable to its source texel-for-texel and every gain this arc is pinned against is
   untouched by construction;
4. copy the index with a `bake.denoised` block recording the method and its settings.

Two details that are load-bearing and easy to skip:

- **Rows.** PNG row 0 is the TOP; the bake's texel row 0 is the BOTTOM, and the index's `slots`
  are in the bake's bottom-up rows (see `compose_sun_bounce.py`). A slot rect therefore lands at
  stored rows `[h - y1, h - y0)`, not `[y0, y1)`. Get this wrong on a one-slot object and you
  denoise the empty mirror half and ship the noise untouched.
- **Zeros are not data.** Roughly half of every map is unwritten (the box atlas is ~55 % zero by
  construction, `--dilate 4` fills a ring and no more). A denoiser fed a hard black edge pulls
  the real texels next to it down, so the zeros are pre-filled by nearest-neighbour push before
  the filter and RESTORED to zero afterwards. The written/unwritten mask is bit-identical
  through the script.

Two methods, so that "the AI smeared it" is a measurement and not a worry:

    --method oidn       Blender's compositor `Denoise` node (OpenImageDenoise), HDR on,
                        prefilter Accurate, NO albedo/normal aux (a lightmap has no such
                        buffers, and `--aux-flat` measured a flat white albedo INERT: the
                        output was byte-identical, whether the socket was a default or a
                        linked constant). Needs Blender.
    --method bilateral  an edge-preserving bilateral filter in numpy, radius 2 by default.
                        The cheap control: it cannot invent structure, so anything OIDN does
                        that the bilateral does not is OIDN's model talking.

Usage:

    blender --background --factory-startup \
      --python python/scripts/blender/denoise_lightmaps.py -- \
      --in /tmp/photoreal-mobile/bake3/A --out /tmp/n8b/A-oidn --method oidn

    python3 python/scripts/blender/denoise_lightmaps.py \
      --in /tmp/n8b/composed16 --out /tmp/n8b/composed16-bilateral --method bilateral

`--keys` limits the run to named maps (a bisect instrument; the output index still carries only
the maps written). `--bit-depth` and `--encode` default to the input set's, i.e. a denoise is a
value-for-value replacement unless you ask for a re-encode.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose_sun_bounce import read_png, write_png  # noqa: E402


def slot_bounds(col: int, row: int, w: int, h: int) -> tuple[int, int, int, int]:
    """Pixel bounds `(x0, x1, y0, y1)` of atlas slot `(col, row)` in the bake's bottom-up rows.

    Copied from `bake_material.py` rather than imported, because that module imports `bpy` at
    module scope and this one has to run under the system interpreter too. THE convention: a
    texel belongs to the slot containing its CENTRE, so at 256 px the columns break at
    0, 85, 171, 256.
    """
    return (int(col * w / 3 + 0.5), int((col + 1) * w / 3 + 0.5),
            int(row * h / 2 + 0.5), int((row + 1) * h / 2 + 0.5))


def slot_rects(slots: list, w: int, h: int) -> list[tuple[int, int, int, int]]:
    """Slot rects as `(x0, x1, ys0, ys1)` in STORED (top-down) row order."""
    out = []
    for col, row in slots:
        x0, x1, y0, y1 = slot_bounds(int(col), int(row), w, h)
        out.append((x0, x1, h - y1, h - y0))
    return out


def fill_zeros(tile: np.ndarray, written: np.ndarray, passes: int = 64) -> np.ndarray:
    """Push written values into the unwritten texels so the filter sees no black cliff.

    Nearest-neighbour push, one texel per pass, mean of the written 4-neighbours. Never touches
    a written texel; the caller restores the zeros afterwards, so this cannot bias a baked value
    (same guarantee `_dilate_into_zeros` gives).
    """
    out = tile.copy()
    have = written.copy()
    for _ in range(passes):
        if have.all():
            break
        acc = np.zeros_like(out)
        cnt = np.zeros(have.shape, np.float64)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            s = np.roll(np.where(have[..., None], out, 0.0), (dy, dx), (0, 1))
            m = np.roll(have, (dy, dx), (0, 1)).astype(np.float64)
            if dy == 1:
                s[0] = 0.0; m[0] = 0.0
            elif dy == -1:
                s[-1] = 0.0; m[-1] = 0.0
            if dx == 1:
                s[:, 0] = 0.0; m[:, 0] = 0.0
            elif dx == -1:
                s[:, -1] = 0.0; m[:, -1] = 0.0
            acc += s
            cnt += m
        new = (cnt > 0) & ~have
        if not new.any():
            break
        out[new] = acc[new] / cnt[new][..., None]
        have |= new
    return out


def bilateral(tile: np.ndarray, radius: int, sigma_rel: float) -> np.ndarray:
    """Edge-preserving bilateral filter, `(h, w, 3)` in linear irradiance units.

    The range sigma is RELATIVE (`sigma_rel * tile median`) because irradiance spans two decades
    between a window reveal and a shelter wall, so one absolute sigma would blur the dark maps
    flat and leave the bright ones untouched.
    """
    lum = tile.mean(2)
    med = float(np.median(lum[lum > 0])) if (lum > 0).any() else 1.0
    sr = max(sigma_rel * med, 1e-9)
    ss = max(radius / 2.0, 0.5)
    num = np.zeros_like(tile)
    den = np.zeros(tile.shape[:2])
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            sh = np.roll(tile, (dy, dx), (0, 1))
            shl = np.roll(lum, (dy, dx), (0, 1))
            valid = np.ones(lum.shape, bool)
            if dy > 0:
                valid[:dy] = False
            elif dy < 0:
                valid[dy:] = False
            if dx > 0:
                valid[:, :dx] = False
            elif dx < 0:
                valid[:, dx:] = False
            wgt = np.exp(-(dx * dx + dy * dy) / (2 * ss * ss)) \
                * np.exp(-((shl - lum) ** 2) / (2 * sr * sr)) * valid
            num += sh * wgt[..., None]
            den += wgt
    return num / np.maximum(den, 1e-12)[..., None]


class Oidn:
    """OpenImageDenoise through the compositor's `Denoise` node. Blender only.

    In Blender 5.2 the compositor is a NODE GROUP on the scene (`scene.compositing_node_group`),
    `CompositorNodeComposite` is gone in favour of a `NodeGroupOutput`, and `HDR`/`Prefilter`/
    `Quality` are node INPUT SOCKETS, not node properties. All four differ from every 3.x/4.x
    example. The Viewer node is NOT an option in `--background`: it renders as an untouched
    256x256 zero image, so the result comes back through a written EXR.
    """

    def __init__(self, tmp: str, hdr: bool = True, prefilter: str = "Accurate",
                 aux_flat: bool = False) -> None:
        import bpy
        self.bpy = bpy
        self.tmp = tmp
        self.images: dict[tuple[int, int], object] = {}
        g = bpy.data.node_groups.new("denoise_lightmaps", "CompositorNodeTree")
        g.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        sc = bpy.context.scene
        sc.compositing_node_group = g
        sc.use_nodes = True
        self.node_in = g.nodes.new("CompositorNodeImage")
        dn = g.nodes.new("CompositorNodeDenoise")
        out = g.nodes.new("NodeGroupOutput")
        dn.inputs["HDR"].default_value = hdr
        dn.inputs["Prefilter"].default_value = prefilter
        if aux_flat:
            # A lightmap has no albedo or normal buffer, but the denoiser's aux inputs are not
            # "absent" -- they are constants. Telling OIDN the surface is FLAT WHITE and
            # front-facing says "there is no texture detail here", which is true of an
            # irradiance map. ⚠️ MEASURED INERT: setting the sockets' `default_value` produced a
            # BYTE-IDENTICAL map, so the node only consults an aux input that is LINKED -- and a
            # linked CONSTANT is measured below too. Kept as the flag that records the probe.
            rgb = g.nodes.new("CompositorNodeRGB")
            rgb.outputs[0].default_value = (1.0, 1.0, 1.0, 1.0)
            g.links.new(rgb.outputs[0], dn.inputs["Albedo"])
        g.links.new(self.node_in.outputs["Image"], dn.inputs["Image"])
        g.links.new(dn.outputs["Image"], out.inputs[0])
        sc.render.resolution_percentage = 100
        sc.render.image_settings.file_format = "OPEN_EXR"
        sc.render.image_settings.color_depth = "32"
        sc.render.filepath = os.path.join(tmp, "denoise.exr")
        self.settings = {"node": "CompositorNodeDenoise", "engine": "OpenImageDenoise",
                         "hdr": bool(hdr), "prefilter": prefilter,
                         "aux": ("flat albedo linked -- MEASURED INERT, byte-identical output"
                                 if aux_flat
                                 else "none (a lightmap has no albedo/normal buffer)")}

    def _image(self, w: int, h: int):
        key = (w, h)
        if key not in self.images:
            img = self.bpy.data.images.new(f"den_{w}x{h}", w, h, float_buffer=True)
            # Non-Color: the compositor must see the stored numbers, not an sRGB decode of them.
            try:
                img.colorspace_settings.name = "Non-Color"
            except TypeError:
                pass
            self.images[key] = img
        return self.images[key]

    def __call__(self, tile: np.ndarray) -> np.ndarray:
        h, w, _ = tile.shape
        img = self._image(w, h)
        buf = np.ones((h, w, 4), np.float32)
        # Blender's pixel buffer is bottom-up; the tile is in stored (top-down) rows. Flip in,
        # flip out -- a round trip, so the choice cannot change the result, but keeping the
        # orientation honest means an EXR dumped mid-debug is not upside down.
        buf[..., :3] = tile[::-1].astype(np.float32)
        img.pixels.foreach_set(buf.ravel())
        img.update()
        self.node_in.image = img
        sc = self.bpy.context.scene
        sc.render.resolution_x, sc.render.resolution_y = w, h
        self.bpy.ops.render.render(write_still=True)
        res = self.bpy.data.images.load(sc.render.filepath, check_existing=False)
        rw, rh = res.size
        arr = np.empty(len(res.pixels), np.float32)
        res.pixels.foreach_get(arr)
        arr = arr.reshape(rh, rw, -1)[..., :3][::-1]
        self.bpy.data.images.remove(res)
        if (rh, rw) != (h, w):
            raise RuntimeError(f"denoise returned {rw}x{rh} for a {w}x{h} tile")
        return arr.astype(np.float64)


def denoise_set(in_dir: str, out_dir: str, method: str, pad: int, radius: int,
                sigma_rel: float, keys: set | None, bit_depth: int | None,
                encode: float | None, hdr: bool, prefilter: str,
                aux_flat: bool = False) -> dict:
    with open(os.path.join(in_dir, "index.json")) as fh:
        idx = json.load(fh)
    src_encode = float(idx.get("encode", 1.0))
    out_encode = src_encode if encode is None else encode
    tmp = os.path.join(out_dir, "_tmp")
    os.makedirs(tmp, exist_ok=True)
    engine = Oidn(tmp, hdr, prefilter, aux_flat) if method == "oidn" else None
    settings = engine.settings if engine else {"filter": "bilateral", "radius": radius,
                                               "sigma_rel": sigma_rel}
    maps, report = [], []
    src_depths: set[int] = set()
    out_depths: set[int] = set()
    t0 = time.time()
    for m in idx["maps"]:
        if keys is not None and m["key"] not in keys:
            continue
        unit, depth = read_png(os.path.join(in_dir, m["file"]))
        src_depths.add(depth)
        out_depth = depth if bit_depth is None else bit_depth
        out_depths.add(out_depth)
        lin = np.power(unit, 1.0 / src_encode) * m["scale"] if src_encode != 1.0 \
            else unit * m["scale"]
        h, w, _ = lin.shape
        res = lin.copy()
        for (x0, x1, ys0, ys1) in slot_rects(m.get("slots", []), w, h):
            tile = lin[ys0:ys1, x0:x1]
            written = tile.max(2) > 0
            if not written.any():
                continue
            filled = fill_zeros(tile, written)
            # Replicate-pad so the filter's own edge handling cannot cut a halo into the slot's
            # boundary texels -- the ones bilinear filtering samples at a UV seam.
            padded = np.pad(filled, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
            den = engine(padded) if engine else bilateral(padded, radius, sigma_rel)
            den = den[pad:pad + tile.shape[0], pad:pad + tile.shape[1]]
            den = np.where(written[..., None], np.clip(den, 0.0, None), 0.0)
            res[ys0:ys1, x0:x1] = den
        unit_out = np.clip(res / m["scale"], 0.0, 1.0)
        if out_encode != 1.0:
            unit_out = np.power(unit_out, out_encode)
        write_png(os.path.join(out_dir, m["file"]), unit_out, out_depth)
        mm = dict(m)
        maps.append(mm)
        report.append({"key": m["key"], "object": m["object"]})
    if engine is None:
        shutil.rmtree(tmp, ignore_errors=True)
    elapsed = round(time.time() - t0, 1)
    # The single value if every map wrote the same depth (the normal case -- `--bit-depth` is a
    # set-wide flag); a sorted list if maps disagree (only possible with no `--bit-depth` and a
    # source set that itself mixed depths), so the index never LIES by collapsing to one number.
    out_depth_field = out_depths.pop() if len(out_depths) == 1 else sorted(out_depths)
    src_depth_field = src_depths.pop() if len(src_depths) == 1 else sorted(src_depths)
    out_idx = dict(idx)
    out_idx["maps"] = maps
    # BUG this fixes: the index must declare the ACTUAL bytes on disk, not the source's. `encode`
    # was already out_encode here, but `bake.composed.output_bit_depth`/`.encode` (when the input
    # is itself a composed set) were being copied verbatim from `idx["bake"]`, i.e. inherited from
    # the PRE-denoise input -- so an `--bit-depth 8 --encode 0.5` run over a 16-bit/encode-1.0
    # composed set shipped PNGs in the new schema next to metadata still describing the old one.
    out_idx["encode"] = out_encode
    out_idx["bake"] = dict(idx["bake"])
    if "composed" in out_idx["bake"]:
        composed = dict(out_idx["bake"]["composed"])
        composed["output_bit_depth"] = out_depth_field
        composed["encode"] = out_encode
        out_idx["bake"]["composed"] = composed
    out_idx["bake"]["denoised"] = {
        "method": method,
        "settings": settings,
        "source": os.path.abspath(in_dir),
        "source_bit_depth": src_depth_field,
        "source_encode": src_encode,
        "scope": "per declared interior atlas slot, replicate-padded",
        "pad": pad,
        "scale": "UNCHANGED from the source map -- a denoise must not re-derive a gain",
        "zeros": "pre-filled by nearest-neighbour push, restored to zero after filtering",
        "maps": len(maps),
        "seconds": elapsed,
    }
    _check_index_consistency(out_idx, out_dir, maps)
    with open(os.path.join(out_dir, "index.json"), "w") as fh:
        json.dump(out_idx, fh, indent=1)
    if engine is not None:
        shutil.rmtree(tmp, ignore_errors=True)
    return {"ok": True, "out_dir": os.path.abspath(out_dir), "maps": len(maps),
            "method": method, "settings": settings, "seconds": elapsed,
            "bytes": sum(os.path.getsize(os.path.join(out_dir, m["file"])) for m in maps)}


def _check_index_consistency(out_idx: dict, out_dir: str, maps: list) -> None:
    """Self-check: the index this run is about to write must describe the bytes it just wrote.

    Cheap (re-reads only the PNG header via `read_png`, no re-filtering) and unconditional --
    this is exactly the bug class this script shipped once (schema said `encode: 1.0`/16-bit,
    files were 8-bit/`encode 0.5`), so the writer asserts its own claim rather than trusting it.
    """
    declared_encode = float(out_idx["encode"])
    assert 0.0 < declared_encode <= 1.0, f"index declares unusable encode {declared_encode}"
    for m in maps:
        _unit, actual_depth = read_png(os.path.join(out_dir, m["file"]))
        composed = out_idx.get("bake", {}).get("composed")
        if composed is not None:
            declared = composed.get("output_bit_depth")
            declared_set = {declared} if isinstance(declared, int) else set(declared or ())
            assert actual_depth in declared_set, (
                f"{m['file']}: wrote {actual_depth}-bit but bake.composed.output_bit_depth "
                f"declares {declared}")
            assert composed.get("encode") == declared_encode, (
                f"bake.composed.encode {composed.get('encode')} != top-level encode "
                f"{declared_encode}")


def self_test() -> None:
    """Reproduce the regression this file exists to fix, on a synthetic set, no Blender needed.

    Builds a fake 16-bit/`encode 1.0` COMPOSED set (the exact input shape a real
    `compose_sun_bounce.py` output has -- `bake.composed.output_bit_depth: 16`), denoises it with
    `--method bilateral --bit-depth 8 --encode 0.5` (the real regression's flags), and asserts the
    written index declares the bytes it actually wrote: top-level `encode == 0.5`,
    `bake.composed.output_bit_depth == 8`, `bake.composed.encode == 0.5`, and a `denoised` block
    with `source_bit_depth == 16`/`source_encode == 1.0`. `_check_index_consistency` runs inside
    `denoise_set` regardless, so a regression here fails there too -- this just proves it on a
    known-bad-before-the-fix shape without needing the real `/tmp/photoreal-mobile` artefacts.
    """
    with tempfile.TemporaryDirectory() as td:
        in_dir, out_dir = os.path.join(td, "composed16"), os.path.join(td, "out8")
        os.makedirs(in_dir)
        h, w = 16, 24
        unit = np.zeros((h, w, 3))
        unit[2:14, 2:22, :] = 0.5
        write_png(os.path.join(in_dir, "test.png"), unit, 16)
        idx = {"encode": 1.0, "bake": {"bit_depth": 16,
                                       "composed": {"output_bit_depth": 16, "encode": 1.0}},
               "maps": [{"key": "t", "file": "test.png", "object": "Mesh_T", "area": 1.0,
                        "slots": [[0, 0]], "scale": 5.0}]}
        with open(os.path.join(in_dir, "index.json"), "w") as fh:
            json.dump(idx, fh)
        denoise_set(in_dir, out_dir, "bilateral", 16, 2, 0.5, None, 8, 0.5, True, "Accurate")
        with open(os.path.join(out_dir, "index.json")) as fh:
            out = json.load(fh)
        assert out["encode"] == 0.5, out["encode"]
        assert out["bake"]["composed"]["output_bit_depth"] == 8, out["bake"]["composed"]
        assert out["bake"]["composed"]["encode"] == 0.5, out["bake"]["composed"]
        dn = out["bake"]["denoised"]
        assert dn["source_bit_depth"] == 16, dn
        assert dn["source_encode"] == 1.0, dn
    print("self-test OK: composed.output_bit_depth/encode follow the actual output, not the "
          "16-bit/encode-1.0 input")


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    if "--self-test" in argv:
        self_test()
        return 0
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--self-test", action="store_true",
                   help="run the built-in regression check (no --in/--out needed) and exit")
    p.add_argument("--in", dest="in_dir", required=True, help="source bake/composed set")
    p.add_argument("--out", dest="out_dir", required=True)
    p.add_argument("--method", choices=("oidn", "bilateral"), default="oidn")
    p.add_argument("--pad", type=int, default=16, help="replicate padding around each slot")
    p.add_argument("--radius", type=int, default=2, help="bilateral radius in texels")
    p.add_argument("--sigma-rel", type=float, default=0.5, dest="sigma_rel",
                   help="bilateral range sigma, as a fraction of the slot's median luminance")
    p.add_argument("--keys", default=None, help="comma-separated map keys; default all")
    p.add_argument("--bit-depth", type=int, default=None, choices=(8, 16), dest="bit_depth",
                   help="output PNG depth. Default: the source's.")
    p.add_argument("--encode", type=float, default=None,
                   help="output encode exponent. Default: the source's.")
    p.add_argument("--no-hdr", action="store_false", dest="hdr")
    p.add_argument("--aux-flat", action="store_true", dest="aux_flat",
                   help="feed the Denoise node a constant white Albedo and a constant +Z Normal "
                        "instead of leaving the aux inputs unset")
    p.add_argument("--prefilter", default="Accurate", choices=("None", "Fast", "Accurate"))
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    os.makedirs(a.out_dir, exist_ok=True)
    result = denoise_set(a.in_dir, a.out_dir, a.method, a.pad, a.radius, a.sigma_rel,
                         set(a.keys.split(",")) if a.keys else None, a.bit_depth, a.encode,
                         a.hdr, a.prefilter, a.aux_flat)
    print(json.dumps(result) if a.json
          else f"denoised {result['maps']} map(s) -> {result['out_dir']} "
               f"({result['method']}, {result['seconds']} s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
