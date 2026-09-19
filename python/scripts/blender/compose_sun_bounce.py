"""Compose the SUN-BOUNCE term back into an irradiance lightmap set.

**The problem this exists for.** `bake_material.py --pass irradiance` bakes with the sun disc
OFF, because the app renders the sun itself as a `DirectionalLight` and a baked beam would be
double-counted. That decomposition is right about the DIRECT term and wrong about the INDIRECT
one: removing the sun as a *source* also removes every BOUNCE of it — sunlight off the floor
lighting the ceiling and walls — which in a tropical daylit room is most of the interior's
indirect light. The shipped set therefore holds the sky dome's light and nothing else, and the
surfaces it covers render dark and sky-blue.

**The composition.** `bake_material.py --indirect-only` is the measuring instrument its own
argparse help describes: bake twice indirect-only, once with the sun disc and once without, and
the difference is the sun-bounce term with the direct double-count excluded from BOTH sides.

    A = --pass irradiance                        (shipped: dome direct + dome bounces)
    B = --pass irradiance --with-sun-disc --indirect-only   (dome bounces + sun bounces)
    C = --pass irradiance --indirect-only                   (dome bounces)
    candidate = A + (B - C)                      = dome direct + dome bounces + sun bounces

The subtraction is per TEXEL, not per map, and it is done in IRRADIANCE units: every map is
multiplied by its own `scale` (the divisor `--per-map-scale` recorded) before any arithmetic and
the composed map gets a FRESH `scale = max * 1.02`. Skipping that step compares three different
normalisations and is the `v0.31.7.239`-`.244` failure again.

Two conventions that are easy to get wrong and are both load-bearing here:

- **PNG row 0 is the TOP; the bake's texel row 0 is the BOTTOM.** Blender's pixel buffer is
  bottom-up, so `slot_of(ix, iy)` and the `slots` recorded in the index are in bottom-up rows.
  Read a map with a naive top-down decoder and a one-sided object's data lands in the empty
  mirror row: measured here as a ceiling reading irradiance 0.0001 instead of 0.0495. Arithmetic
  between maps is unaffected (all three arms share the convention) — reporting is not. This
  script therefore never flips: it works in the stored order throughout, and the index's `slots`
  travel unchanged.
- **The three arms must come from the SAME export and the same object set.** Keys are matched
  and a key missing from any arm is dropped with a warning rather than silently composed from
  two.

No `bpy`: this is a post-processor, and Blender's bundled Python has no imaging library
(`docs/skills/blender.md`), so the PNG codec is hand-rolled `zlib` + `struct` like
`render_weather.read_png16`. Runs under the system interpreter or Blender's, unchanged.

Usage:

    python3 python/scripts/blender/compose_sun_bounce.py \
      --a /tmp/photoreal-mobile/bake/A \
      --b /tmp/photoreal-mobile/bake/B \
      --c /tmp/photoreal-mobile/bake/C \
      --out /tmp/photoreal-mobile/bake/candidate
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import zlib

import numpy as np


def read_png(path: str) -> tuple[np.ndarray, int]:
    """Decode a non-interlaced 8- or 16-bit PNG to `(h, w, channels)` float in 0..1, plus depth.

    Rows come back in STORED order (row 0 = the PNG's top row = the bake's TOP texel row); see the
    module docstring for why this file never flips.
    """
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path}: not a PNG")
    idat = bytearray()
    pos, w, h, ch, depth = 8, 0, 0, 0, 8
    while pos < len(data):
        (ln,) = struct.unpack(">I", data[pos:pos + 4])
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            w, h, depth, colour, _comp, _filt, interlace = struct.unpack(">IIBBBBB", body)
            if depth not in (8, 16) or interlace:
                raise ValueError(f"{path}: expected 8/16-bit non-interlaced, got depth={depth} "
                                 f"interlace={interlace}")
            ch = {0: 1, 2: 3, 4: 2, 6: 4}[colour]
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
        pos += 12 + ln
    raw = zlib.decompress(bytes(idat))
    # The filters work on BYTES, and `bpp` is the byte distance to the pixel on the left -- 2x the
    # channel count at 16 bits. Using the channel count there decodes an 8-bit file perfectly and
    # corrupts every 16-bit one, which is the kind of bug that looks like bake noise.
    bpp = ch * (depth // 8)
    stride = w * bpp
    out = np.zeros((h, stride), dtype=np.uint8)
    prev = np.zeros(stride, dtype=np.int32)
    p = 0
    for y in range(h):
        ft = raw[p]
        line = np.frombuffer(raw[p + 1:p + 1 + stride], dtype=np.uint8).astype(np.int32)
        p += 1 + stride
        if ft == 0:
            cur = line
        elif ft == 1:  # Sub
            cur = line.copy()
            for i in range(bpp, stride):
                cur[i] = (cur[i] + cur[i - bpp]) & 0xFF
        elif ft == 2:  # Up
            cur = (line + prev) & 0xFF
        elif ft == 3:  # Average
            cur = line.copy()
            for i in range(stride):
                left = cur[i - bpp] if i >= bpp else 0
                cur[i] = (cur[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ft == 4:  # Paeth
            cur = line.copy()
            for i in range(stride):
                a = cur[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                cur[i] = (cur[i] + pr) & 0xFF
        else:
            raise ValueError(f"{path}: unknown filter {ft}")
        out[y] = cur.astype(np.uint8)
        prev = cur
    if depth == 8:
        return out.reshape(h, w, ch).astype(np.float64) / 255.0, 8
    # PNG is big-endian.
    be = out.reshape(h, w, ch, 2).astype(np.float64)
    return (be[..., 0] * 256.0 + be[..., 1]) / 65535.0, 16


def write_png(path: str, unit: np.ndarray, depth: int) -> None:
    """Encode `(h, w, channels)` float in 0..1 as an 8- or 16-bit PNG, filter 0, rows as given."""
    h, w, ch = unit.shape
    colour = {1: 0, 2: 4, 3: 2, 4: 6}[ch]
    top = 255 if depth == 8 else 65535
    q = np.clip(np.rint(unit * top), 0, top).astype(">u2" if depth == 16 else np.uint8)
    rows = bytearray()
    for y in range(h):
        rows.append(0)
        rows += q[y].tobytes()

    def chunk(typ: bytes, body: bytes) -> bytes:
        return (struct.pack(">I", len(body)) + typ + body
                + struct.pack(">I", zlib.crc32(typ + body) & 0xFFFFFFFF))

    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n")
        fh.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, depth, colour, 0, 0, 0)))
        fh.write(chunk(b"IDAT", zlib.compress(bytes(rows), 9)))
        fh.write(chunk(b"IEND", b""))


def load_set(d: str) -> tuple[dict, dict]:
    with open(os.path.join(d, "index.json")) as fh:
        idx = json.load(fh)
    return idx, {m["key"]: m for m in idx["maps"]}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--a", required=True, help="bake dir: --pass irradiance (the shipped config)")
    p.add_argument("--b", required=True, help="bake dir: --with-sun-disc --indirect-only")
    p.add_argument("--c", required=True, help="bake dir: --indirect-only")
    p.add_argument("--out", required=True, help="output dir for the composed set")
    p.add_argument("--bit-depth", type=int, default=8, choices=(8, 16), dest="bit_depth",
                   help="output PNG depth. Default 8, matching the shipped set -- and 8 is what "
                        "the APP can consume however the set is written: `VisibilityLightmaps.tsx` "
                        "loads through three's `TextureLoader`, i.e. an `HTMLImageElement`, which "
                        "every browser decodes to 8 bits per channel. A 16-bit set is therefore "
                        "4x the bytes for an identical upload. Bake the ARMS at 16 bits anyway "
                        "(precision is free in an intermediate) so the A + (B - C) arithmetic is "
                        "not done on three separately-quantised inputs; quantise once, here.")
    p.add_argument("--encode", type=float, default=1.0,
                   help="store `(texel / scale) ** encode` instead of the normalised value, and "
                        "record it in the index so the consumer can invert it. 0.5 (a square "
                        "root) is the useful setting and it is aimed at ONE measured problem: an "
                        "8-bit map whose per-map `scale` is set by a bright in-slot peak spends "
                        "almost no levels where its texels actually live -- measured on this "
                        "export, the MEDIAN written interior texel of 5 of the 12 largest objects "
                        "lands on <=2 of 255 levels, which is the salt-and-pepper the debug "
                        "visualiser shows. A square root moves that median far up the ramp at no "
                        "cost in bytes. ⚠️ THIS BUILD OF THE APP REFUSES IT: `lightmapIndex.ts` "
                        "rejects any index with `encode != 1` rather than silently misreading it, "
                        "and it names `pow(v, 1/encode)` as the eventual fix. So an encoded set "
                        "is a set built AHEAD of a shader change, not a droppable replacement.")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)

    ia, ma = load_set(a.a)
    ib, mb = load_set(a.b)
    ic, mc = load_set(a.c)
    for name, idx in (("A", ia), ("B", ib), ("C", ic)):
        if idx.get("pass") != "irradiance":
            raise ValueError(f"arm {name} is a '{idx.get('pass')}' bake, not irradiance")
    if not ib["bake"].get("with_sun_disc") or not ib["bake"].get("indirect_only"):
        raise ValueError("arm B must be --with-sun-disc --indirect-only")
    if ic["bake"].get("with_sun_disc") or not ic["bake"].get("indirect_only"):
        raise ValueError("arm C must be --indirect-only with the sun disc OFF")
    # The sun vector is the whole experiment; three arms baked at different suns compose noise.
    suns = [tuple(i["bake"].get("sun_travel") or ()) for i in (ia, ib, ic)]
    if len(set(suns)) != 1:
        raise ValueError(f"the three arms were baked at DIFFERENT suns: {suns}")

    os.makedirs(a.out, exist_ok=True)
    maps, report, skipped = [], [], []
    src_depths: set[int] = set()
    for key, ea in sorted(ma.items(), key=lambda kv: -kv[1]["area"]):
        if key not in mb or key not in mc:
            skipped.append(key)
            continue
        pa, da = read_png(os.path.join(a.a, ea["file"]))
        pb, db = read_png(os.path.join(a.b, mb[key]["file"]))
        pc, dc = read_png(os.path.join(a.c, mc[key]["file"]))
        src_depths.update((da, db, dc))
        pa, pb, pc = pa * ea["scale"], pb * mb[key]["scale"], pc * mc[key]["scale"]
        if not (pa.shape == pb.shape == pc.shape):
            raise ValueError(f"{key}: arms disagree on map size {pa.shape}/{pb.shape}/{pc.shape}")
        # Clamped at zero: B - C is a difference of two noisy estimates, so a texel the sun
        # cannot reach goes slightly negative, and a negative irradiance is not a quantity the
        # runtime can consume.
        cand = np.clip(pa + (pb - pc), 0.0, None)
        peak = float(cand.max())
        scale = peak * 1.02 if peak > 0 else 1.0
        out_name = f"{ea.get('ctx', 'composed')}-{key}.png"
        unit = cand / scale
        if a.encode != 1.0:
            unit = np.power(np.clip(unit, 0.0, 1.0), a.encode)
        write_png(os.path.join(a.out, out_name), unit, a.bit_depth)
        maps.append({"key": key, "file": out_name, "object": ea["object"], "area": ea["area"],
                     "ctx": ea.get("ctx"), "slots": ea.get("slots", []), "scale": round(scale, 6)})
        report.append({"key": key, "object": ea["object"], "scale_a": ea["scale"],
                       "scale": round(scale, 6), "gain_vs_a": round(scale / ea["scale"], 3)})

    index = dict(ia)
    index["maps"] = maps
    # The transform travels WITH the data or it is not a transform, it is a corruption waiting to
    # be read by something that does not know about it.
    index["encode"] = a.encode
    index["bake"] = dict(ia["bake"])
    # The provenance of a DERIVED set. The three source `bake` blocks are copied whole, because
    # the reproduction failure this repo already paid for was an index that recorded the fields
    # someone thought mattered rather than the resolved invocation.
    index["bake"]["composed"] = {
        "formula": "A + (B - C)",
        "note": ("A + the sun-BOUNCE term. B-C isolates the bounces of the sun disc with the "
                 "direct double-count excluded from both sides, so the composed set keeps the "
                 "shipped decomposition (the app still renders the sun beam itself) while "
                 "restoring the indirect light the beam produces."),
        "sources": {"A": {"dir": os.path.abspath(a.a), "bake": ia["bake"]},
                    "B": {"dir": os.path.abspath(a.b), "bake": ib["bake"]},
                    "C": {"dir": os.path.abspath(a.c), "bake": ic["bake"]}},
        "per_map_scale": "re-derived as composed max * 1.02",
        "source_bit_depth": sorted(src_depths),
        "output_bit_depth": a.bit_depth,
        "encode": a.encode,
        "skipped_keys": skipped,
    }
    with open(os.path.join(a.out, "index.json"), "w") as fh:
        json.dump(index, fh, indent=1)

    result = {"ok": True, "out_dir": os.path.abspath(a.out), "maps": len(maps),
              "bit_depth": a.bit_depth, "encode": a.encode,
              "source_bit_depth": sorted(src_depths),
              "skipped": skipped, "objects": report}
    if a.json:
        print(json.dumps(result))
    else:
        print(f"composed {len(maps)} map(s) -> {a.out}"
              + (f"  ({len(skipped)} skipped: {skipped})" if skipped else ""))
        for r in report:
            print(f"  {r['key']}  {r['object']:10}  scale {r['scale_a']:.4f} -> {r['scale']:.4f}"
                  f"  ({r['gain_vs_a']:.2f}x)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
