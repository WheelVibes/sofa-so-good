#!/usr/bin/env python3
"""
redwood_3dscan_scraper.py — download the Redwood 3DScan dataset (RGB-D + meshes).

Source: http://redwood-data.org/3dscan/  ·  loader: https://github.com/isl-org/redwood-3dscan
License: *** PUBLIC DOMAIN — COMMERCIAL-SAFE *** (attribution requested, not required).
        The only fully commercial-usable dataset of the scanned set.
Access method: the official `redwood-3dscan` loader pattern. The repo ships JSON
        indexes (which scan ids have rgbd / mesh / video, plus category->ids) and
        the bytes are served from a public CDN. No form, no key.

This script reproduces the loader's URL scheme over stdlib HTTP so it needs no
extra dependency:
  index:  https://raw.githubusercontent.com/isl-org/redwood-3dscan/master/data/<name>.json
          (rgbds.json, meshes.json, videos.json, categories.json)
  rgbd:   https://redwood-3dscan.b-cdn.net/rgbd/<id>.zip
  mesh:   https://redwood-3dscan.b-cdn.net/mesh/<id>.ply
  video:  https://redwood-3dscan.b-cdn.net/video/<id>.mp4
(Override the CDN base with --cdn and the index base with --index-base if the
project moves them.)

LEGAL: Public domain — any use including commercial; attribution requested.
       Be polite to the CDN (default --rps low). Operator's responsibility.

RESUMABLE: one manifest item per (id, kind); re-run resumes. Each file is written
       via `.part` then renamed.
RATE-LIMITED: --rps with retry/backoff.

Stdlib only — no pip install needed.

Examples:
  # 20 meshes:
  python3 redwood_3dscan_scraper.py --kind mesh --limit 20

  # rgbd + mesh for everything in the "chair" + "sofa" categories:
  python3 redwood_3dscan_scraper.py --kind rgbd mesh --categories chair sofa

  # everything (large), resumable:
  python3 redwood_3dscan_scraper.py --kind rgbd mesh
"""
from __future__ import annotations

from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

INDEX_BASE = "https://raw.githubusercontent.com/isl-org/redwood-3dscan/master/data"
CDN = "https://redwood-3dscan.b-cdn.net"

KIND_PATH = {"rgbd": ("rgbd", "zip"), "mesh": ("mesh", "ply"), "video": ("video", "mp4")}
KIND_INDEX = {"rgbd": "rgbds.json", "mesh": "meshes.json", "video": "videos.json"}


def _load_index(http: HttpClient, index_base: str, name: str):
    return http.get_json(f"{index_base}/{name}")


def main() -> None:
    ap = common_argparser("redwood_3dscan", __doc__.strip().splitlines()[0])
    ap.add_argument("--kind", nargs="+", default=["mesh"], choices=list(KIND_PATH), help="data kinds to fetch")
    ap.add_argument("--categories", nargs="*", default=[], help="restrict to these category names (see categories.json)")
    ap.add_argument("--cdn", default=CDN, help="CDN base URL for the binary files")
    ap.add_argument("--index-base", default=INDEX_BASE, help="base URL for the JSON indexes")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    # Build the set of ids to consider, optionally filtered by category.
    category_ids: set[str] | None = None
    if args.categories:
        cats = _load_index(http, args.index_base, "categories.json")  # {category: [ids]}
        category_ids = set()
        for c in args.categories:
            ids = cats.get(c)
            if ids is None:
                _log(f"  ! unknown category '{c}' (skipping)")
                continue
            category_ids.update(str(i) for i in ids)
        _log(f"  category filter → {len(category_ids)} id(s)")

    items: list[dict] = []
    for kind in args.kind:
        available = _load_index(http, args.index_base, KIND_INDEX[kind])  # list of ids
        for sid in available:
            sid = str(sid)
            if category_ids is not None and sid not in category_ids:
                continue
            items.append({"id": sid, "kind": kind})
    _log(f"== Redwood 3DScan: {len(items)} (id,kind) item(s) queued ==")

    def handle(item: dict, manifest: Manifest) -> None:
        sid, kind = item["id"], item["kind"]
        subdir, ext = KIND_PATH[kind]
        url = f"{args.cdn}/{subdir}/{sid}.{ext}"
        dest = Path(args.out) / subdir / f"{sid}.{ext}"
        got = http.download_file(url, dest)
        _log(f"  {'↓' if got else '·'} {kind}/{sid}.{ext}")
        manifest.mark(f"{kind}:{sid}", downloaded=got)

    run_loop(items, out_dir=args.out, key_fn=lambda i: f"{i['kind']}:{i['id']}", handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
