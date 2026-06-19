#!/usr/bin/env python3
"""
smithsonian3d_scraper.py — download Smithsonian Open Access CC0 3D models (GLB/glTF).

Source: https://3d.si.edu/cc0  ·  API: https://api.si.edu/openaccess/api/v1.0
License: CC0 — 2,000+ 3D models released to the public domain (part of the 2.8M-item
         Open Access release). Commercial use OK, NO attribution required. Recorded
         as CC0 in the manifest (the API also returns `usage` metadata we capture).
Programmatic access: Smithsonian Open Access API. Needs a FREE API key from
         https://api.data.gov (api.si.edu fronts data.gov). Pass it via --api-key
         or the API_KEY env var.
           GET /openaccess/api/v1.0/search?q=<query>&api_key=<key>&start=&rows=
         Each returned object has `content.descriptiveNonRepeating.online_media.media[]`;
         entries with `"type": "3D"` carry a `resources[]` list of downloadable model
         files (GLB/glTF/OBJ/USDZ) and a `content`/`thumbnail` viewer URL. This scraper
         filters items that expose a 3D media resource and downloads the model file(s).

LEGAL / ToS: CC0 assets are free to download/use/redistribute. Respect the
api.data.gov rate limits (default 1 rps here, back-off on 429). Decimate heavy
scans for real-time use downstream (see MODEL_LIBRARIES notes).

RESUMABLE: a JSON manifest records every completed object id; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  API_KEY=xxxx python3 smithsonian3d_scraper.py --query "vase" --limit 20
  python3 smithsonian3d_scraper.py --api-key xxxx --query "bust"
  python3 smithsonian3d_scraper.py --api-key xxxx --query "*"   # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
import sys
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

API = "https://api.si.edu/openaccess/api/v1.0"
_MODEL_EXT = re.compile(r"\.(glb|gltf|usdz|obj)(\?|$)", re.I)


def _search(http: HttpClient, query: str, api_key: str, start: int, rows: int) -> dict:
    params = {"q": query, "api_key": api_key, "start": str(start), "rows": str(rows)}
    return http.get_json(f"{API}/search?{urllib.parse.urlencode(params)}")


def _media_3d(obj: dict) -> list[dict]:
    """Return the 3D media entries for an Open Access object, if any."""
    try:
        media = (
            obj["content"]["descriptiveNonRepeating"]["online_media"]["media"]
        )
    except (KeyError, TypeError):
        return []
    return [m for m in media if str(m.get("type", "")).lower() == "3d"]


def _model_urls(media_entry: dict) -> list[str]:
    """Pull downloadable model-file URLs from a 3D media entry's resources."""
    urls: list[str] = []
    for res in media_entry.get("resources") or []:
        u = res.get("url") or res.get("URL")
        if u and _MODEL_EXT.search(u):
            urls.append(u)
    # Some records expose the file directly on `content`.
    c = media_entry.get("content")
    if c and _MODEL_EXT.search(c):
        urls.append(c)
    return list(dict.fromkeys(urls))


def main() -> None:
    ap = common_argparser("smithsonian3d", __doc__.strip().splitlines()[0])
    ap.add_argument("--query", default="furniture", help="search query (use '*' for everything)")
    ap.add_argument("--rows", type=int, default=100, help="rows per API page (max 1000)")
    args = ap.parse_args()

    if not args.api_key:
        _log("ERROR: Smithsonian Open Access needs a free API key. Pass --api-key or set API_KEY env.")
        _log("       Get one at https://api.data.gov/signup/  (used as api_key on api.si.edu)")
        sys.exit(2)

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    def iter_objects():
        start = 0
        while True:
            data = _search(http, args.query, args.api_key, start, args.rows)
            rows = (data.get("response") or {}).get("rows") or []
            if not rows:
                break
            for r in rows:
                yield r
            start += len(rows)
            total = (data.get("response") or {}).get("rowCount") or 0
            if total and start >= total:
                break

    _log(f"== Smithsonian 3D: query={args.query!r} ==")
    out_dir = str(Path(args.out))

    def key_fn(item: dict) -> str:
        return str(item.get("id") or item.get("url") or "")

    def handle(item: dict, manifest: Manifest) -> None:
        oid = key_fn(item)
        title = item.get("title") or oid
        entries = _media_3d(item)
        urls: list[str] = []
        for e in entries:
            urls.extend(_model_urls(e))
        urls = list(dict.fromkeys(urls))
        if not urls:
            manifest.mark(oid, skipped="no-3d-model", title=title)
            return
        n = 0
        for u in urls:
            name = urllib.parse.urlparse(u).path.split("/")[-1] or f"{oid}.glb"
            dest = Path(out_dir) / oid / name
            got = http.download_file(u, dest)
            n += 1 if got else 0
        _log(f"  ↓ {oid} — {title} ({len(urls)} file(s)) [CC0]")
        manifest.mark(oid, title=title, files=len(urls), license="CC0")

    run_loop(iter_objects(), out_dir=out_dir, key_fn=key_fn, handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
