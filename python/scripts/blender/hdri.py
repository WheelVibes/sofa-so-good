"""HDRI resolution for the Blender path — local cache, app catalog, procedural fallback.

The app's environments are **not bundled**: `src/scene/lighting/hdriCatalog.ts` serves
five CC0 Poly Haven maps straight from the Poly Haven CDN, and there is no `.hdr` anywhere
in the repo. Blender cannot fetch over HTTP mid-render, so this module resolves an HDRI
name to a local file, downloading and caching it on first use.

Cache lives in `.cache/hdri/`, which `.gitignore:38` already covers as the
"Local price-server / sidecar cache" — the same place the other optional local
sidecars keep their downloads, so nothing new needs ignoring.

`resolve()` accepts, in order of preference:

1. a **path** to an existing `.hdr`/`.exr` — used as-is, no network;
2. a **catalog id** (`studio_small_09`, …) — cached from the CDN on first use;
3. `"procedural"` or `None` — a generated gradient sky, written locally, **no network
   at all**.

The procedural option matters: the goal's hard constraint is that this layer never
blocks or crashes without its dependencies, and "offline" is as real a failure mode as
"Blender missing". A render that silently produces a black world would be worse than one
lit by an approximate sky.
"""

from __future__ import annotations

import math
import os
import struct
import urllib.error
import urllib.request

#: Mirrors `src/scene/lighting/hdriCatalog.ts`. Kept as a plain dict rather than parsed
#: from the TypeScript because parsing TS from Python is fragile — but that means it can
#: DRIFT, so `check_catalog_sync()` exists and is exercised by the test suite.
BASE = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/"

CATALOG: dict[str, str] = {
    "studio_small_09": "studio_small_09_1k.hdr",
    "brown_photostudio_02": "brown_photostudio_02_1k.hdr",
    "kloppenheim_06_puresky": "kloppenheim_06_puresky_1k.hdr",
    "venice_sunset": "venice_sunset_1k.hdr",
    "kiara_1_dawn": "kiara_1_dawn_1k.hdr",
}


def repo_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


def cache_dir() -> str:
    d = os.path.join(repo_root(), ".cache", "hdri")
    os.makedirs(d, exist_ok=True)
    return d


def check_catalog_sync() -> list[str]:
    """Return a list of drift descriptions between this mirror and the TS catalog.

    Empty list means in sync. Parsed with a regex deliberately narrow enough to fail
    loudly if the TS shape changes, rather than silently matching nothing and reporting
    "in sync" — a false clean bill of health is the failure mode to avoid here.
    """
    import re

    ts = os.path.join(repo_root(), "src", "scene", "lighting", "hdriCatalog.ts")
    if not os.path.exists(ts):
        return [f"catalog source missing: {ts}"]
    src = open(ts, encoding="utf-8").read()
    base_m = re.search(r"const BASE = '([^']+)'", src)
    if not base_m:
        return ["could not parse BASE from hdriCatalog.ts (TS shape changed?)"]
    found = dict(
        re.findall(r"id: '([^']+)',\s*\n\s*name: '[^']+',\s*\n\s*url: `\$\{BASE\}([^`]+)`", src)
    )
    if not found:
        return ["parsed zero entries from hdriCatalog.ts (TS shape changed?)"]
    problems: list[str] = []
    if base_m.group(1) != BASE:
        problems.append(f"BASE differs: TS {base_m.group(1)!r} vs python {BASE!r}")
    for k, v in found.items():
        if k not in CATALOG:
            problems.append(f"missing from python mirror: {k}")
        elif CATALOG[k] != v:
            problems.append(f"{k}: TS {v!r} vs python {CATALOG[k]!r}")
    for k in CATALOG:
        if k not in found:
            problems.append(f"stale in python mirror (not in TS): {k}")
    return problems


def _download(url: str, dest: str, timeout: float = 60.0) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "sofa-so-good/blender"})
    with urllib.request.urlopen(req, timeout=timeout) as r, open(dest, "wb") as f:
        f.write(r.read())


def write_procedural_sky(path: str, width: int = 256,
                         zenith: tuple[float, float, float] = (0.20, 0.38, 0.68),
                         horizon: tuple[float, float, float] = (0.72, 0.80, 0.88),
                         ground: tuple[float, float, float] = (0.16, 0.15, 0.14)) -> str:
    """Write a minimal equirectangular Radiance `.hdr` gradient sky.

    Hand-rolled rather than pulled from a library so the offline path has **no** extra
    dependency — Blender's bundled Python has no imageio/OpenEXR, and adding one would
    make the "works offline" claim false in a fresh checkout.

    Radiance RGBE, uncompressed (one flat scanline block). Blender reads this fine; it is
    not a general-purpose writer and is not meant to be.
    """
    h = width // 2
    rows: list[bytes] = []
    for y in range(h):
        # v: 0 at zenith .. 1 at nadir, matching equirect row order.
        v = (y + 0.5) / h
        alt = math.cos(v * math.pi)  # +1 zenith, -1 nadir
        if alt >= 0.0:
            t = alt
            rgb = tuple(horizon[i] + (zenith[i] - horizon[i]) * t for i in range(3))
        else:
            t = min(1.0, -alt * 3.0)
            rgb = tuple(horizon[i] + (ground[i] - horizon[i]) * t for i in range(3))
        row = bytearray()
        for _ in range(width):
            row += _rgbe(rgb)
        rows.append(bytes(row))
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n")
        f.write(f"-Y {h} +X {width}\n".encode())
        for row in rows:
            f.write(row)
    return path


def _rgbe(rgb: tuple[float, float, float]) -> bytes:
    m = max(rgb)
    if m <= 1e-32:
        return struct.pack("BBBB", 0, 0, 0, 0)
    mant, exp = math.frexp(m)
    scale = mant * 256.0 / m
    return struct.pack(
        "BBBB",
        min(255, int(rgb[0] * scale)),
        min(255, int(rgb[1] * scale)),
        min(255, int(rgb[2] * scale)),
        exp + 128,
    )


def resolve(name: str | None, allow_network: bool = True) -> tuple[str, str]:
    """Resolve an HDRI request to `(local_path, how)`.

    `how` is one of `path`, `cache`, `download`, `procedural` — returned so callers can
    log which route was taken instead of guessing, and so a silent fallback to the
    procedural sky is visible in the output rather than looking like a real HDRI.
    """
    if name and os.path.exists(name):
        return (name, "path")

    if name in (None, "", "procedural"):
        out = os.path.join(cache_dir(), "procedural_sky.hdr")
        if not os.path.exists(out):
            write_procedural_sky(out)
        return (out, "procedural")

    if name not in CATALOG:
        raise KeyError(
            f"unknown HDRI {name!r}; known ids: {', '.join(sorted(CATALOG))} "
            f"(or pass a file path, or 'procedural')"
        )

    dest = os.path.join(cache_dir(), CATALOG[name])
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return (dest, "cache")
    if not allow_network:
        out = os.path.join(cache_dir(), "procedural_sky.hdr")
        if not os.path.exists(out):
            write_procedural_sky(out)
        return (out, "procedural")
    try:
        _download(BASE + CATALOG[name], dest)
        return (dest, "download")
    except (urllib.error.URLError, TimeoutError, OSError):
        # Offline is a real failure mode; degrade rather than abort (goal constraint:
        # this layer must never block or crash).
        if os.path.exists(dest):
            os.remove(dest)
        out = os.path.join(cache_dir(), "procedural_sky.hdr")
        if not os.path.exists(out):
            write_procedural_sky(out)
        return (out, "procedural")
