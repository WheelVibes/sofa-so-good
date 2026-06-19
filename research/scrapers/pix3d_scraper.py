#!/usr/bin/env python3
"""
pix3d_scraper.py — download + extract the Pix3D dataset (furniture meshes with
pixel-aligned real photos, masks and poses).

Source: http://pix3d.csail.mit.edu/
License: *** NON-COMMERCIAL research ONLY *** (per-source; includes IKEA-derived
        models). FLAG: research/dev-only — do NOT ship.
Access method: a single OPEN zip from the project page (no form, no key):
        https://pix3d.csail.mit.edu/data/pix3d.zip
        It bundles ~395 furniture models (OBJ) + images + masks + pose JSON.

LEGAL: Pix3D research license — non-commercial only. Operator's responsibility.

RESUMABLE: the zip is one manifest item; `.part`-then-rename, so an interrupted
        download resumes. Re-running after a complete download skips it.
RATE-LIMITED: --rps with retry/backoff.

Stdlib only — no pip install needed.

Examples:
  python3 pix3d_scraper.py
  python3 pix3d_scraper.py --no-extract
  python3 pix3d_scraper.py --url https://pix3d.csail.mit.edu/data/pix3d.zip
"""
from __future__ import annotations

import zipfile
from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

DEFAULT_URL = "https://pix3d.csail.mit.edu/data/pix3d.zip"


def main() -> None:
    ap = common_argparser("pix3d", __doc__.strip().splitlines()[0])
    ap.add_argument("--url", default=DEFAULT_URL, help="Pix3D zip URL")
    ap.add_argument("--no-extract", dest="extract", action="store_false", default=True, help="download only, do not unzip")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)
    out = Path(args.out)
    fname = args.url.split("?")[0].rstrip("/").split("/")[-1] or "pix3d.zip"

    items = [{"name": "pix3d", "url": args.url, "fname": fname}]

    def handle(item: dict, manifest: Manifest) -> None:
        dest = out / item["fname"]
        _log(f"  ↓ {item['fname']} (~3.5 GB)…")
        http.download_file(item["url"], dest)
        if args.extract:
            if zipfile.is_zipfile(dest):
                _log(f"  ⇲ extracting {item['fname']}…")
                with zipfile.ZipFile(dest) as z:
                    z.extractall(out)
            else:
                _log(f"  ! {item['fname']} is not a valid zip; skipping extract")
        manifest.mark(item["name"], file=item["fname"], extracted=args.extract)

    run_loop(items, out_dir=args.out, key_fn=lambda i: i["name"], handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
