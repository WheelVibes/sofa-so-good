#!/usr/bin/env python3
"""
threed_future_scraper.py — download the 3D-FUTURE furniture dataset from your
request-approved (emailed) links.

Source: https://tianchi.aliyun.com/specials/promotion/alibaba-3d-future
        toolbox: https://github.com/3D-FRONT-FUTURE
License: 3D-FUTURE Terms of Use — *** NON-COMMERCIAL research/eval ONLY ***
        (email + signed ToU). Commercial use is NOT granted. FLAG: research/dev-only.
Access method: REQUEST-GATED. The download links are NOT public — you obtain them
        by emailing the maintainers (3dfront@list.alibaba-inc.com) with the signed
        Terms of Use; they reply with time-limited URLs to the furniture model
        archive (and textures). This script does NOT request access for you — you
        paste the approved URL(s) here via flags or a config file.

  Per the dataset, the 3D-FUTURE distribution is the furniture meshes + textures.
  Provide the URL(s) you were emailed:
    --furniture-url <URL>     # 3D-FUTURE-model archive (the meshes)
    --textures-url  <URL>     # high-res designer textures (if a separate link)
  …or a JSON config: { "furniture_url": "...", "textures_url": "..." }
    --config links.json

Each archive is downloaded resumably (one manifest item) and, if it is a
.zip/.tar(.gz), extracted into --out (disable with --no-extract).

LEGAL: 3D-FUTURE ToU — non-commercial; respect the signed agreement. This tool
       only fetches links YOU were granted. Operator's responsibility.

RESUMABLE: per-archive manifest; `.part`-then-rename. RATE-LIMITED: --rps.
Stdlib only — no pip install needed.

Examples:
  python3 threed_future_scraper.py --furniture-url "https://.../3D-FUTURE-model.zip"
  python3 threed_future_scraper.py --config links.json --no-extract
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
    fu = args.furniture_url or cfg.get("furniture_url")
    tu = args.textures_url or cfg.get("textures_url")
    if fu:
        urls.append({"name": "3D-FUTURE-furniture", "url": fu})
    if tu:
        urls.append({"name": "3D-FUTURE-textures", "url": tu})
    # Allow arbitrary extra labelled links in the config: {"extra": {"label": "url"}}
    for label, url in (cfg.get("extra") or {}).items():
        urls.append({"name": label, "url": url})
    return urls


def main() -> None:
    ap = common_argparser("threed_future", __doc__.strip().splitlines()[0])
    ap.add_argument("--furniture-url", default="", help="emailed URL for the 3D-FUTURE furniture model archive")
    ap.add_argument("--textures-url", default="", help="emailed URL for the textures archive (if separate)")
    ap.add_argument("--config", default="", help="JSON file with furniture_url / textures_url / extra{}")
    ap.add_argument("--no-extract", dest="extract", action="store_false", default=True, help="do not unpack archives")
    args = ap.parse_args()

    items = _collect_urls(args)
    if not items:
        _log(
            "No download URLs provided. 3D-FUTURE is request-gated: email the signed\n"
            "Terms of Use to the maintainers, then pass the approved link(s) via\n"
            "--furniture-url / --textures-url or --config links.json."
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
