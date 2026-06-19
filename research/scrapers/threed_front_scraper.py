#!/usr/bin/env python3
"""
threed_front_scraper.py — download the 3D-FRONT furnished-room/scene dataset from
your request-approved (emailed) links.

Source: https://tianchi.aliyun.com/dataset/65347  ·  arXiv 2011.09127
        toolbox: https://github.com/3D-FRONT-FUTURE
License: Alibaba 3D-FRONT terms (reported CC BY-NC 4.0) — *** NON-COMMERCIAL ONLY ***.
        FLAG: research/dev-only. The value here is realistic room LAYOUTS/scene
        composition (JSON scenes), furnished using 3D-FUTURE meshes.
Access method: REQUEST-GATED. Links arrive by email after you sign the Terms of
        Use (same channel as 3D-FUTURE: 3dfront@list.alibaba-inc.com). This script
        does NOT request access — you paste the approved URL(s) via flags/config.

  3D-FRONT typically ships as THREE archives (the brief names them explicitly):
    --house-url    <URL>   # 3D-FRONT house/scene JSON layouts
    --furniture-url <URL>  # 3D-FUTURE furniture meshes used by the scenes
    --textures-url  <URL>  # textures
  …or a JSON config: { "house_url": "...", "furniture_url": "...", "textures_url": "..." }
    --config links.json

Each archive downloads resumably (one manifest item) and, if zip/tar(.gz), is
extracted into --out (disable with --no-extract).

LEGAL: 3D-FRONT terms (CC BY-NC 4.0) — non-commercial; honour your signed ToU.
       This tool only fetches links YOU were granted. Operator's responsibility.

RESUMABLE: per-archive manifest; `.part`-then-rename. RATE-LIMITED: --rps.
Stdlib only — no pip install needed.

Examples:
  python3 threed_front_scraper.py \
      --house-url "https://.../3D-FRONT.zip" \
      --furniture-url "https://.../3D-FUTURE-model.zip" \
      --textures-url "https://.../3D-FRONT-texture.zip"
  python3 threed_front_scraper.py --config links.json
"""
from __future__ import annotations

import json
import sys
import tarfile
import zipfile
from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop


def _extract(path: Path, out: Path) -> None:
    if zipfile.is_zipfile(path):
        _log(f"  ⇲ extracting {path.name} (zip)…")
        with zipfile.ZipFile(path) as z:
            z.extractall(out)
    elif tarfile.is_tarfile(path):
        _log(f"  ⇲ extracting {path.name} (tar)…")
        with tarfile.open(path) as t:
            t.extractall(out)  # noqa: S202 — operator-supplied trusted archive
    else:
        _log(f"  (not an archive, left as-is: {path.name})")


def _collect_urls(args) -> list[dict]:
    urls: list[dict] = []
    cfg = {}
    if args.config:
        cfg = json.loads(Path(args.config).read_text())
    mapping = [
        ("3D-FRONT-house", args.house_url or cfg.get("house_url")),
        ("3D-FUTURE-furniture", args.furniture_url or cfg.get("furniture_url")),
        ("3D-FRONT-textures", args.textures_url or cfg.get("textures_url")),
    ]
    for name, url in mapping:
        if url:
            urls.append({"name": name, "url": url})
    for label, url in (cfg.get("extra") or {}).items():
        urls.append({"name": label, "url": url})
    return urls


def main() -> None:
    ap = common_argparser("threed_front", __doc__.strip().splitlines()[0])
    ap.add_argument("--house-url", default="", help="emailed URL for the 3D-FRONT house/scene archive")
    ap.add_argument("--furniture-url", default="", help="emailed URL for the 3D-FUTURE furniture archive")
    ap.add_argument("--textures-url", default="", help="emailed URL for the textures archive")
    ap.add_argument("--config", default="", help="JSON file with house_url / furniture_url / textures_url / extra{}")
    ap.add_argument("--no-extract", dest="extract", action="store_false", default=True, help="do not unpack archives")
    args = ap.parse_args()

    items = _collect_urls(args)
    if not items:
        _log(
            "No download URLs provided. 3D-FRONT is request-gated: sign the Terms of\n"
            "Use and email the maintainers, then pass the approved link(s) via\n"
            "--house-url / --furniture-url / --textures-url or --config links.json."
        )
        sys.exit(1)

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)
    out = Path(args.out)

    def handle(item: dict, manifest: Manifest) -> None:
        name, url = item["name"], item["url"]
        fname = url.split("?")[0].rstrip("/").split("/")[-1] or f"{name}.bin"
        dest = out / fname
        _log(f"  ↓ {name} → {fname}")
        http.download_file(url, dest)
        if args.extract:
            _extract(dest, out)
        manifest.mark(name, file=fname, extracted=args.extract)

    run_loop(items, out_dir=args.out, key_fn=lambda i: i["name"], handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
